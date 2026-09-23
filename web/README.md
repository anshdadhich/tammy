# Tammy — file once, get discovered

Next.js App Router: candidate portfolio pages + HR chat search + JSON API.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
```

## Pages

- `/` — landing (candidate path / HR path / find-your-page lookup)
- `/join` — candidate signup: one structured form → mints `/talent/[id]` (legacy `/start` redirects)
- `/talent/[id]` — public dossier (only opted-in contact channels render) + ✎ edit link (legacy `/u/*` redirects)
- `/talent/[id]/edit` — owner edit (signup-email gate), photo upload, delete
- `/hire` — HR gateway (redirects to search or login) → `/hire/search`: brief + filters → ranked results →
  click → two-pane (results sidebar + full dossier), contact + shortlist
- `/hire/dashboard` — shortlist + outreach tracker

## Profile page anatomy (`/talent/[id]`, shared with HR view)

- Header: rounded-square photo, name, headline, chips (domain · YoE · location ·
  availability · visibility), salary line (min expected + currency/frequency · current position)
- Contact (open-contact): HR sees email/phone/LinkedIn/GitHub/portfolio directly;
  public visitors see only switched-on channels
- Contact rule (form-enforced): resume required (Drive link preferred), account
  email automatic, phone or LinkedIn — either one — required; GitHub/portfolio never count
- AI summary: HR view only ("pending" while the pipeline runs), never on the public page
- Skills with proficiency + years; experience accordion; projects max 2/row with
  depth badges (complexity /10, evidence, autonomy, seniority signal, concepts)
- Files: resume Drive preview (lazy-loads on click, graceful "not accessible"),
  photo + portfolio files; owner panel: visibility toggle, contacts, matches

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
