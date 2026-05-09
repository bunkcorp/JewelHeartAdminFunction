/**
 * JewelHeart — transactional email (SendGrid) + SMS (Twilio) for volunteer flows
 * ================================================================================
 *
 * Depends on: `jewelheart-assignment-confirmation.fragment.js` (same directory) for
 * `signAssignmentConfirmationToken` (uses `CALENDAR_CONFIRM_SECRET`) when a sealed
 * confirmation link is included (create + day-before reminders).
 *
 * Handlers (all return a summary object and **never throw** to callers):
 *
 * - `notifyAfterAssignmentCreated` — after `INSERT` into `jewelheart_assignments`.
 * - `notifyAfterAssignmentRemoved` — **before** `DELETE` that removes the row (needs the
 *   assignment still present for the JOIN that loads job/slot/retreat labels).
 * - `notifyAfterCalendarFeedChanged` — optional; wired from calendar-feed fragment when
 *   `volunteerNotify` is passed into `createJewelHeartCalendarHandlers`.
 * - `notifyDayBeforeShiftReminders` — cron / scheduled job: finds shifts whose **slot
 *   date is tomorrow in each retreat’s `jewelheart_retreats.timezone`**, sends once per
 *   assignment (`migrations/003_jewelheart_assignment_day_before_reminder.sql`).
 *
 *   const { createJewelHeartVolunteerNotify } = require('./jewelheart-volunteer-notify.fragment.cjs');
 *   const notify = createJewelHeartVolunteerNotify({ query });
 *   await notify.notifyAfterAssignmentCreated({ retreatId, taskId, assignmentId, volunteerId });
 *
 * Env (all optional until you enable each channel):
 *   CALENDAR_CONFIRM_SECRET     — required for sealed links (same as confirmation routes).
 *   JEWELHEART_PUBLIC_ORIGIN    — base URL for links, e.g. https://api.karmadots.org
 *
 * Email (SendGrid HTTP API — no npm dependency on Node 18+):
 *   SENDGRID_API_KEY
 *   SENDGRID_FROM_EMAIL  — or JEWELHEART_FROM_EMAIL
 *
 * SMS (Twilio REST):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER  (E.164)
 *   TWILIO_DEFAULT_COUNTRY_CODE — optional, default "1" (prepend to 10-digit US numbers)
 */

'use strict';

const path = require('path');

function loadSignAssignmentConfirmationToken() {
  const base = path.join(__dirname, 'jewelheart-assignment-confirmation.fragment');
  try {
    return require(`${base}.cjs`).signAssignmentConfirmationToken;
  } catch {
    return require(`${base}.js`).signAssignmentConfirmationToken;
  }
}

const signAssignmentConfirmationToken = loadSignAssignmentConfirmationToken();

function originBase() {
  const e = process.env.JEWELHEART_PUBLIC_ORIGIN;
  if (e && typeof e === 'string') return e.replace(/\/+$/u, '');
  return 'https://api.karmadots.org';
}

function confirmSecret() {
  const s = process.env.CALENDAR_CONFIRM_SECRET;
  return typeof s === 'string' && s.length >= 8 ? s : null;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendgridSend({ to, subject, text, html }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return { skipped: true, channel: 'email', reason: 'no_sendgrid_api_key' };
  const from = process.env.SENDGRID_FROM_EMAIL || process.env.JEWELHEART_FROM_EMAIL;
  if (!from) return { skipped: true, channel: 'email', reason: 'no_from_email' };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html || `<pre style="font-family:system-ui">${escapeHtml(text)}</pre>` },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`sendgrid_${res.status}: ${t.slice(0, 500)}`);
  }
  return { ok: true, channel: 'email' };
}

