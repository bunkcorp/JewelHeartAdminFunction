# private-server repository paths & PostgreSQL transaction audit

Audit of how **KarmaDots / JewelHeart `private-server`** uses PostgreSQL pools, implicit per-statement transactions, and explicit `BEGIN`/`COMMIT` blocks. Useful for ACID reasoning and spotting time-of-check vs time-of-use (TOCTOU) gaps.

---

## Repository paths

| Location | Path |
|----------|------|
| **Typical Desktop clone (`buddhist-stone-ios-app`)** | `~/Desktop/buddhist-stone-ios-app/private-server` |
| **Production laptop (SSH `laptop`; example)** | `~/private-server` → `/Users/kevinwoods/private-server` |
| **This JewelHeart specs repo** | Only **`integrations/private-server/jewelheart-service-sdui.fragment.js`** (paste/sync fragment). The full Node server lives in **`buddhist-stone-ios-app/private-server`** (see root `README.md`). |

npm package name: **`karmadots-private-server`** (`package.json`).

---

## DB access baseline (`src/db.js`)

- **`query(text, params)`** uses the shared **`Pool`** and executes **one statement per call**. Each call is implicitly its own Postgres transaction (`BEGIN`/`COMMIT` per statement unless a session already has an open transaction—which the pool does not keep across unrelated `query()` calls).
- **Explicit multi-statement transactions** acquire a **`client`** from **`pool.connect()`**, run **`BEGIN`**, multiple **`client.query(...)`**, then **`COMMIT`** or **`ROLLBACK`**, then **`client.release()`** in **`finally`**.

---

## JewelHeart — explicit transactions (`src/jewelheart/service.js`)

These **bundle multiple writes** in **one** database transaction:

| Function | What is grouped |
|----------|-----------------|
| **`createRetreat`** | Insert retreat + insert retreat admin row |
| **`createJob`** | Insert job + insert subjob rows |
| **`updateJob`** | Optional `UPDATE` job + replace subjobs (`DELETE` + `INSERT`s) |
| **`importVolunteersCsv`** | Per-row volunteer upsert / link logic under a single **`BEGIN`…`COMMIT`** |

---

## JewelHeart — multi-step flows without one explicit spanning transaction

These use **multiple** **`query()`** calls **without** a shared **`BEGIN`/`COMMIT`** on one client.

- Each **individual** SQL statement is still atomic and durable at Postgres defaults.
- **There is no single transaction** across the whole handler: you can see **TOCTOU** races or **partial logical outcomes** if one step fails after another succeeded, depending on the flow.

| Area | Risk / note |
|------|--------------|
| **`createAssignment`** | Reads capacity (`taskRowWithMeta`), then **`INSERT`**. Concurrent callers may both pass the check before inserts land → **possible over-capacity** unless enforced in the database (constraint, trigger, or `SELECT … FOR UPDATE` / stronger isolation). Duplicate `(task_id, volunteer_id)` may still raise **`23505`** (handled in code). |
| **`deleteAssignment`** | **`SELECT`** then **`DELETE`** — small window; usually acceptable. |
| **`deleteVolunteerGlobal`** | **`COUNT`** assignments then **`DELETE`** — TOCTOU if an assignment appears between queries. |
| **`linkRetreatVolunteer`** | Several separate queries; not one encompassing transaction. |
| **`getTaskDetail`** | Multiple reads only — acceptable for snapshot-style reads under default isolation. |
| **`duplicateTask`** | **`SELECT`** then **`createTask`** (`INSERT`); second step can fail without corrupting first. |

---

## CSV import semantics

**`importVolunteersCsv`**: Row-level failures are appended to **`errors`**; the outer transaction still **`COMMIT`s** once after processing all rows. The batch is **all-or-nothing at the COMMIT boundary**, but **failed rows do not abort the whole import**—they are recorded in **`errors`** while successful rows persist (when no outer throw). Confirm this matches product expectations.

---

## Non–JewelHeart handlers (same `db.js` / pool)

| File | Pattern |
|------|---------|
| **`handlers/writeStone.js`** | **Explicit `BEGIN`/`COMMIT`/`ROLLBACK`** — large transactional block. |
| **`handlers/profile.js` (`patchProfile`)** | **Multiple** **`query()`** calls without a wrapping transaction — partial PATCH possible if mid-sequence failure. |
| **`handlers/widgetSync.js`** | **Several** **`pool.query`** calls without **`BEGIN`** — concurrent writers can interleave. |
| **`handlers/getGlobalStats.js`** | Multiple reads/writes touching **`global_stats`** — not one transaction tying leaderboards reads and cache writes together. |

---

## Summary

| Category | JewelHeart coverage |
|----------|---------------------|
| **Strong multi-write atomicity** | `createRetreat`, `createJob`, `updateJob`, `importVolunteersCsv` (per design for CSV semantics). |
| **Single-statement operations** | Most CRUD (`createSlot`, `createTask`, many deletes/updates) — each statement is its own implicit transaction. |
| **Candidates for hardening** | **`createAssignment`** (capacity), **`deleteVolunteerGlobal`** (COUNT vs DELETE); optionally **`patchProfile`**, **`widgetSync`** for cross-table atomicity. |

---

## Suggested hardening directions (optional)

1. **`createAssignment`**: Enforce capacity in SQL (e.g. conditional `INSERT … WHERE … count … < volunteers_needed RETURNING`) or **`SERIALIZABLE`** / **`SELECT … FOR UPDATE`** on the task (or parent) row.
2. **`deleteVolunteerGlobal`**: Single `DELETE … WHERE … AND NOT EXISTS (SELECT 1 FROM … assignments …)`, or transactional block with **`FOR UPDATE`** on volunteer row first.
3. **`patchProfile` / `widgetSync`**: Wrap related updates in **`BEGIN`/`COMMIT`** if all-or-nothing is required across tables.

---

## References (Postgres semantics)

- [PostgreSQL Tutorial: Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)  
- [Reliability and the WAL](https://www.postgresql.org/docs/current/wal-reliability.html)  
- [Concurrency control (MVCC)](https://www.postgresql.org/docs/current/mvcc.html)  

---

*Generated from codebase review of `private-server`; re-run grep / read when refactoring.*
