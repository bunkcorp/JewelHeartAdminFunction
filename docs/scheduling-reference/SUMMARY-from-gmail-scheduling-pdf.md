# Summary: Gmail thread “Scheduling” (PDF export)

Source: **`Gmail - Scheduling.pdf`** in this folder (Apr 24, 2026 export). Participants: **David Lewis** (djlewis@triadic.com), **Kevin Woods** (kevinalexwoods@gmail.com). Includes pasted **Claude** reasoning and references to **`Schedule prompt.docx`**, **`Retreat_Volunteer_Schedule.xlsx`**, v2 variants in this repo.

This note is for humans aligning **retreat volunteer scheduling** with **JewelHeart** (jobs, slots, tasks) and optional AI/spreadsheet workflows.

---

## Goals (from the thread)

1. Structure work as **sites** + **jobs** (Kevin’s breakdown; David approves, may extend).
2. Use **AI** to assign tasks across a **fixed daily time grid** → editable output (**spreadsheet** first).
3. Eventually feed **Kevin’s app** directly: **data structures / API**, with **admin tools** for ongoing changes (David: may replace “initial admin” emphasis but still need change workflows).
4. Use **(quick vs full)**, **(n volunteers, m minutes)**, and **spacing** so the schedule is realistic.

---

## Retreat & scope (summer 2026 example)

- **Dates:** **July 20–26, 2026** (Mon–Sun). **Days 1–6** (Mon–Sat) are in scope for automated scheduling; **day 7** is special — **AI should not schedule volunteer tasks** for day 7 in the prompt.
- **Pre-retreat:** The **whole facility is deep-cleaned the Saturday before** — Day 1 should assume **lighter** “first use” cleaning, not a dirty cold start.

---

## Daily time grid (David, from last summer retreat)

| Block             | Start   | End     | Notes                          |
|-------------------|---------|---------|--------------------------------|
| Start day         | 8:00 AM | 8:30 AM | 30 min                         |
| Morning break     | 9:30 AM | 10:00 AM| 30 min                         |
| Lunch break       | 12:00 PM| 2:00 PM | 120 min                        |
| Afternoon break   | 3:00 PM | 3:30 PM | 30 min                         |
| Dinner break      | 6:30 PM | 8:00 PM | 90 min                         |
| End day           | 9:00 PM | —       | **6:30 PM** if no social event |

Evening teachings might vary; summer retreat assumed **relaxed** — probably unchanged.

---

## JewelHeart mapping (conceptual)

| Concept in thread / spreadsheet | JewelHeart API / DB                         |
|-----------------------------------|---------------------------------------------|
| Site + job description            | **Job** (`title`, `volunteersNeeded`, `estimatedMinutes`, optional **subjobs**) |
| A calendar day + time window      | **Slot** (`slotDate`, `timeBand`, `label` …) — API bands: `early`, `lunchtime`, `dinnertime`, `allday`, `anytime`; **extra nuance** (e.g. “8:00 AM”) often lives in **label** or future UI |
| “Do job X during slot Y on day D” | **Task** = **job × slot** (unique per retreat) |
| Who does it                       | **Assignment** (volunteer linked to retreat, assigned to task) |

The **web admin** (`karmadots.org/login`) and mobile admin implement CRUD on these resources.

---

## Version 1 (Claude excerpt in PDF) — highlights

- **Six slot types** per day with durations; **end day** treated as ~**60** minutes from ~8 PM in packing logic (later refined).
- **Heavy-use sites:** **one full clean per day** over days 1–6 — initially **kitchen, men’s, unisex, foyer** (four sites × six days).
- **Other sites:** alternate **full** vs **quick**; stagger across week.
- **Coffee/snack:** setup **day 1 start**; tidy/replenish at breaks; **breakdown end of day 6**.
- **Altar:** setup **day 1 morning**; **tidy & cull** on mornings; **breakdown end of day 6** (v1; **v2 changes** below).
- **Main hall:** mix of **quick** and **full clear/clean/reset** on selected days.
- **Spreadsheet workbook (4 sheets):** chronological list; **slot × day** matrix; **site × day** matrix (for **manual tweaks**); **notes & summary**.
- **Gaps filled by estimates** in prompt (e.g. front room, JH office vacuum) — document in Notes sheet.

---

## Version 2 — new tasks & rules (major deltas)

**New / explicit tasks** (examples): kitchen **towels** / **Bona pads** collect & return; **men’s urinals** — set out pads, **quick mop every break**, **full mop** end of day; **buy snacks**; **trash** nightly; **front windows** **twice** per retreat; etc.

**Rules that reshaped the schedule:**

1. **Leave everything fully clean after day 6** (final close-down).
2. **Front windows** cleaned **twice**.
3. **Trash** every **end of day**.
4. **Men’s urinals quick mop at every break** (morning, lunch, afternoon, dinner) + setup / full mop as specified.
5. **No café or kitchen cleaning during lunch** (heavy use).
6. **Unisex** must remain **available** when **men’s or women’s** is getting a **full** clean → **no overlapping** full cleans that violate that **during the retreat** (final day end may be treated as exception in the model).
7. **All full cleans only in start-of-day or end-of-day slots** (not lunch/dinner breaks for fulls).
8. **Altar “every other day”** — Claude chose an interpretation: e.g. **setup days 1/3/5** (start), **breakdown days 2/4/6** (end), with **tidy/cull** when altar is “up”; **confirm with David/Debbie** if meaning differs.
9. **Coffee/snack setup and breakdown every day** (v2).
10. **Heavy-use sites include café** — **five** sites with **one full clean per day** each (kitchen, men’s, unisex, foyer, café).
11. **End day** length variable (7 PM vs 9 PM); **day 6** final push may need **longer** window than 60 minutes in practice.

**Metrics example (from PDF):** ~**2,418** volunteer-minutes total (~**40** volunteer-hours); **day 6** heaviest; **“packed volunteers”** heuristic uses **5 min** padding between tasks for the same volunteer in a slot.

**v2 attachments in repo:** `Schedule prompt 2.docx`, `Retreat_Volunteer_Schedule_v2.xlsx`.

---

## Product direction (David, late Apr 23)

- Output could be **code-friendly structures** (declarations / initializations) → **directly into the app**, with spreadsheet mainly for **human review**.
- Or fold the whole loop into **“coding”** (pipeline / agent).
- Next: **detailed job specs** + **time estimates** with **Debbie**; task list may **change**.

---

## Kevin (Apr 24)

- Catching up on **app** that afternoon; proposed **call after 5**.

---

## Open questions to resolve with stakeholders

1. **Altar “every other day”** — exact ritual vs Claude’s alternating setup/breakdown.
2. **End-of-day duration** on **day 6** vs packing math (60 vs extended).
3. **Front room full (1,10)** vs other full cleans using **2** volunteers — intentional?
4. How **clock times** (8:00 AM …) map to **production slots** (labels, bands, extra metadata) in **JewelHeart** and any **AI exporter**.

---

## Related files in this folder

| File | Role |
|------|------|
| `Gmail - Scheduling.pdf` | Full thread export |
| `Schedule prompt.docx` / `Schedule prompt 2.docx` | AI prompts v1 / v2 |
| `Retreat_Volunteer_Schedule.xlsx` / `Retreat_Volunteer_Schedule_v2.xlsx` | Spreadsheet outputs |
| `README.txt` | Short pointer when these were copied in |

---

*Generated for the JewelHeartAdminFunction repo; adjust dates and rules when retreat or policy changes.*
