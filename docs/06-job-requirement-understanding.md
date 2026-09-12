# 06 — Job Requirement Understanding

## Parse job, don't treat as blob
Extract: must-have, nice-to-have, seniority, domain, exp range, salary, location, remote, responsibilities, implied needs.

Example input: "Need backend who builds APIs for logistics. Must Node + Postgres. Redis/WebSockets plus. Budget 60k/mo. Remote allowed."
Parsed:
```json
{
  "job_title": "Backend Developer",
  "domain": "Backend Engineering",
  "must_have_skills": ["Node.js","PostgreSQL","API development"],
  "nice_to_have_skills": ["Redis","WebSockets"],
  "seniority": "junior to mid",
  "salary_max": 60000,
  "salary_currency": "INR",
  "salary_frequency": "monthly",
  "remote_allowed": true,
  "core_responsibilities": ["Build APIs for logistics"]
}
```
Also infer: realtime tracking → concurrency, location data, perf needs.

## Must-have vs nice-to-have (critical)
Must-have: missing = likely unsuitable (React for frontend, CA for accounting, license for regulated).
Nice-to-have: boost only (Docker, GraphQL, Figma, cloud).
AI must separate correctly. Stored in `jobs` + `job_requirements`.

## Domain-aware evaluation
Same pipeline, different rubric:
- eng: stack, architecture, complexity, deploy, scale, testing
- design: portfolio, process, case studies, research, craft
- marketing: campaigns, metrics, channels, growth
- sales: targets, deal size, industries, outcomes
Use separate prompt templates per domain.

Full parse prompt in 13.
