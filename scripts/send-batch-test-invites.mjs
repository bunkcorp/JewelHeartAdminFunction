#!/usr/bin/env node
/**
 * Send the July 2026 test volunteer invite email to a batch (test env).
 * Run on laptop: cd ~/private-server-test && node --env-file=.env scripts/send-batch-test-invites.mjs
 */
import { query } from '../src/db.js';
import {
  mintVolunteerInviteForRetreat,
  volunteerHasSelfServiceContact,
} from '../src/jewelheart/jewelheart-volunteer-invite.js';
import { normalizeEmail } from '../src/jewelheart/jewelheart-auth-identity.js';

const RETREAT_ID = '34d43115-67b3-5fbf-9173-abb051c11ca7';
const CC = normalizeEmail(process.env.JEWELHEART_INVITE_CC_EMAIL || 'djlewis@triadic.com');

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const DEFAULT_VOLUNTEERS = [
  { id: '1a8897b8-edff-4e5b-8e8e-3ff69838d953', first: 'Wendy' },
  { id: '61347083-7ba5-4503-90c3-98c8f465edfa', first: 'John' },
  { id: '8ee571ce-5ce1-4ce5-8fbf-bfe1bc45e95e', first: 'Ann' },
];

async function resolveVolunteers() {
  const id = arg('--id');
  const email = arg('--email');
  if (id) return [{ id, first: arg('--first') || '' }];
  if (email) {
    const { rows } = await query(
      `SELECT id, display_name AS "displayName" FROM jewelheart_volunteers WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
      [email],
    );
    if (!rows[0]) throw new Error(`no volunteer for email: ${email}`);
    return [{ id: rows[0].id, first: firstName(rows[0].displayName, '') }];
  }
  return DEFAULT_VOLUNTEERS;
}

function loginUrl() {
  const u = String(process.env.JEWELHEART_VOLUNTEER_LOGIN_URL || 'https://karmadots.org/testerslogin/').trim();
  if (/\.html$/i.test(u.replace(/\/+$/, ''))) return u.replace(/\/+$/, '');
  return u.endsWith('/') ? u : `${u}/`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(displayName, fallback) {
  const n = String(displayName || '').trim().split(/\s+/)[0];
  return n || fallback;
}

function buildBodies({ first, inviteUrl, email, phone, expires }) {
  const subject = 'JewelHeart volunteer app — please test sign-in';
  const text = `Hello ${first},

Thanks for agreeing to test logging in to a test version of the JewelHeart volunteer app for the July 2026 Summer Retreat.

Your personal sign-up link (tap once on your phone to get started):
${inviteUrl}

This link is personal to you — please don't share it with other volunteers.

If sign-in or "Add to Home Screen" acts oddly, copy the link and paste it into your phone's web browser (Safari or Chrome).

How to sign in

Use the same email or mobile number we have on the roster for you:
  Email: ${email}
  Phone: ${phone}

Your phone number may already be filled in on the sign-in page. Tap Send code when you're ready.

On the sign-in page you can use:
  • Google (if that account uses your roster email above), or
  • Phone — tap Send code, enter the 6-digit text you receive, then Phone sign-in

The email/phone must match what we have on file, or sign-in won't complete.

The main point of this test is to prove out the login procedure.

This is a test version of the app. You will see jobs that may not match the final retreat schedule. Nevertheless, please feel free to browse open shifts (a job on a day) and sign up for a few. Any feedback will be very valuable as we finish the app.

You will notice that, for most jobs, there is no specific time — that's up to the volunteer, as with prior Merit Boards. A few jobs (like make coffee) have specific times.

If something breaks or confuses you, reply to this email, or contact me (David) at djlewis@triadic.com or 978-618-5709.

Optional: add to your home screen

Once signed in, on an iPhone in Safari: Share → Add to Home Screen. That gives you a "JewelHeart" icon for quick access later. You can sign in again from that shortcut without the invite link. On Android, use the menu and Add to Home screen.

Your personal link expires: ${expires} Eastern. If it expires before you finish, ask us and we'll send a new one.

Thank you for helping us test this.

— David Lewis
djlewis@triadic.com · 978-618-5709
`;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:36em;line-height:1.45;color:#222">
<p>Hello ${escapeHtml(first)},</p>
<p>Thanks for agreeing to test logging in to a test version of the JewelHeart volunteer app for the <strong>July 2026 Summer Retreat</strong>.</p>
<p><strong>Your personal sign-up link (tap once on your phone to get started):</strong><br>
<a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#92160e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;margin:0.5em 0">Open my invite link</a><br>
<span style="word-break:break-all;font-size:0.9em;color:#555">${escapeHtml(inviteUrl)}</span></p>
<p><em>This link is personal to you — please don't share it with other volunteers.</em></p>
<p>If sign-in or “Add to Home Screen” acts oddly, copy the link and paste it into your phone's web browser (Safari or Chrome).</p>
<p><strong>How to sign in</strong></p>
<p>Use the <strong>same email or mobile number</strong> we have on the roster for you:</p>
<ul>
  <li>Email: ${escapeHtml(email)}</li>
  <li>Phone: ${escapeHtml(phone)}</li>
</ul>
<p>Your phone number may already be filled in on the sign-in page. Tap <strong>Send code</strong> when you're ready.</p>
<p>On the sign-in page you can use:</p>
<ul>
  <li><strong>Google</strong> (if that account uses your roster email above), or</li>
  <li><strong>Phone</strong> — tap <strong>Send code</strong>, enter the 6-digit text you receive, then <strong>Phone sign-in</strong></li>
</ul>
<p>The email/phone must match what we have on file, or sign-in won't complete.</p>
<p>The main point of this test is to prove out the login procedure.</p>
<p>This is a test version of the app. You will see jobs that may not match the final retreat schedule. Nevertheless, please feel free to browse open shifts (a job on a day) and sign up for a few. Any feedback will <strong>be</strong> very valuable as we finish the app.</p>
<p>You will notice that, for most jobs, there is no specific time — that's up to the volunteer, as with prior Merit Boards. A few jobs (like make coffee) have specific times.</p>
<p>If something breaks or confuses you, reply to this email, or contact me (David) at <a href="mailto:djlewis@triadic.com">djlewis@triadic.com</a> or 978-618-5709.</p>
<p><strong>Optional: add to your home screen</strong></p>
<p>Once signed in, on an iPhone in Safari: <strong>Share → Add to Home Screen</strong>. On Android, use the menu and <strong>Add to Home screen</strong>.</p>
<p>Your personal link expires: <strong>${escapeHtml(expires)} Eastern</strong>. If it expires before you finish, ask us and we'll send a new one.</p>
<p>Thank you for helping us test this.</p>
<p>— David Lewis<br>djlewis@triadic.com · 978-618-5709</p>
</div>`;

  return { subject, text, html };
}

async function sendgrid({ to, subject, text, html }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error('SENDGRID_API_KEY not set');
  const from = process.env.SENDGRID_FROM_EMAIL || process.env.JEWELHEART_FROM_EMAIL;
  if (!from) throw new Error('SENDGRID_FROM_EMAIL not set');
  const personalization = { to: [{ email: to }] };
  if (CC && CC !== to) personalization.cc = [{ email: CC }];
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [personalization],
      from: { email: from, name: 'JewelHeart Retreat Volunteers' },
      reply_to: { email: CC || from, name: 'David Lewis' },
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

const results = [];
const VOLUNTEERS = await resolveVolunteers();
for (const v of VOLUNTEERS) {
  const { rows } = await query(
    `SELECT id, display_name AS "displayName", email, phone FROM jewelheart_volunteers WHERE id = $1`,
    [v.id],
  );
  const row = rows[0];
  if (!row) throw new Error(`volunteer not found: ${v.id}`);
  if (!volunteerHasSelfServiceContact(row)) throw new Error(`no email/phone: ${row.displayName}`);
  const to = normalizeEmail(row.email);
  if (!to) throw new Error(`no email: ${row.displayName}`);

  const invite = await mintVolunteerInviteForRetreat(query, RETREAT_ID, row.id, 'batch-test-invites');
  const expires = new Date(invite.expiresAt).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const first = firstName(row.displayName, v.first);
  const phone = String(row.phone || '').trim();
  const { subject, text, html } = buildBodies({
    first,
    inviteUrl: invite.inviteUrl,
    email: to,
    phone,
    expires,
  });
  await sendgrid({ to, subject, text, html });
  results.push({
    displayName: row.displayName,
    emailedTo: to,
    cc: CC,
    inviteUrl: invite.inviteUrl,
    expiresAt: invite.expiresAt,
    phoneNote: phone === '1' ? 'roster phone invalid — use Google sign-in' : null,
  });
}

console.log(JSON.stringify({ ok: true, loginPage: loginUrl(), results }, null, 2));