function normalizeSmsTo(toRaw) {
  let d = String(toRaw || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) return d;
  if (d.length === 10) {
    const cc = process.env.TWILIO_DEFAULT_COUNTRY_CODE || '1';
    return `+${cc}${d}`;
  }
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

async function twilioSendSms({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { skipped: true, channel: 'sms', reason: 'no_twilio_env' };
  const toE164 = normalizeSmsTo(to);
  if (!toE164) return { skipped: true, channel: 'sms', reason: 'invalid_phone' };

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: toE164, From: from, Body: body.slice(0, 1500) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`twilio_${res.status}: ${t.slice(0, 500)}`);
  }
  return { ok: true, channel: 'sms' };
}

/**
 * @param {object} deps
 * @param {(text:string, params?:any[]) => Promise<{ rows: any[] }>} deps.query
 */
function createJewelHeartVolunteerNotify(deps) {
  const { query } = deps;

  /**
   * @param {{ retreatId: string, taskId: string, assignmentId: string, volunteerId: string }} p
   * @returns {Promise<object>} summary (never throws)
   */
  async function notifyAfterAssignmentCreated(p) {
    const out = { attempted: true, results: [] };
    try {
      const secret = confirmSecret();
      if (!secret) {
        out.skipped = true;
        out.reason = 'no_calendar_confirm_secret';
        return out;
      }

      const { rows: vr } = await query(
        `SELECT display_name, email, phone, notify_email, notify_sms
         FROM jewelheart_volunteers WHERE id = $1`,
        [p.volunteerId],
      );
      if (!vr.length) {
        out.skipped = true;
        out.reason = 'volunteer_not_found';
        return out;
      }
      const v = vr[0];
      const wantEmail = v.notify_email !== false;
      const wantSms = v.notify_sms === true;

      const { rows: dr } = await query(
        `SELECT r.name AS retreat_name, j.title AS job_title, s.label AS slot_label, s.slot_date::text AS slot_date
         FROM jewelheart_assignments a
         JOIN jewelheart_tasks t ON t.id = a.task_id
         JOIN jewelheart_jobs j ON j.id = t.job_id
         JOIN jewelheart_slots s ON s.id = t.slot_id AND s.retreat_id = t.retreat_id
         JOIN jewelheart_retreats r ON r.id = t.retreat_id
         WHERE a.id = $1 AND a.volunteer_id = $2`,
        [p.assignmentId, p.volunteerId],
      );
      const detail = dr[0] || {};
      const retreatName = String(detail.retreat_name || 'Retreat');
      const jobTitle = String(detail.job_title || 'Volunteer shift');
      const slotLabel = String(detail.slot_label || '');
      const slotDate = String(detail.slot_date || '');

      const exp = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
      const sealed = signAssignmentConfirmationToken(
        { assignmentId: p.assignmentId, volunteerId: p.volunteerId, exp },
        secret,
      );
      const base = originBase();
      const confirmPath = `/jewelheart/assignment-confirmations/${encodeURIComponent(sealed)}`;
      const confirmUrl = `${base}${confirmPath}`;

      const subject = `Volunteer shift: ${jobTitle}`;
      const text =
        `${v.display_name || 'Volunteer'},\n\n` +
        `You're signed up for "${jobTitle}"` +
        (slotLabel ? ` (${slotLabel})` : '') +
        (slotDate ? ` on ${slotDate}` : '') +
        ` — ${retreatName}.\n\n` +
        `Calendar: use Subscribe in Calendar in the JewelHeart app, or refresh your subscribed feed.\n\n` +
        `Still planning to do this shift? Open this link (no sign-in required):\n${confirmUrl}\n\n` +
        `You can confirm or withdraw there. If you ignore this message, your signup stays as-is.\n`;

      const html =
        `<p>Hi ${escapeHtml(v.display_name || 'volunteer')},</p>` +
        `<p>You're signed up for <strong>${escapeHtml(jobTitle)}</strong>` +
        (slotLabel ? ` <span style="color:#555">(${escapeHtml(slotLabel)})</span>` : '') +
        (slotDate ? ` on <strong>${escapeHtml(slotDate)}</strong>` : '') +
        ` — ${escapeHtml(retreatName)}.</p>` +
        `<p><a href="${escapeHtml(confirmUrl)}">Open confirmation page</a> (keep or withdraw). ` +
        `If you do nothing, your assignment stays.</p>` +
        `<p style="font-size:12px;color:#666">Add your shifts to Apple/Google Calendar from the app.</p>`;

      const email = typeof v.email === 'string' ? v.email.trim() : '';
      if (wantEmail && email) {
        try {
          out.results.push(await sendgridSend({ to: email, subject, text, html }));
        } catch (e) {
          out.results.push({ channel: 'email', error: String(e && e.message) });
        }
      } else {
        out.results.push({
          skipped: true,
          channel: 'email',
          reason: wantEmail ? 'no_email_on_profile' : 'notify_email_disabled',
        });
      }

      const phone = typeof v.phone === 'string' ? v.phone.trim() : '';
      if (wantSms && phone) {
        const smsBody =
          `JewelHeart: ${jobTitle}${slotDate ? ` ${slotDate}` : ''}. Confirm/withdraw: ${confirmUrl}`.slice(
            0,
            1480,
          );
        try {
          out.results.push(await twilioSendSms({ to: phone, body: smsBody }));
        } catch (e) {
          out.results.push({ channel: 'sms', error: String(e && e.message) });
        }
      } else {
        out.results.push({
          skipped: true,
          channel: 'sms',
          reason: wantSms ? 'no_phone_on_profile' : 'notify_sms_disabled',
        });
      }

      return out;
    } catch (e) {
      out.error = String(e && e.message);
      return out;
    }
  }

  /**
   * Call **before** deleting the assignment row so detail JOINs still work.
   *
   * @param {{ volunteerId: string, assignmentId: string }} p
   */
  async function notifyAfterAssignmentRemoved(p) {
    const out = { attempted: true, results: [] };
    try {
      const { rows: vr } = await query(
        `SELECT display_name, email, phone, notify_email, notify_sms
         FROM jewelheart_volunteers WHERE id = $1`,
        [p.volunteerId],
      );
      if (!vr.length) {
        out.skipped = true;
        out.reason = 'volunteer_not_found';
        return out;
      }
      const v = vr[0];
      const wantEmail = v.notify_email !== false;
      const wantSms = v.notify_sms === true;

      const { rows: dr } = await query(
        `SELECT r.name AS retreat_name, j.title AS job_title, s.label AS slot_label, s.slot_date::text AS slot_date
         FROM jewelheart_assignments a
         JOIN jewelheart_tasks t ON t.id = a.task_id
         JOIN jewelheart_jobs j ON j.id = t.job_id
         JOIN jewelheart_slots s ON s.id = t.slot_id AND s.retreat_id = t.retreat_id
         JOIN jewelheart_retreats r ON r.id = t.retreat_id
         WHERE a.id = $1 AND a.volunteer_id = $2`,
        [p.assignmentId, p.volunteerId],
      );
      if (!dr.length) {
        out.skipped = true;
        out.reason = 'assignment_not_found';
        return out;
      }
      const detail = dr[0];
      const retreatName = String(detail.retreat_name || 'Retreat');
      const jobTitle = String(detail.job_title || 'Volunteer shift');
      const slotLabel = String(detail.slot_label || '');
      const slotDate = String(detail.slot_date || '');

      const subject = `Volunteer shift removed: ${jobTitle}`;
      const text =
        `${v.display_name || 'Volunteer'},\n\n` +
        `You're no longer signed up for "${jobTitle}"` +
        (slotLabel ? ` (${slotLabel})` : '') +
        (slotDate ? ` on ${slotDate}` : '') +
        ` — ${retreatName}.\n\n` +
        `If you did not expect this, contact the retreat coordinator.\n`;

      const html =
        `<p>Hi ${escapeHtml(v.display_name || 'volunteer')},</p>` +
        `<p>You're <strong>no longer signed up</strong> for <strong>${escapeHtml(jobTitle)}</strong>` +
        (slotLabel ? ` <span style="color:#555">(${escapeHtml(slotLabel)})</span>` : '') +
        (slotDate ? ` on <strong>${escapeHtml(slotDate)}</strong>` : '') +
        ` — ${escapeHtml(retreatName)}.</p>` +
        `<p>If you didn't expect this, contact the retreat coordinator.</p>`;

      const email = typeof v.email === 'string' ? v.email.trim() : '';
      if (wantEmail && email) {
        try {
          out.results.push(await sendgridSend({ to: email, subject, text, html }));
        } catch (e) {
          out.results.push({ channel: 'email', error: String(e && e.message) });
        }
      } else {
        out.results.push({
          skipped: true,
          channel: 'email',
          reason: wantEmail ? 'no_email_on_profile' : 'notify_email_disabled',
        });
      }

      const phone = typeof v.phone === 'string' ? v.phone.trim() : '';
      if (wantSms && phone) {
        const smsBody =
          `JewelHeart: removed from ${jobTitle}${slotDate ? ` ${slotDate}` : ''} (${retreatName}).`.slice(0, 1480);
        try {
          out.results.push(await twilioSendSms({ to: phone, body: smsBody }));
        } catch (e) {
          out.results.push({ channel: 'sms', error: String(e && e.message) });
        }
      } else {
        out.results.push({
          skipped: true,
          channel: 'sms',
          reason: wantSms ? 'no_phone_on_profile' : 'notify_sms_disabled',
        });
      }

      return out;
    } catch (e) {
      out.error = String(e && e.message);
      return out;
    }
  }

  /**
   * @param {{ volunteerId: string, action: 'minted'|'rotated'|'revoked', subscribeHttpsUrl?: string, webcalSubscribeUrl?: string }} p
   */
  async function notifyAfterCalendarFeedChanged(p) {
    const out = { attempted: true, results: [] };
    try {
      const { rows: vr } = await query(
        `SELECT display_name, email, phone, notify_email, notify_sms
         FROM jewelheart_volunteers WHERE id = $1`,
        [p.volunteerId],
      );
      if (!vr.length) {
        out.skipped = true;
        out.reason = 'volunteer_not_found';
        return out;
      }
      const v = vr[0];
      const wantEmail = v.notify_email !== false;
      const wantSms = v.notify_sms === true;

      const action = p.action;
      const httpsUrl = typeof p.subscribeHttpsUrl === 'string' ? p.subscribeHttpsUrl.trim() : '';
      const webcalUrl = typeof p.webcalSubscribeUrl === 'string' ? p.webcalSubscribeUrl.trim() : '';

      let subject;
      let text;
      let html;
      if (action === 'revoked') {
        subject = 'JewelHeart calendar feed revoked';
        text =
          `${v.display_name || 'Volunteer'},\n\n` +
          `Your private JewelHeart volunteer calendar feed URL was revoked. ` +
          `Subscribed calendars will stop updating; remove the old subscription if your app still shows it.\n\n` +
          `You can mint a new feed from the JewelHeart app when you're ready.\n`;
        html =
          `<p>Hi ${escapeHtml(v.display_name || 'volunteer')},</p>` +
          `<p>Your private <strong>JewelHeart volunteer calendar feed</strong> was <strong>revoked</strong>. ` +
          `Subscribed calendars will stop updating.</p>` +
          `<p>You can mint a new feed from the JewelHeart app when you're ready.</p>`;
      } else {
        const verb = action === 'rotated' ? 'rotated' : 'created';
        subject = `JewelHeart calendar feed ${verb}`;
        text =
          `${v.display_name || 'Volunteer'},\n\n` +
          `Your private volunteer calendar feed was ${verb}. Use these links to subscribe in Apple Calendar, Google Calendar, etc.:\n\n` +
          (httpsUrl ? `HTTPS: ${httpsUrl}\n` : '') +
          (webcalUrl ? `WebCal: ${webcalUrl}\n` : '') +
          `\nIf you subscribed before, remove the old subscription and add this one (old URLs stop working after a rotate).\n`;
        html =
          `<p>Hi ${escapeHtml(v.display_name || 'volunteer')},</p>` +
          `<p>Your private volunteer calendar feed was <strong>${escapeHtml(verb)}</strong>.</p>` +
          (httpsUrl ? `<p>Subscribe (HTTPS): <a href="${escapeHtml(httpsUrl)}">${escapeHtml(httpsUrl)}</a></p>` : '') +
          (webcalUrl ? `<p>WebCal: <code>${escapeHtml(webcalUrl)}</code></p>` : '') +
          `<p style="font-size:12px;color:#666">If you subscribed before, remove the old subscription and add this one after a rotate.</p>`;
      }

      const email = typeof v.email === 'string' ? v.email.trim() : '';
      if (wantEmail && email) {
        try {
          out.results.push(await sendgridSend({ to: email, subject, text, html }));
        } catch (e) {
          out.results.push({ channel: 'email', error: String(e && e.message) });
        }
      } else {
        out.results.push({
          skipped: true,
          channel: 'email',
          reason: wantEmail ? 'no_email_on_profile' : 'notify_email_disabled',
        });
      }

      const phone = typeof v.phone === 'string' ? v.phone.trim() : '';
      if (wantSms && phone) {
        let smsBody;
        if (action === 'revoked') {
          smsBody = 'JewelHeart: your volunteer calendar feed was revoked. Mint a new one in the app.';
        } else {
          smsBody =
            `JewelHeart: calendar feed ${action === 'rotated' ? 'rotated' : 'ready'}. ` +
            (httpsUrl ? `Subscribe: ${httpsUrl}` : 'Open the app for links.').slice(0, 1480);
        }
        try {
          out.results.push(await twilioSendSms({ to: phone, body: smsBody }));
        } catch (e) {
          out.results.push({ channel: 'sms', error: String(e && e.message) });
        }
      } else {
        out.results.push({
          skipped: true,
          channel: 'sms',
          reason: wantSms ? 'no_phone_on_profile' : 'notify_sms_disabled',
        });
      }

      return out;
    } catch (e) {
      out.error = String(e && e.message);
      return out;
    }
  }

  /**
   * Run from cron (e.g. daily 18:00 retreat-local) once per environment. Marks each
   * assignment with `day_before_reminder_sent_at` only after a channel sends successfully.
   *
   * @returns {Promise<{ attempted: boolean, candidates?: number, marked?: number, error?: string, details?: object[] }>}
   */
  async function notifyDayBeforeShiftReminders() {
    const out = { attempted: true, candidates: 0, marked: 0, details: [] };
    try {
      const secret = confirmSecret();
      if (!secret) {
        out.skipped = true;
        out.reason = 'no_calendar_confirm_secret';
        return out;
      }

      const { rows } = await query(
        `SELECT a.id AS assignment_id, a.volunteer_id, v.display_name, v.email, v.phone, v.notify_email, v.notify_sms,
                r.name AS retreat_name, j.title AS job_title, s.label AS slot_label, s.slot_date::text AS slot_date
         FROM jewelheart_assignments a
         JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
         JOIN jewelheart_tasks t ON t.id = a.task_id
         JOIN jewelheart_jobs j ON j.id = t.job_id
         JOIN jewelheart_slots s ON s.id = t.slot_id AND s.retreat_id = t.retreat_id
         JOIN jewelheart_retreats r ON r.id = t.retreat_id
         WHERE a.day_before_reminder_sent_at IS NULL
           AND s.slot_date = ((now() AT TIME ZONE r.timezone)::date + 1)
           AND (
             (v.notify_email = true AND v.email IS NOT NULL AND length(trim(v.email)) > 0)
             OR (v.notify_sms = true AND v.phone IS NOT NULL AND length(trim(v.phone)) > 0)
           )`,
      );

      out.candidates = rows.length;

      for (const row of rows) {
        const assignmentId = row.assignment_id;
        const volunteerId = row.volunteer_id;
        const v = {
          display_name: row.display_name,
          email: row.email,
          phone: row.phone,
          notify_email: row.notify_email,
          notify_sms: row.notify_sms,
        };
        const wantEmail = v.notify_email !== false;
        const wantSms = v.notify_sms === true;
        const retreatName = String(row.retreat_name || 'Retreat');
        const jobTitle = String(row.job_title || 'Volunteer shift');
        const slotLabel = String(row.slot_label || '');
        const slotDate = String(row.slot_date || '');

        const exp = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
        const sealed = signAssignmentConfirmationToken({ assignmentId, volunteerId, exp }, secret);
        const base = originBase();
        const confirmPath = `/jewelheart/assignment-confirmations/${encodeURIComponent(sealed)}`;
        const confirmUrl = `${base}${confirmPath}`;

        const subject = `Reminder: volunteer shift tomorrow — ${jobTitle}`;
        const text =
          `${v.display_name || 'Volunteer'},\n\n` +
          `This is a reminder: you're signed up for "${jobTitle}"` +
          (slotLabel ? ` (${slotLabel})` : '') +
          (slotDate ? ` on ${slotDate}` : '') +
          ` — ${retreatName} (**tomorrow** in the retreat schedule).\n\n` +
          `Confirm or withdraw (no sign-in): ${confirmUrl}\n\n` +
          `Calendar: refresh your subscribed feed or use the app.\n`;

        const html =
          `<p>Hi ${escapeHtml(v.display_name || 'volunteer')},</p>` +
          `<p><strong>Tomorrow:</strong> you're signed up for <strong>${escapeHtml(jobTitle)}</strong>` +
          (slotLabel ? ` <span style="color:#555">(${escapeHtml(slotLabel)})</span>` : '') +
          (slotDate ? ` on <strong>${escapeHtml(slotDate)}</strong>` : '') +
          ` — ${escapeHtml(retreatName)}.</p>` +
          `<p><a href="${escapeHtml(confirmUrl)}">Confirm or withdraw</a></p>`;

        let anySendOk = false;
        const rowOut = { assignmentId, results: [] };

        const email = typeof v.email === 'string' ? v.email.trim() : '';
        if (wantEmail && email) {
          try {
            const rSend = await sendgridSend({ to: email, subject, text, html });
            rowOut.results.push(rSend);
            if (rSend && rSend.ok) anySendOk = true;
          } catch (e) {
            rowOut.results.push({ channel: 'email', error: String(e && e.message) });
          }
        } else {
          rowOut.results.push({
            skipped: true,
            channel: 'email',
            reason: wantEmail ? 'no_email_on_profile' : 'notify_email_disabled',
          });
        }

        const phone = typeof v.phone === 'string' ? v.phone.trim() : '';
        if (wantSms && phone) {
          const smsBody =
            `JewelHeart tomorrow: ${jobTitle}${slotDate ? ` ${slotDate}` : ''}. ${confirmUrl}`.slice(0, 1480);
          try {
            const rSend = await twilioSendSms({ to: phone, body: smsBody });
            rowOut.results.push(rSend);
            if (rSend && rSend.ok) anySendOk = true;
          } catch (e) {
            rowOut.results.push({ channel: 'sms', error: String(e && e.message) });
          }
        } else {
          rowOut.results.push({
            skipped: true,
            channel: 'sms',
            reason: wantSms ? 'no_phone_on_profile' : 'notify_sms_disabled',
          });
        }

        if (anySendOk) {
          await query(
            `UPDATE jewelheart_assignments SET day_before_reminder_sent_at = now() WHERE id = $1 AND day_before_reminder_sent_at IS NULL`,
            [assignmentId],
          );
          out.marked += 1;
        }

        out.details.push(rowOut);
      }

      return out;
    } catch (e) {
      out.error = String(e && e.message);
      return out;
    }
  }

  return {
    notifyAfterAssignmentCreated,
    notifyAfterAssignmentRemoved,
    notifyAfterCalendarFeedChanged,
    notifyDayBeforeShiftReminders,
  };
}

module.exports = {
  createJewelHeartVolunteerNotify,
};
