#!/usr/bin/env node
/**
 * Add/update a test-roster volunteer, mint invite, email link to a coordinator (not the volunteer).
 *
 * Run on laptop (test DB):
 *   cd ~/private-server-test
 *   node --env-file=.env scripts/send-volunteer-test-invite.mjs \
 *     --name "Scott Merwin" --email smerwin@umich.edu --phone "734-576-2398" \
 *     --send-to djlewis@triadic.com
 */
import { query } from '../src/db.js';
import {
  mintVolunteerInviteForRetreat,
  volunteerHasSelfServiceContact,
} from '../src/jewelheart/jewelheart-volunteer-invite.js';

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const displayName = arg('--name') || 'Scott Merwin';
const email = arg('--email') || 'smerwin@umich.edu';
const phone = arg('--phone') || '734-576-2398';
const sendTo = arg('--send-to') || 'djlewis@triadic.com';
const retreatIdArg = arg('--retreat-id');

async function resolveRetreatId() {
  if (retreatIdArg) return retreatIdArg;
  const envId = process.env.JEWELHEART_PEOPLE_TEST_RETREAT_ID?.trim();
  if (envId) return envId;
  const { rows } = await query(
    `SELECT id FROM jewelheart_retreats WHERE start_date = '2026-07-20'::date ORDER BY created_at LIMIT 1`,
  );
  if (rows[0]?.id) return rows[0].id;
  const any = await query(`SELECT id FROM jewelheart_retreats ORDER BY start_date DESC LIMIT 1`);
  if (!any.rows[0]?.id) throw new Error('No retreat found');
  return any.rows[0].id;
}

async function upsertVolunteer() {
  const { rows: byEmail } = await query(
    `SELECT id FROM jewelheart_volunteers WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
    [email],
  );
  if (byEmail[0]?.id) {
    await query(
      `UPDATE jewelheart_volunteers
       SET display_name = $2, phone = $3, updated_at = now()
       WHERE id = $1`,
      [byEmail[0].id, displayName, phone],
    );
    return byEmail[0].id;
  }
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits) {
    const { rows: byPhone } = await query(
      `SELECT id FROM jewelheart_volunteers
       WHERE phone IS NOT NULL
         AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = right($1, 10)
       LIMIT 1`,
      [phoneDigits],
    );
    if (byPhone[0]?.id) {
      await query(
        `UPDATE jewelheart_volunteers
         SET display_name = $2, email = $3, updated_at = now()
         WHERE id = $1`,
        [byPhone[0].id, displayName, email],
      );
      return byPhone[0].id;
    }
  }
  const { rows } = await query(
    `INSERT INTO jewelheart_volunteers (display_name, email, phone)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [displayName, email, phone],
  );
  return rows[0].id;
}

async function linkRetreat(retreatId, volunteerId) {
  await query(
    `INSERT INTO jewelheart_retreat_volunteers (retreat_id, volunteer_id)
     VALUES ($1, $2)
     ON CONFLICT (retreat_id, volunteer_id) DO NOTHING`,
    [retreatId, volunteerId],
  );
}

async function sendgridSend({ to, subject, text, html }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error('SENDGRID_API_KEY not set on server');
  const from = process.env.SENDGRID_FROM_EMAIL || process.env.JEWELHEART_FROM_EMAIL;
  if (!from) throw new Error('SENDGRID_FROM_EMAIL / JEWELHEART_FROM_EMAIL not set');
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: 'JewelHeart Retreat Volunteers' },
      reply_to: { email: sendTo, name: 'David Lewis' },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`sendgrid_${res.status}: ${t.slice(0, 500)}`);
  }
}

const retreatId = await resolveRetreatId();
const volunteerId = await upsertVolunteer();
await linkRetreat(retreatId, volunteerId);

const { rows: volRows } = await query(
  `SELECT display_name AS "displayName", email, phone FROM jewelheart_volunteers WHERE id = $1`,
  [volunteerId],
);
const vol = volRows[0];
if (!volunteerHasSelfServiceContact(vol)) {
  throw new Error('Volunteer missing email/phone after upsert');
}

const invite = await mintVolunteerInviteForRetreat(query, retreatId, volunteerId, 'invite-script');
const loginUrl = process.env.JEWELHEART_VOLUNTEER_LOGIN_URL || 'https://karmadots.org/testerslogin/';
const expires = new Date(invite.expiresAt).toLocaleString('en-US', {
  timeZone: 'America/New_York',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const subject = `JewelHeart test invite — ${displayName} (forward to volunteer)`;
const text = `David,

This is the JewelHeart TEST invite for Scott Merwin (Summer 2026 volunteer roster).

Forward the link below to Scott when you are ready. He should open it on his phone, then sign in with EITHER:
  • Email: ${email}
  • Phone SMS: ${phone}

Personal invite link (one-time setup):
${invite.inviteUrl}

Test login page: ${loginUrl}

Link expires: ${expires} Eastern

Notes for Scott:
• This is the test environment (not production).
• After the first visit, he can bookmark ${loginUrl} and sign in without the link.
• Account and Preferences screens let him confirm contact info and daily reminder toggles.

— JewelHeart test deploy
`;

const html = `<div style="font-family:system-ui,sans-serif;max-width:36em;line-height:1.45;color:#222">
<p>David,</p>
<p>This is the JewelHeart <strong>TEST</strong> invite for <strong>Scott Merwin</strong> (Summer 2026 volunteer roster).</p>
<p>Forward the link below to Scott when you are ready. He should open it on his phone, then sign in with <strong>either</strong>:</p>
<ul>
  <li>Email: <code>${email}</code></li>
  <li>Phone SMS: <code>${phone}</code></li>
</ul>
<p><a href="${invite.inviteUrl}" style="display:inline-block;background:#92160e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open personal invite link</a></p>
<p style="word-break:break-all;font-size:0.9em;color:#555">${invite.inviteUrl}</p>
<p>Test login page: <a href="${loginUrl}">${loginUrl}</a><br>
Link expires: <strong>${expires} Eastern</strong></p>
<p>Notes for Scott:</p>
<ul>
  <li>This is the test environment (not production).</li>
  <li>After the first visit, he can bookmark the login page and sign in without the link.</li>
  <li>Account and Preferences let him confirm contact info and daily reminder toggles.</li>
</ul>
</div>`;

const mailResult = await sendgridSend({ to: sendTo, subject, text, html });

console.log(
  JSON.stringify(
    {
      retreatId,
      volunteerId,
      displayName: vol.displayName,
      email: vol.email,
      phone: vol.phone,
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
      emailedTo: sendTo,
      mailResult,
    },
    null,
    2,
  ),
);
