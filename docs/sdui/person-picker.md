# Person picker — Master Spec

> **Status:** Approved (2026-06-24). Canonical contract for web/iOS/Android admin + volunteer SDUI.
> **Scope:** Multi-word people finder combobox used on Edit Shift (reassign) and admin flows.
> **Authority:** Edit this document first, then change code to match.
> **Test data:** `docs/sdui/fixtures/people-test.xlsx` (~100 rows; use for matcher QA).

---

## 1. Purpose

Find **one person** from a roster (typically 50–80 retreat-linked volunteers). Used when
reassigning a shift, assigning in admin, or linking a retreatant who does not use the app.

---

## 2. Control layout

Single full-width line on its own row:

```
┌─────────────────────────────────────┐
│ Start typing a name…                │  ← text field
└─────────────────────────────────────┘
┌─────────────────────────────────────┐  ← dropdown (when rules allow)
│ John Moran                          │
│ john.moran@…                        │  ← admin only (email second line)
└─────────────────────────────────────┘
Status line (optional): "3 matches" / "42 matches — keep typing"
```

**States:** Idle | Searching | Selected | Locked (after terminal action on parent screen).

---

## 3. Invocation

- **Tap/focus** the field: show placeholder only; **do not** open a full roster on empty focus.
- **Typing** updates matches on each input change (local roster: no debounce required).

---

## 4. Dropdown visibility

| Condition | Dropdown |
|-----------|----------|
| Trimmed query empty | Hidden |
| Match count **≤ 12** | Show ranked list |
| Match count **> 12** | **Hidden**; status only: `"N matches — keep typing"` |
| Person selected (parent not terminal) | Hidden until user types again |
| Parent screen terminal (reassign done) | Field locked or plain text; no dropdown |

---

## 5. Matching

**Normalize:** lowercase, trim, collapse internal spaces.

**Single token:** word-start on any word in `displayName` (built as `FirstName LastName`).
No substring matches inside a word (e.g. `ann` must not match `Mann`).
Email: local part (before `@`) prefix only.

**Multi-token (optional power-user):** split query on spaces; **each token** must
word-start-match a name word **in order, left to right** (first token cannot use
email; later tokens never reuse an earlier word). Examples:

| Query | Typical result |
|-------|----------------|
| `john` | All Johns — user picks from list |
| `john m` | John Moran, John Madison — short list |
| `jo mo` | John Moran |

**Rank:** more tokens matched → earlier word positions → shorter name.

**Admin rows:** primary line = display name; secondary line = email (optional phone in admin web).

**Volunteer rows:** display name only.

**Exclude from roster:** self (reassign), already assigned to same task when capacity = 1
(implementation may relax for multi-seat jobs).

---

## 6. Selection

- **Tap row** → set `volunteerId`, fill **display name in the box** (choice **A**), close dropdown.
- **Typing after select** clears selection and returns to Searching.
- Keyboard arrow/Enter: optional on admin web only; not required on mobile.

---

## 7. Cancel / clear / dismiss

| Action | Dropdown | Selection | Query text |
|--------|----------|-----------|------------|
| Escape | Hide | Keep | Keep |
| Tap outside | Hide | Keep | Keep |
| Delete all text / Clear | Hide | Cleared | Empty |
| Screen Back / Cancel | — | Discarded | — |

Dismiss dropdown ≠ cancel selection. Only emptying the field or explicit Clear resets pick.

---

## 8. Roster sources

| Scope | Source | Use |
|-------|--------|-----|
| **retreat** | `GET /jewelheart/retreats/{retreatId}/volunteers` | Reassign, in-retreat assign |
| **global** | `GET /jewelheart/volunteers?q=…` | Admin link person not yet on retreat |

Preload retreat roster client-side when ≤ ~120 rows.

---

## 9. Empty / overload messages

| Case | Message |
|------|---------|
| No query | `"Start typing a name…"` |
| 0 matches | `"No matches — try another spelling."` |
| > 12 matches | `"N matches — keep typing."` |

---

## 10. Platforms

Same rules on web SDUI, iOS, Android, and admin web. Admin may add email line and keyboard nav.
