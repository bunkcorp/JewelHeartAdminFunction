# User management — Master Spec

> **Status:** Approved (2026-06-22). Manager/admin volunteer sign-in tools on the Manage flow.
> **Screen id:** `jewelheart.volunteer.userManage`
> **Authority:** Edit this document first, then change code to match.

---

## 1. Purpose

Let **managers and admins** inspect and fix volunteer sign-in for people on the retreat roster:

- Check whether someone is linked, has an active invite, etc.
- **Unlink** Firebase sign-in (clear `firebase_uid`) so first-time setup can be retried.
- **Send invite** — mint a fresh invite token and email it to the **roster email address** (SendGrid).

Reach from **Manage → User management** (manager or admin only).

---

## 2. Flow

1. **Find** — person picker (`userManagePicker`), retreat + global search. Blue header: **`Manage - (tbd)`**.
2. **Confirm** — locks selection; header becomes **`Manage - {name}`**. Picker hint: “Selected — tap Confirm”.
3. **Actions** (separate buttons, only after confirm):
   - **Status** — fetch access summary; lines shown on screen below selection.
   - **Unlink** — browser `confirm()` then `POST …/unlink-auth`.
   - **Send invite** — `POST …/invite-email` (replaces any active link; no extra confirm)
4. **Clear selection** — return to picker; discard status lines.

Footer nav: ← Manage, ⌂ Home.

---

## 3. Status lines

Returned by `GET …/user-access` as `lines[]`:

| Line | Meaning |
|------|---------|
| Display name | Roster name |
| Email / Phone | Roster contact (when present) |
| Sign-in: linked / not linked yet | `firebase_uid` set or null |
| Invite: active / used / expired / none | Latest invite for this retreat + volunteer |

Timestamps in status copy use **America/New_York**.

---

## 4. API (authenticated, manager or admin)

Base: `/jewelheart/retreats/:retreatId/volunteers/:volunteerId`

| Method | Path | Action |
|--------|------|--------|
| GET | `/user-access` | Status JSON + `lines[]` |
| POST | `/unlink-auth` | Clear `firebase_uid` |
| POST | `/invite-email` | Mint invite + SendGrid to roster email |

Gates: `jewelheart_managers` or `jewelheart_admins`, plus retreat read ACL. Volunteer must be on retreat roster.

---

## 5. SDUI params

| Param | When |
|-------|------|
| `userManageVolunteerId` | After Confirm |
| `userManageVolunteerName` | After Confirm |
| `userManageStatusNote` | After Status (newline-separated lines) |
| `userManageClear=1` | Clear selection |
| `userManageConfirm=1` + `pickVolunteerFrom=userManagePicker` | Confirm navigate (client resolves picker) |

---

## 6. Client action

`volunteerUserManage` with `payload.op`: `status` | `unlink` | `sendInvite`, plus `volunteerId`, `displayName`, `hasEmail` (send invite).

---

## 7. Copy notes

- Use ` - ` (space-dash-space) in UI copy where a dot separator is intended.
- Unlink confirm: explain they need a new invite to sign in again.
- Send invite confirm: names the volunteer; email goes to roster address only (not coordinator override).
