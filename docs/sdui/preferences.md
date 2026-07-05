# Preferences — Master Spec (`jewelheart.volunteer.preferences`)

> **Status:** Draft (2026-06-30). For review and polish by David.
> **Scope:** Self-service toggles for once-daily shift reminder notifications by email
> and/or SMS.
> **Authority:** Edit this document first, then change code to match.

---

## 1. Purpose

Let a linked volunteer choose whether to receive **one reminder message per day** about
their assigned shifts, delivered by email and/or text message to the contact addresses
already on their roster row.

Changes save immediately when a checkbox is toggled (no separate Save button).

---

## 2. Entry and navigation

| Entry | From |
|-------|------|
| Home footer row | **Prefs** button next to **Acct** |
| Back | Returns to `returnTo` (normally Home) via footer **←** or browser back |

Payload: `retreatId` (when known), `returnTo` (normally `jewelheart.home`).

Screen id: `jewelheart.volunteer.preferences`. Toolbar title: **Preferences**.

---

## 3. Layout (top → bottom)

All elements below sit inside the standard volunteer SDUI panel (below the app toolbar
with Back / title / Sign out).

### 3.1 Generic retreat header (required on every volunteer sub-screen)

Same two-bar header used on Find, My Assignments, Account, etc.:

1. **Retreat banner bar (blue background, gold/yellow text):**
   `JH Retreat • {compact date span} • Day {n} {weekday}`
   Example: `JH Retreat • 2026.7.20-25 • Day 2 Tue`
2. **Small vertical gap** (standard spacing between header bars).

### 3.2 Screen title bar (blue background, white text)

3. **Preferences title bar:** `Preferences - {display name}`
   - `{display name}` is the volunteer's roster `display_name`.
   - Long names truncate with ellipsis per the global bar width rule.

### 3.3 Reminder panel (maroon-bordered box)

All reminder copy and controls live **inside** one panel (same border style as Account).

4. **Intro text** (left-aligned, bold, wraps to multiple lines if needed):
   `Send me once daily reminders of my shifts:`

5. **Email reminder row** — horizontal row: small checkbox, then label on the same line:
   `by email ({email address})`
   - Example: `by email (djlewis@triadic.com)`
   - If roster email is blank: `by email (no address on file)` — checkbox **disabled**.
   - Default **on** when roster has email (`notify_email` not false).
   - Toggling calls `PATCH /jewelheart/volunteer/me` with `{ notifyEmail: true|false }`
     and reloads the screen.

6. **SMS reminder row** — same layout:
   `by text ({phone number})`
   - Example: `by text (978-618-5709)`
   - If roster phone is blank: `by text (no number on file)` — checkbox **disabled**.
   - Default **off** unless `notify_sms` is true on the roster row.
   - Toggling calls `PATCH /jewelheart/volunteer/me` with `{ notifySms: true|false }`.

   Checkbox size: smaller than default browser checkbox; label sits immediately to the
   right, vertically centered with the box. Both rows stay inside the panel.

### 3.4 Footer navigation

7. **Standard footer nav** — fixed bottom row: **←** (history back) and **⌂** (Home).

### 3.5 Explicitly omitted on this screen

- No gold page-title bar (no separate full-width gold `"Preferences"` strip).
- No intro text **outside** the panel (all reminder copy is inside the box).
- No build-stamp or layout-warning line at the bottom.
- No separate Save button.

---

## 4. Not-linked state

If the signed-in user has no linked volunteer profile:

- Show the **generic retreat header** (§3.1).
- Show a **gold page-title bar** with the word **Preferences** (placeholder pattern only).
- Show body text: `Your volunteer profile is not linked yet. Use your personal invite link first.`
- Show standard footer nav.

---

## 5. Data and permissions

- Profile and current toggle values come from the same volunteer row as Account
  (`notify_email`, `notify_sms`, `email`, `phone`).
- API: `PATCH /jewelheart/volunteer/me` (authenticated, linked volunteer only).
- Reminders are defined as **at most one message per day** per channel; delivery
  scheduling is out of scope for this screen spec.

---

## 6. Open questions (for David)

- Should email default remain **on** for new volunteers, or opt-in only?
- Copy for disabled rows: keep `(no address on file)` or point user to Account / organizer?
- Confirm hyphen in title bar (`Preferences - Name`) vs. centered dot used elsewhere?
