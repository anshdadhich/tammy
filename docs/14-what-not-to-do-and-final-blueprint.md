# 14 - What Not To Do + Final Blueprint + Build Order

## What NOT to do
- No public candidate directory (privacy/trust).
- No keyword-only search.
- No AI inventing skills/exp (kills trust).
- No excess personal data.
- No every-category at once - one niche.
- No show-all to all employers - matched only (but with open contact per your rule).
- No stale DB - freshness matters.
- No feature bloat before core value proven.
- (REMOVED per you: no hidden-contact gate, no anonymized-first stage.)

## Best approach (one paragraph, revised)
Use PostgreSQL source of truth, factual markdown summary per candidate, split into structured chunks, embeddings for semantic search, hybrid retrieval (filters + keyword + vector + rerank + LLM judge). Keep no candidate-to-candidate browsing, only matched search for verified employers, with direct visible contact to move fast. Start niche, manually verify first 100, focus on fast explainable shortlists.

## Winning version
Private talent DB + structured profiles + factual AI summaries + hybrid+judge matching + direct contact (open) + niche launch.

## Practical build order
1. Pick niche (e.g., backend for startups India).
2. Candidate form (role/skills/projects/exp/salary/location/availability/links).
3. Employer job form (role/skills/exp/salary/location/remote/duties).
4. DB schema (users, candidates, projects, depth, skills, chunks, employers, jobs, matches, shortlists, contact_log, audit).
5. Profile pipeline (normalize → summary → depth → chunks → embeddings, async).
6. Search pipeline (parse → filter → hybrid → rerank → judge → explain → store).
7. Shortlist + direct contact + logging (no approval).
8. Manually recruit 100 + 5 employers, semi-manual first matches.
9. Improve prompts/scoring/UI from feedback, golden tests, analytics on searches/shortlists/contacts/hires.

## Growth phases
Phase1 manual marketplace (50-100 profiles, 3-5 reqs, manual match). Phase2 MVP (forms+DB+summary+search+shortlist+open contact). Phase3 AI matching (embeddings, hybrid, explanations, rerank). Phase4 scale (domains, verification, notifications, dashboard, pricing).

If built this way, employers feel Senior Recruiter behind bar, not dumb search - and HR gets candidates fastly without applications.
