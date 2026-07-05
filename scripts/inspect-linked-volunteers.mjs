#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admins = await pool.query(`SELECT firebase_uid FROM jewelheart_admins`);
const vols = await pool.query(`
  SELECT id, display_name, email, firebase_uid IS NOT NULL AS linked, profile_confirmed_at
  FROM jewelheart_volunteers
  WHERE firebase_uid IS NOT NULL
  ORDER BY updated_at DESC
  LIMIT 15
`);
console.log('admins', admins.rows);
console.log('linked volunteers', vols.rows);
await pool.end();
