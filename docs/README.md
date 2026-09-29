# Reverse Hiring Platform - Complete Blueprint Index

> Source: full chat with Qwen 3.8 Max + your original idea + 2 deep-matching responses, combined and de-duplicated.
> Important change per your request: **NO hidden contact info gate.** Contact details are visible directly to verified employers on match. No approval / unlock step.

## Your original idea (preserved verbatim intent)
- Flow very simple for people who want to get hired: join platform as to-get-hired, fill form with all details - name, education, work experience, projects, things built, anything to share, photo, minimum stipend/salary, job location, domain, etc.
- We create a summary and a .txt or .md for each profile. No one is able to check others' profile.
- For each profile a summary - no BS summary, actual summary with technical / field-related depth - complete talent database.
- To hire (HR): register, fill all details of role hiring for - stipend, experience required, etc., press search, tool uses database + AI + other techniques, shows best possible matches.
- People don't have to apply, HR can just get candidates fastly.

## Doc map - read in order
1. `01-vision-and-opinion.md` - honest opinion, risks, niche-first rule
2. `02-product-flow.md` - candidate flow, employer flow, open-contact hiring flow
3. `03-database-vs-txt-and-schema.md` - why DB first, Postgres + pgvector, full tables + SQL
4. `04-candidate-data-and-summaries.md` - intake form, no-BS summary format + JSON
5. `05-project-depth-evaluation.md` - evidence graph, complexity, autonomy, examples
6. `06-job-requirement-understanding.md` - job parsing, must-have vs nice-to-have
7. `07-matching-pipeline-deep-understanding.md` - funnel, hybrid, rerank, LLM judge (best of both Qwen answers)
8. `08-retrieval-chunking-embeddings.md` - chunks, metadata, field weighting, recency
9. `09-privacy-visibility-open-contact-model.md` - revised privacy: open contact, no hidden gate
10. `10-growth-candidates-employers.md` - niche seeding, acquisition, cold-start, concierge MVP
11. `11-mvp-tech-stack-build-plan.md` - MVP scope, stack, services, speed, feedback loop
12. `12-matching-score-evidence-quality-constraints.md` - scoring formula, evidence quality, salary/location/seniority, bias note
13. `13-prompts-library.md` - copy-paste prompts: summary, project depth, job parse, judge
14. `14-what-not-to-do-and-final-blueprint.md` - anti-patterns, best approach paragraph, practical build order

## Open-contact rule (applies everywhere)
- OLD RULE (REMOVED): candidate contact info hidden until candidate approves or employer unlocks with consent.
- NEW RULE (ACTIVE): verified employer sees full profile + contact (name, email, phone, links, photo if provided) immediately in match results. No shortlist-then-wait, no unlock.
- Candidates still cannot browse each other. No public directory. Employers cannot browse all freely - only matched results per search. All views still audit-logged.
