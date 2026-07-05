#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admins = await pool.query(`SELECT firebase_uid FROM jewelheart_admins ORDER BY firebase_uid`);
const vols = await pool.query(`
  SELECT id, display_name, email, phone, firebase_uid, profile_confirmed_at, updated_at
  FROM jewelheart_volunteers
  ORDER BY updated_at DESC
  LIMIT 30
`);
console.log('admins', admins.rows);
console.log('volunteers', vols.rows);
await pool.end();
