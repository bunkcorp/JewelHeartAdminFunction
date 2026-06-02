# Volunteer redesign — mockups review

**Source:** mockups.docx (2026-06-02)  
**Compared to:** JewelHeartAdminFunction redesign/admin-v2 — Volunteer V2 (Android + iOS)  
**Design target:** 360x640 dp / 375x667 pt, 16 dp horizontal padding (see screen paramterrs.docx)

---

## 1. Screen inventory

### 1.1 Volunteer Home

- **Header:** JH Summer 2026 - Day 2, Tues (retreat + current day/weekday).
- **Summary:** David Lewis - 2 shifts - 1 today plus shift lines for today/upcoming.
- **I want to:** Sign up for (more) shifts; Review / edit my assigned shifts; Check in for [specific shift | a shift today].
- **View / edit:** My preferences; My account.
- **Layout notes:** Center content; grouped button boxes; rectangle around whole UI for minimal-phone bounds; brand colors on groups.

### 1.2 Search available shifts

- Same persistent header as home.
- **Title:** Search available shifts.
- **Days:** Tap to toggle; skip for all implied.
- **Jobs:** Tap to toggle multiple jobs; skip for all jobs.
- **Search** button to assign list.
- Selected: dark maroon; unselected: light maroon.

### 1.3 Assign shifts to me

- Tap shift to assign; **Done assigning - back to Home** at bottom.
- Rows: weekday right-aligned, two spaces, job name left-aligned.
- Tap row to shift assignment; on assign, return with search re-run.

### 1.4 Shift assignment (assign flow)

- **Assigning this shift to me**, Print, Done, instructions, Contact line.
- Print to JH Office with assignee name + instructions.
- Done returns to assign list with refreshed search.

### 1.5 Check in for a shift

- Print, Estimated time, optional actual time chips, Done, instructions + contact.
- Distinct from assign screen.

---

## 2. Issues in the spec

| # | Issue | Impact |
|---|--------|--------|
| 1 | Check-in section mis-labeled [Shift assignment page] | Confusing for implementers |
| 2 | Both Search buttons are active (is that OK?) | Unclear: two controls vs empty-filter search |
| 3 | Skip for all days/jobs | Conflicts with Search disabled when no days selected |
| 4 | Job filters multi-toggle in wireframe | vs current single-select radio |
| 5 | Mixed casing in examples | Need one canonical formatter |
| 6 | Contact line not in data model | instructions[] or new JSON field |
| 7 | Print to JH Office | No API in codebase |
| 8 | LLM detect but algorithmic execute | Runtime UI must be pure functions |
| 9 | My preferences / My account | No routes in v2 |
| 10 | Center-all vs large text | Must scroll/wrap per screen-parameters doc |

---

## 3. Assumptions

1. This document is analysis only; UI implementation is follow-up.
2. Header N today = unchecked-in shifts today.
3. My shift today lines = unchecked-in today; checked-in drop from header.
4. Contact is in instructions[] until RetreatV7Job.contact exists.
5. Check-in needs checkedInShiftIds and optional actualMinutes in repository.
6. Print workflow TBD (blocker).
7. Empty day selection = all days from today through retreat end.
8. Empty job selection = all jobs.
9. Shift line: site activity - slot; en-dash with spaces; hyphen when squeezed.
10. Never 0 shifts or 1 shifts wording.
11. Check in on home only when next shift is today.
12. Sign up omits more when zero shifts; hide Review/Check in when zero shifts.

---

## 4. Gap analysis vs current code

| Mockup requirement | Current behavior | Primary files |
|--------------------|------------------|---------------|
| Persistent header on all screens | TopAppBar title only | VolunteerV2Screens.kt, VolunteerV2Views.swift |
| Conditional home copy | Fixed assignment(s), always Check in | VolunteerV2HomeScreen, VolunteerV2HomeView |
| mockup shift labels | comma and middle dot format | VolunteerV2Format.kt / Swift |
| Grouped home + preferences | Three flat buttons | VolunteerV2Screens.kt |
| Brand colors | pastel blue/red/green | new VolunteerV2Colors |
| Multi-select jobs | single radio | VolunteerV2SearchScreen |
| Skip-all search | requires day selection | searchShifts() |
| Assign list + Done footer | Available shifts + Cancel | VolunteerV2AvailableScreen |
| Assign vs check-in | one VolunteerV2ShiftScreen | split by mode |
| Print / actual time | not implemented | shift + check-in screens |
| Checked-in state | assign only | RetreatV7Repository, RetreatV7Store |

Routes: v2home, v2search, v2available, v2shift/{id}, v2mine, v2checkin. Data: retreat_v7.json. Assignments in memory only.

---

## 5. Implementation phases

**A** Copy/format (VolunteerV2Copy, mockupShiftLine, tests)  
**B** Layout/theme (VolunteerV2Header, colors, home + search UI)  
**C** Flow/state (multi job filter, check-in, split shift screen)  
**D** Backend (persist, print, preferences/account)

---

## 6. Algorithmic copy rules

| Condition | Behavior |
|-----------|----------|
| Zero shifts | no shifts assigned; omit next lines, Review, Check in; Sign up without more |
| Counts | N shift / N shifts only |
| Next timing | today, tomorrow, or weekday |
| Check in button | today only; plural label if multiple today |
| Header today lines | one per unchecked shift today |
| Separators | en-dash; hyphen if squeezed |

---

## 7. Colors

| Name | Hex |
|------|-----|
| Gold | #FFCA10 |
| Maroon | #92160E |
| Light cyan | #4ACBE1 |
| Steel teal | #7A95CA |
| Light maroon | #C68581 |

---

Generated from mockups.docx review vs Volunteer V2 on redesign/admin-v2.
