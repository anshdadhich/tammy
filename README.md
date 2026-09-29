# Reverse Hiring — get discovered, hire fast

Candidates create one deep profile once. Employers search with AI understanding
(not keywords) and see best matches with contact directly (open-contact model:
no unlock gate; `contact_log` is audit-only).

Monorepo layout: `web/` (Next.js app: portfolio pages + HR search + JSON API) + `supabase/` (SQL) + `docs/` (blueprint).

Flow: landing `/` only — all app UI routes (`/join`, `/talent/[id]`, `/hire/*`, `/start`, `/u/*`) were removed; the JSON API and background pipeline remain fully functional.

## Quickstart

### 1. Supabase SQL — run in this order (SQL Editor)

1. `supabase/schema.sql` — tables, indexes, RLS
2. `supabase/seed_skills.sql` — ~40 canonical skills
3. `supabase/match_chunks.sql` — `match_chunks` RPC for vector search
4. `supabase/seed_demo.sql` — 6 demo candidates + 2 jobs + zero-vector chunks
   (lets search/API work with no Voyage key; real pipeline overwrites vectors)
5. `supabase/oss_contributions.sql` — open source contributions table + RLS
   (required for the Open Source profile section; safe to re-run anytime)

Requires extensions: `vector`, `pg_trgm`, `unaccent`, `pgcrypto` (created by schema.sql).

### 2. Env vars (names only — copy `web/.env.example` to `web/.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VOYAGE_API_KEY`
- `OPENROUTER_API_KEY`
- `JUDGE_MODEL`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `RESEND_API_KEY` (optional — email sends are graceful no-ops without it)
- `RESEND_FROM` (optional — defaults to Resend onboarding sender)
- `NEXT_PUBLIC_SITE_URL` (optional — used in email links)

### 3. Run the app

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Pages: `/` (landing) only — UI routes (`/join`, `/talent/[id]`, `/hire/search`, `/hire/dashboard`, legacy `/start`, `/u/*`) were removed; the JSON API is unchanged.

### 4. Inngest dev (background pipeline: normalize → summary → depth → chunks → embed)

```bash
cd web
npx inngest-cli@latest dev   # serves local worker; app endpoint is /api/webhooks/inngest
```

If Inngest is offline, `POST /api/candidates` still saves the profile (202) and
the worker picks it up later.

### 5. QA smoke

```bash
BASE_URL=http://localhost:3000 bash web/scripts/smoke.sh
# Windows:
#   $env:BASE_URL="http://localhost:3000"; powershell -File web/scripts/smoke.ps1
```

Checks `GET /` → 200 (JSON index) and `POST /api/search` with `{}` → 400.

## API cheatsheet

- `POST /api/candidates` → 202 `{ candidateId, status: "processing" }`
- `PUT /api/candidates` `{ id, ...fields }` → 202 (owner edit, replaces child rows)
- `POST /api/search` `{ job, limit?, deep? }` → `{ results, queryText, searchId }`
- `POST /api/shortlists` `{ candidate_id, job_id?, employer_id?, status?, notes? }` → emails candidate (best-effort)
- `POST /api/candidates/lookup` `{ email }` → `{ exists }` (rate-limited existence check; id never disclosed; full bundles only via `GET /api/candidates?id=`)
- `POST /api/contacts` `{ candidate_id, job_id?, employer_id?, channel?, message? }` → audit-logs + emails candidate (best-effort)

All email sends are wrapped in try/catch — missing `RESEND_API_KEY` never breaks an API response.

## Deploy notes (Vercel + Supabase)

- Supabase: create project → run SQL in order: `schema.sql` → `storage.sql` → `contact_prefs.sql` → `seed_skills.sql` → `match_chunks.sql` → `migrations/20260923_hardening.sql` → `migrations/20260928_role_guard.sql` → `migrations/20260928_contact_email_idx.sql` → `migrations/20260929_quotas.sql` → `migrations/20260929_employer_linkedin.sql` → enable Auth (Email + OTP) → add Storage buckets if needed.
- Vercel: import `web/` as the project root, set all env vars above (server: `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`; public: `NEXT_PUBLIC_SUPABASE_*`), deploy. Prod hardening: HR verification is fail-closed by default (no flag needed) + set `BOOTSTRAP_SECRET` (locks `/api/admin/bootstrap`).
- Inngest: create an Inngest project, set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` in Vercel, point Inngest to `https://<app>/api/webhooks/inngest` as the serving endpoint.
- Post-deploy: re-run `seed_demo.sql` only for staging; never on prod (demo `@demo.local` rows).
