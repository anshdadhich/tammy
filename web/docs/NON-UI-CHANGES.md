# Non-UI changes in the working tree

> **Note (later):** the UI files this audit references (`hire/page.tsx`,
> `login/page.tsx`, `chrome.tsx`, `bui.tsx`, `candidate/[id]/page.tsx`,
> `dashboard/page.tsx`, …) have since been removed — only the landing page
> and JSON API remain. Kept as a historical snapshot of that review.

Date: 2026-09-11. Scope: everything in `web/` that changes **behavior, data,
API contracts, or auth** rather than visuals. UI-only work (palette, hero,
illustrations, portfolio cover) is listed at the bottom for the commit split.

> Status key: `UNCOMMITTED` = in working tree, not on any branch.
> `COMMITTED (d7c5277 / da533da)` = already on `master` from the parallel session.

---

## 1. Live transparent scoring in `/api/search` — UNCOMMITTED

**File:** `src/app/api/search/route.ts` (+73 lines vs `HEAD`)

What changed:
- Imports `blendWithJudge, scoreCandidate` from `@/lib/scoring-live` (new dep).
- `CAND_COLS` widened with `remote_preference, location_city,
  availability_status` (`src/app/api/search/route.ts:108`).
- After vector grouping, a new scoring pass fetches per-candidate skills
  (`candidate_skills`), projects (`projects`), and depth rows
  (`project_depth_analysis`), builds a `ScoreContext`, and **overwrites**
  `overall_score` / `match_level` with rule-computed values, adding a new
  `sub_scores` object per result. Results are **re-sorted** by the new total
  (`src/app/api/search/route.ts:136-193`).
- Match persistence changed: `candidate_matches.score` now stores the computed
  total (was `null`) and `match_reasons_json` stores `sub_scores` (was `{}`)
  (`src/app/api/search/route.ts:222-228`).
- Deep-judge merge changed: final `overall_score` = 70% rules + 30% judge
  via `blendWithJudge` (was: judge score only)
  (`src/app/api/search/route.ts:243-250`).

Impact: ranking order changes for every search; API response gains
`sub_scores`; historical `candidate_matches` rows (score `null`) are no longer
comparable with new rows. All wrapped in try/catch so scoring failures fall
back to old behavior silently — ranking bugs will be **silent**.

Verify: `POST /api/search` with a known job, compare order before/after;
check `candidate_matches.score` is non-null post-search; force a DB error to
confirm fallback path.

## 2. New scoring engine — UNCOMMITTED (untracked)

**File:** `src/lib/scoring-live.ts` (126 lines, new)

Five 0..1 sub-scores blended by `WEIGHTS`
(`src/lib/scoring-live.ts:92`: semantic .25 / skill .25 / depth .20 /
constraints .15 / seniority .10) into 0..100, with levels
strong ≥ 75 / partial ≥ 50 / weak (`matchLevel`).

Notable rules (all deterministic, no tests in repo):
- `semanticFromDistance`: pgvector cosine distance mapped `0..1.2 → 1..0`;
  **null distance scores 0.5** (mid, not bottom).
- `skillScore`: must-have × 0.75 + nice-to-have × 0.25; a skill in ≥2 projects
  = 1.0, 1 project = 0.7, **listed-but-unproven = 0.4**.
- `depthScore`: no projects = 0.3; mixes complexity, evidence quality
  (`weak .3 / moderate .65 / strong 1`), profile strength.
- `constraintsScore`: salary over max but within +20% = 0.4, over that = 0;
  location substring logic around `remote_allowed` / `remotePref`; availability
  regexes on `/immedi/i` and `/notice/i`.
- `seniorityScore`: under min penalized 0.2/yr from 0.5; over max penalized
  0.1/yr from 0.7.

Risks: magic numbers everywhere, zero unit tests, field-name coupling to the
real schema (`remote_preference`, `availability_status` as free text). Recommend
`vitest` coverage for the pure functions before trusting rankings.

## 3. Hire results: min-score filter + `sub_scores` breakdown — UNCOMMITTED

**File:** `src/app/hire/page.tsx`

- New `minScore` state (default 0) + range slider 0..90 step 5; results are
  **filtered client-side** (`visible`), header shows `visible/total`, empty
  state + reset button when all are filtered out. Filtering never re-runs the
  search (stated in UI, true in code).
- Reads new `row.sub_scores` and passes a `breakdown` prop into `MatchCard`
  (new component contract — see §6).

Behavior note: the slider default 0 = no-op, so existing UX is unchanged until
dragged. The filter threshold uses `50` as fallback for unscored rows.

## 4. Dev-only one-tap test logins — UNCOMMITTED

**File:** `src/app/login/page.tsx` (+35)

- `DEV_TEST = process.env.NODE_ENV !== "production"` gate; three buttons
  (admin / employer / candidate) calling `supabase.auth.signInWithPassword`
  with **hardcoded credentials** (`<role>@test.com` / `Test@1234`), then the
  normal `ensureUserRowAndHome()` flow.
- Failure message tells the dev to run `scripts/reset-test-data.mjs` first.

Risk: low while the gate holds, but hardcoded credentials in source are a
leak vector if the gate is ever bypassed (e.g. `NODE_ENV` mis-set in a preview
deploy, or the file copied). Recommend moving creds to `.env.local` or
deleting before any shared preview URL.

## 5. Command-palette keyboard + ARIA upgrade — UNCOMMITTED

**File:** `src/components/chrome.tsx` (+85/−19)

- Arrow-key navigation + Enter-to-run, hover selection sync, focus reset +
  autofocus on open, memoized filtering (now matches against group labels too).
- New `signup` command, regrouped labels (`group: Candidates/Employers/…`),
  combobox/listbox ARIA wiring, `aria-modal` dialog, keyboard-hint footer.
- Client-only, no backend touch. Behavior change (new interactions), not
  visual restyle — flagging here so it isn't mistaken for a pure re-skin.

## 6. `MatchCard` `breakdown` prop — UNCOMMITTED (in `bui.tsx` diff)

`MatchCard` accepts optional `breakdown: { label, value }[]` and renders the
five sub-scores. Backwards-compatible (optional), but it is the display half of
the §1 contract change — landing one without the other leaves dead code.

## 7. Docs (untracked, non-code)

- `docs/ARCHITECTURE.md` — new doc file from the parallel session. Review
  before commit; docs are cheap but this one may describe intended backend
  behavior.

---

## Confirmed UI-only (safe to commit as the redesign)

`src/app/page.tsx` (hero block), `src/components/SphereHero.tsx` (new),
`src/components/spot.tsx` (new), `src/app/globals.css` (tokens + hero/gallery
CSS), `src/app/layout.tsx` (Lora font), `src/app/landing-vbg.css`,
`src/app/orbit.css`, `src/components/OrbitHero.tsx` + `src/components/orbit.css`,
`src/app/candidate/[id]/page.tsx` (cover markup), `src/app/dashboard/page.tsx`
(`art` prop only), `src/components/bui.tsx` **minus** the `breakdown` hunk.

Suggested split: commit the UI list first, keep §1–§4 uncommitted for separate
review + tests. `hire/page.tsx`, `login/page.tsx`, and `bui.tsx` need hunk-level
staging (`git add -p`) because they mix UI and behavior edits.
