#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(`
  SELECT id, display_name, email, firebase_uid, profile_confirmed_at
  FROM jewelheart_volunteers
  WHERE profile_confirmed_at IS NOT NULL OR firebase_uid IS NOT NULL
  ORDER BY updated_at DESC
`);
console.log(r.rows);
await pool.end();
