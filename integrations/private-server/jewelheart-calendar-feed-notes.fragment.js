/**
 * JewelHeart volunteer calendar ICS feed — IMPLEMENTATION NOTES (private-server)
 * =============================================================================
 * Canonical HTTP handler reference: jewelheart-calendar-feed.fragment.js (executable handlers).
 *
 * Security
 * --------
 * - Unauthenticated subscribe URL MUST carry only calendar_feed_token (high-entropy random,
 *   e.g. 32+ bytes hex or base64url). Never derive from volunteer UUID alone.
 * - On volunteer delete consider ON DELETE CASCADE already via assignments FK; revoke token in same txn.
 *
 * ICS invalidation / updates
 * --------------------------
 * - Webcal refreshes periodically; return **Cache-Control: private, max-age=0, must-revalidate**
 *   (or short max-age ~120s during testing).
 * - Emit stable VEVENT UID per assignment (`assignment-{uuid}@jewelheart`) so clients merge updates/deletes:
 *   when an assignment drops, regenerate feed without that VEVENT OR emit CANCELLED (SEQUENCE+) — pick one consistently.
 *
 * slot_date + retreat.timezone assumptions
 * -----------------------------------------
 * slot.slot_date is a civil date in the retreat IANA timezone (same convention as volunteer mobile views).
 *
 * jewelheart_time_band → local DTSTART anchor; **DTEND = DTSTART + job.estimated_minutes**
 * (fallback **30** if missing). Bands are **starts only**, not full-window lengths.
 *   early       DTSTART 07:00
 *   lunchtime   11:30
 *   dinnertime  17:00
 *   anytime     12:00 (narrow placeholder — document in release notes so teams adjust)
 *   allday      DTSTART 12:00 on slot day (avoids misleading VALUE=DATE blocks)
 *
 * Use TZID=<retreat.timezone> on DTSTART/DTEND plus matching VTIMEZONE block when required by clients.
 *
 * Reminders (VALARM)
 * ------------------
 * Add TRIGGER:-PT24H DISPLAY (and optional -PT3H). Subscribed ICS → Apple/Google/Outlook honour client-side alarms
 * without APNs/FCM CALDAV pushes.
 *
 * Example SQL skeleton (PostgreSQL): join assignments → tasks → slots → jobs → retreats
 * -----------------------------------------------------------------------------
 * SELECT
 *   a.id AS assignment_id,
 *   j.title AS job_title,
 *   j.estimated_minutes AS estimated_minutes,
 *   s.label AS slot_label,
 *   s.slot_date,
 *   s.time_band,
 *   r.timezone AS retreat_timezone,
 *   r.name AS retreat_name
 * FROM jewelheart_assignments a
 * JOIN jewelheart_tasks t ON t.id = a.task_id
 * JOIN jewelheart_jobs j ON j.id = t.job_id
 * JOIN jewelheart_slots s ON s.id = t.slot_id
 * JOIN jewelheart_retreats r ON r.id = t.retreat_id
 * JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
 * WHERE v.calendar_feed_token = $1::text;
 *
 * Email/SMS batches (later)
 * -------------------------
 * When creating/updating assignments, enqueue notify if volunteer.notify_* and presence of email/phone.
 * Respect Twilio STOP/Consent out of repo.
 */
