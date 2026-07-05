-- Drop and recreate the dev/test env DBs (run against the "postgres" maintenance DB).
-- Connections to these DBs must be closed first (stop the dev/test services).
DROP DATABASE IF EXISTS karmadots_dev;
DROP DATABASE IF EXISTS karmadots_test;
CREATE DATABASE karmadots_dev OWNER kevinwoods;
CREATE DATABASE karmadots_test OWNER kevinwoods;
