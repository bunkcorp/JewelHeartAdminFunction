# Summary: David’s schedule prompts & retreat volunteer spreadsheets

Sources in this folder:

- **`Schedule prompt.docx`** (Apr 23, 2026)
- **`Schedule prompt 2.docx`** (Apr 24, 2026)
- **`Retreat_Volunteer_Schedule.xlsx`** (v1)
- **`Retreat_Volunteer_Schedule_v2.xlsx`** (v2)

Use this note together with **`SUMMARY-from-gmail-scheduling-pdf.md`** (Gmail thread + Claude discussion). The PDF summary covers goals, JewelHeart mapping, and thread context; this file captures what the **Word prompts** ask for and how the **Excel workbooks** implement it.

---

## Shared retreat framing

- **Dates:** **July 20–26, 2026** (days 1–7). **Days 1–6** (Mon–Sat) carry scheduled volunteer work; **day 7** has **no** scheduled volunteer tasks.
- **Six scheduling slots** (same names across artifacts): Start day, Morning break, Lunch break, Afternoon break, Dinner break, End day.
- **Task notation:** each line is effectively **site — task (Nv, Mm)** — *N* volunteers in parallel, *M* minutes each.

---

## Schedule prompt.docx (v1 prompt)

- **Slots:** End day described as **8/9:00 PM**, with **8:00 PM** on days *without* a social event (TBD).
- **Sites / jobs:** Kitchen, Café, Coffee/snack (setup, tidy & replenish, breakdown & wash), Store, Hallway, Tara Paradise, Men’s, Women’s, Foyer, **Front room** (“full and quick clean” **without** volunteer or minute counts), Altar, **JH office** (listed only as “vacuum”, no counts), Main hall, Lama office, Unisex, Lama bathroom.
- **Heuristics:** Facility **starts clean**. **One full clean per day** for kitchen, men’s, unisex, foyer. Schedule across the week so job lengths fit the slots.
- **Deliverables:** (1) list by day and slot; (2) matrix **slots × days**; (3) **site matrix** (rows = sites, tasks in chronological order by day/slot) — explicitly for **manual adjustments**.

---

## Schedule prompt 2.docx (v2 prompt)

Everything in v1, plus **concrete numbers** and **explicit rules**:

- **End day:** **7/9:00 PM**, with **7:00 PM** when there is no social event (differs from v1’s 8:00 PM wording).
- **Front room:** full **(1, 10)**, quick **(1, 6)**. **JH office:** vacuum **(1, 10)**.
- **New work:** kitchen towels and Bona mop pads (collect / return); **men’s urinals** (set out pads, quick mop each break, full mop EOD); **buy snacks**; **trash** (consolidate, take out); **front windows** (clean).
- **Rules / heuristics:** Leave place **fully clean after day 6**; front windows **twice** in the week; trash **end of each day**; urinals **at least quick mop every break**; Swiffer/disposable pads for urinals vs Bona elsewhere; **do not clean café or kitchen during lunch**; **unisex** should stay usable when men’s or women’s get **full** cleans; **prefer no full cleans during daytime breaks** (start or end of day); altar **set up / break down every other day**; coffee **setup and breakdown every day**; facility starts clean and ends fully clean; **one full clean per day** for kitchen, men’s, unisex, foyer, **and café** (“where people sit to eat”).
- **Metrics:** Total **volunteer-minutes** by day and for the retreat; volunteer count **assuming no double duty** per day; **average minutes per volunteer** per day; plus a **second** headcount assuming volunteers **pack** as many tasks as fit in slots with **padding** — assumptions must be stated.

---

## Retreat_Volunteer_Schedule.xlsx (v1 workbook)

Sheets: **`1. List by Day-Slot`**, **`2. Slot x Day Matrix`**, **`3. Site Matrix`**, **`4. Notes & Summary`**.

- Implements the **simpler** prompt: **no** urinals, trash, towels/Bona, buy snacks, or front-window rows.
- **Altar:** setup **day 1** start; tidy most mornings; **breakdown + wash on day 6** end (with coffee breakdown that day).
- **Coffee/snack:** setup day 1; tidy morning + afternoon **each day**; breakdown **day 6** end in this draft (see v2 for a different cadence).
- **Main hall:** “clear, full clean & reset” on **days 1, 3, 5, 6**; quick clean on other scheduled end-days.
- **Café:** **full clean at lunch** on some days — which **conflicts** with **Schedule prompt 2** (“no café during lunch”). v1 prompt had not yet added that rule.
- **Notes sheet:** Documents **assumed** Front room and JH office specs where the **original** prompt was incomplete.

---

## Retreat_Volunteer_Schedule_v2.xlsx (v2 workbook)

Sheets: **`1. List by Day-Slot`**, **`2. Slot x Day Matrix`**, **`3. Site Matrix`**, **`4. Metrics`**, **`5. Notes & Rules`**.

- Aligns with **Schedule prompt 2:** urinal tasks **every break** + EOD full mop; **trash** every end day; **front windows** twice; **buy snacks** on selected **lunch** slots; towels/Bona **collect** / **return** pattern; **no café or kitchen cleaning at lunch**; full cleans concentrated at **start** or **end**; unisex **full clean at start** on most days so gendered rooms can be fully cleaned **at end** without blocking the only multi-stall neutral space.
- **Coffee/snack:** **setup every start day**, **breakdown every end day** (heavier daily rhythm than v1’s workbook).
- **Altar:** Notes describe **alternating** setup (e.g. days 1, 3, 5) vs breakdown (2, 4, 6) and ask to **confirm** if that matches intent for “every other day.”
- **Metrics sheet:** Volunteer-minutes per day; **no double duty** counts; **packed** volunteer estimates with **5-minute** inter-task padding, slot capacities, and **first-fit-decreasing** bin-packing — all explicitly labeled as assumptions.

---

## Alignment with the Gmail PDF summary

- **Time grid** matches (30 / 30 / 120 / 30 / 90 minute bands; end-of-day window **variable** by social program).
- **Discrepancy to watch:** Gmail PDF summary table lists end day as **9:00 PM** vs **6:30 PM** if no social event; Word prompts use **8 or 7 PM** without social event depending on version. Treat **“end day” band length** as **configurable** in JewelHeart (label + duration), not hard-coded in one artifact.
- **JewelHeart mapping** (job / slot / task / assignment) is unchanged; see **`SUMMARY-from-gmail-scheduling-pdf.md`**.

---

## Suggested source of truth for implementation

- **Rules and task catalog:** **`Schedule prompt 2.docx`**.
- **Concrete schedule + metrics draft:** **`Retreat_Volunteer_Schedule_v2.xlsx`**, with **open confirmations** from sheet **5. Notes & Rules** (altar/coffee cadence, end-day duration on day 6, any “as-specified” oddities like front room full at 1v).

---

## Open questions (carry into JewelHeart / ops)

1. **Altar:** Confirm **every other day** interpretation (setup vs breakdown) vs daily breakdown for coffee.
2. **End day slot:** Confirm real **start time and length** per evening (social vs not), especially **day 6** close-out.
3. **Front room full (1, 10):** Prompt 2 keeps **1** volunteer for a “full” clean — confirm staffing vs other rooms at 2v.
4. **v1 vs v2:** Do not mix rules: **v1 xlsx** predates **no café at lunch**; use **v2** for automation and UI defaults unless ops explicitly chooses legacy behavior.
