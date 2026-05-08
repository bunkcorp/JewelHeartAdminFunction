Reference exports from Downloads (scheduling prompts, volunteer schedule spreadsheets, Gmail PDF).
Copied 2026-04-24.

Artifacts (2026-05-08):
  Retreat_Volunteer_Schedule_v5.xlsx  (July 20–26, 2026 retreat; five sheets: list, matrix, site matrix, metrics, notes)
  Merit-Board-example.pdf  (visual reference; scanned-style PDF, little extractable text)
  Merit-Board-Summer-2024-photo.png  (physical board photo: days × task columns; matches David’s “former Merit Board” and informs Site Matrix layout)

Merit Board (physical) vs digital Site Matrix:
  Rows are days (Mon–Sun). Columns are recurring “sites” or duty families (tea, trash, kitchen/cafe, restrooms split, floors split, altar). Handwritten names are assignments. The admin “Site matrix” tab is the same grid idea: site/job rows, day columns, cell text = slot-prefixed tasks (see SUMMARY-from-david-schedule-artifacts.md).

Import into Postgres (same schema as private-server / karmadots.org/login):

  scripts/import_retreat_volunteer_schedule_v5.py

  Default: reads sheet "1. List by Day-Slot", emits SQL (DELETE one stable retreat UUID, INSERT retreat, jobs, slots, tasks).
  Optional: --merge-site-matrix (merge sheet 3 with dedupe; slot times taken from list sheet),
            --verify-site-matrix (stderr warnings if list vs site matrix differ),
            --export-notes (writes Retreat_Volunteer_Schedule_v5_notes_export.txt only),
            --apply (runs psql with DATABASE_URL). Set JEWELHEART_SEED_FIREBASE_UID to insert retreat admin.

  Sheet "2. Slot x Day Matrix" is not imported (context only; slots come from the list sheet).

Human-readable distillations:
  SUMMARY-from-gmail-scheduling-pdf.md  (Gmail thread)
  SUMMARY-from-david-schedule-artifacts.md  (Schedule prompt.docx/x, Retreat_Volunteer_Schedule*.xlsx)
