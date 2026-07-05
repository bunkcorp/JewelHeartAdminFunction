#!/usr/bin/env node
import { query } from '../src/db.js';

const id = '8ee571ce-5ce1-4ce5-8fbf-bfe1bc45e95e';
const { rows } = await query(
  `UPDATE jewelheart_volunteers
   SET display_name = $1, updated_at = now()
   WHERE id = $2
   RETURNING id, display_name, email, phone`,
  ['Ann Esckilsen', id],
);
console.log(JSON.stringify(rows[0], null, 2));
