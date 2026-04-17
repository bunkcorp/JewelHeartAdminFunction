# JewelHeart Admin Function

Specs and database migrations for **JewelHeart** — retreat volunteer scheduling (iOS + Android shells cloned from **KarmaDots**, **server-driven UI** for admin screens).

## API base URL

Same Cloudflare tunnel as KarmaDots:

- **https://api.karmadots.org/jewelheart/...**

OpenAPI: [`openapi/jewelheart.yaml`](openapi/jewelheart.yaml).

## Mobile apps (shell)

- Reuse KarmaDots **Firebase Auth**, **Bearer token** calls, and **SDUI renderer** patterns.
- Point the HTTP client at `https://api.karmadots.org` with paths under `/jewelheart/`.
- Unauthenticated liveness: `GET /jewelheart/health` (for probes; implement alongside other routes on `private-server`).

## Database

Apply once per environment (same Postgres as `private-server` is fine; table names are prefixed `jewelheart_`):

```bash
psql "$DATABASE_URL" -f migrations/001_jewelheart_initial.sql
```

**ACL tables:** `jewelheart_admins` (global Firebase UIDs), `jewelheart_retreat_admins` (per-retreat). Server policy: e.g. global admin **or** row in `jewelheart_retreat_admins` for that `retreat_id`.

## Layout

| Path | Purpose |
|------|---------|
| `openapi/jewelheart.yaml` | Contract for REST + SDUI endpoints |
| `migrations/001_jewelheart_initial.sql` | Enums, tables, indexes, `updated_at` triggers |
| `clients/ios/` | JewelHeart Admin **iOS** (Xcode) |
| `clients/android/` | JewelHeart Admin **Android** (Gradle); open this folder in Android Studio |

**Implemented** in `buddhist-stone-ios-app/private-server`: `GET/POST https://api.karmadots.org/jewelheart/...` (same auth as `/user/*`). Run `npm run db:jewelheart` in `private-server` after setting `DATABASE_URL`. Seed a global admin with `INSERT INTO jewelheart_admins (firebase_uid) VALUES ('your-firebase-uid');` or rely on per-retreat access: creating a retreat adds your UID to `jewelheart_retreat_admins`.
