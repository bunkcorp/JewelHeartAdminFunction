-- Optional retreat window overrides for Manage → Testing (dev/test QA).

ALTER TABLE jewelheart_volunteer_testing_settings
  ADD COLUMN IF NOT EXISTS override_start_date date,
  ADD COLUMN IF NOT EXISTS override_end_date date;
