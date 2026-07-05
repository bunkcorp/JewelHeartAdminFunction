# Account — Master Spec (`jewelheart.volunteer.account`)

> **Status:** Draft (2026-06-30). For review and polish by David.
> **Scope:** Read-only view of the signed-in volunteer's roster profile, with limited
> self-service edit when email or phone is missing on the roster.
> **Authority:** Edit this document first, then change code to match.

---

## 1. Purpose

Let a linked volunteer see their name and contact information as stored on the retreat
roster. If the roster row is missing email or phone, they may add the missing field(s)
once; existing values are read-only.

---

Elevated access (Admin / Manage) is indicated on **Home** only, not repeated here.

## 2. Entry and navigation

| Entry | From |
|-------|------|
| Home footer row | **Acct** button next to **Prefs** |
| Back | Returns to `returnTo` (normally Home) via footer **←** or browser back |

Payload: `retreatId` (when known), `returnTo` (normally `jewelheart.home`).

Screen id: `jewelheart.volunteer.account`. Toolbar title: **Account**.

---

## 3. Layout (top → bottom)

All elements below sit inside the standard volunteer SDUI panel (below the app toolbar
with Back / title / Sign out).

### 3.1 Generic retreat header (required on every volunteer sub-screen)

Same two-bar header used on Find, My Assignments, Announcements, etc.:

1. **Retreat banner bar (blue background, gold/yellow text):**
   `JH Retreat • {compact date span} • Day {n} {weekday}`
   Example: `JH Retreat • 2026.7.20-25 • Day 2 Tue`
   - Date span and day number come from the active retreat and today's date in
     `America/New_York`.
2. **Small vertical gap** (standard spacing between header bars).

### 3.2 Screen title bar (blue background, white text)

3. **Account title bar:** `Account - {display name}`
   - `{display name}` is the volunteer's roster `display_name` (e.g. `David Lewis`).
   - If the name is too long for one line, truncate with ellipsis per the global bar
     width rule (~38 characters on a 360dp-wide phone mockup).

### 3.3 Profile panel (maroon-bordered box)

4. **Profile panel** — rounded rectangle, maroon border, white background. Contains four
   labeled rows, top to bottom:

   | Label (small caps, maroon) | Value |
   |------------------------------|-------|
   | First name | Roster first name (split from `display_name`) |
   | Last name | Roster last name |
   | Email address | Roster email, or editable empty field if missing |
   | Phone number | Roster phone, or editable empty field if missing |

   - **Read-only rows** show the value as plain text. Empty roster values show an em dash
     (`—`) when not editable.
   - **Editable rows** appear only when that contact field is blank on the roster. Show a
     single-line text input with placeholder `Add your email address` or
     `Add your phone number`.
   - First name and last name are always read-only on this screen.

### 3.4 Save action

5. **Save pill** (centered maroon button, white text) — shown only when at least one of
   email or phone is editable (missing on roster). Tapping Save calls
   `PATCH /jewelheart/volunteer/me` with the entered email and/or phone, then reloads the
   screen. Success clears the message area; failure shows an error in the message area
   below the panel.

### 3.5 Footer navigation

6. **Standard footer nav** — fixed bottom row: **←** (history back) and **⌂** (Home).

### 3.6 Explicitly omitted on this screen

- No gold page-title bar (e.g. no separate full-width gold `"Account"` strip).
- No build-stamp line (version stamps appear on **Home** only).
- No privilege / Admin / Manage copy (Home buttons are sufficient).

---

## 4. Not-linked state

If the signed-in user has no linked volunteer profile (no roster match):

- Show the **generic retreat header** (§3.1).
- Show a **gold page-title bar** with the word **Account** (placeholder pattern only).
- Show body text: `Your volunteer profile is not linked yet. Use your personal invite link first.`
- Show standard footer nav.

---

## 5. Data and permissions

- Profile data comes from `jewelheart_volunteers` for the signed-in user (firebase uid,
  with roster email/phone fallback matching other volunteer screens).
- Save may only **add** missing email or phone; changing an existing roster value is
  rejected by the API.
- Global admins without a volunteer row see the not-linked state unless their auth
  identity matches a roster row.

---

## 6. Open questions (for David)

- Should Save stay a maroon pill or match another button style?
- Any copy change for the not-linked placeholder (invite vs. contact organizer)?
