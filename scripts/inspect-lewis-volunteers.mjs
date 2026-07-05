#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(`
  SELECT id, display_name, email, phone,
         firebase_uid IS NOT NULL AS linked,
         profile_confirmed_at
  FROM jewelheart_volunteers
  WHERE display_name ILIKE '%lewis%'
     OR email ILIKE '%djlewis%'
     OR email ILIKE '%triadic%'
  ORDER BY display_name
`);
console.log(JSON.stringify(rows, null, 2));
await pool.end();
