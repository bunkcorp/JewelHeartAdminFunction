-- Create the dev/test environment databases (retreat/prod uses existing "karmadots").
-- Run against the laptop Postgres 16 (owner role: kevinwoods).
-- Idempotency: CREATE DATABASE has no IF NOT EXISTS; guard before running.
CREATE DATABASE karmadots_dev OWNER kevinwoods;
CREATE DATABASE karmadots_test OWNER kevinwoods;
