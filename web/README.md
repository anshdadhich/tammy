# Tammy - file once, get discovered

Next.js App Router: candidate portfolio pages + HR chat search + JSON API.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
```

## Pages

- `/` - landing (candidates / employers / match engine / FAQ sections)

All other UI routes (`/join`, `/start`, `/hire/*`, `/talent/*`, `/u/*`) were removed; only the landing page and the JSON API remain. Former nav/CTA links to those routes now 404.

## Endpoints

- `POST /api/candidates` → 202 `{ candidateId, status: "processing" }`
- `PUT /api/candidates` `{ id, ...fields }` → 202 (edit, replaces child rows)
- `GET /api/candidates?id=...` → full dossier bundle (email lookup is `POST /api/candidates/lookup`)
- `POST /api/search` `{ job, limit? }` → `{ results, queryText, searchId }`
- `POST /api/shortlists` / `GET /api/shortlists?candidate_id=...`
- `POST /api/contacts` (HR outreach, audit + best-effort email)
- `POST /api/uploads` (photo/resume, after the candidate row exists)
- `POST /api/webhooks/inngest` (background worker endpoint)

## Smoke

```bash
BASE_URL=http://localhost:3000 bash scripts/smoke.sh
# Windows:
#   $env:BASE_URL="http://localhost:3000"; powershell -File scripts/smoke.ps1
```
