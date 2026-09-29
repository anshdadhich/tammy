# 04 - Candidate Data Collection + No-BS Summaries

## Intake form sections (detailed but manageable)
1. Basic: name, email, phone, location, optional photo (visible directly in open model)
2. Professional identity: desired role, domain, years exp, current role, headline
3. Skills: free entry → normalized to canonical (JS→JavaScript, ReactJS→React, Postgres→PostgreSQL, ML→Machine Learning)
4. Work experience (per entry): company, title, dates, description, achievements, tech stack, evidence links. Push for specific achievements, not generic duties.
5. Projects (most important - see 05): title, description, problem solved, tech, role, links (live/repo/demo), impact, users/scale, hardest challenge, what you personally built, project type
6. Education: institution, degree, field, years, achievements
7. Preferences: min salary/stipend + currency + frequency + negotiable, location pref, remote pref, relocation, availability, notice
8. Consent: processing + visible-to-verified-employers agreement, withdraw anytime, delete/export rights

Resume upload: parse to prefill, candidate must confirm/edit. Never trust parser blindly.

Smart intake (to get depth): AI-assisted conversational follow-ups.
- Candidate: "I built an e-commerce site."
- AI: "What was hardest bug in checkout?"
- Candidate: "Payment webhook failed on DB lock."
- AI: "How did you fix?"
- Candidate: "Queue with BullMQ async."
Save Q&A as part of project evidence. This is high-signal data resumes miss.

## No-BS summary principles
Factual, evidence-based, concise, structured, no marketing fluff, no exaggeration, useful for search + human review.
Must answer: What can they do? What evidence? In what domain? At what level? With what tools? Constraints? What's missing?

Bad: "Hardworking passionate developer with excellent communication and hunger for learning." → useless.
Good: "Backend dev, 2y, Node/Express/Postgres, auth/caching/payments/deployment, inventory system for 3 teams, strong API + DB optimization, no frontend ownership, remote, 45k/mo min." → useful.

Include: role identity, years, strongest stack, project complexity, impact/scale, constraints, links/evidence, salary/location, availability, gaps.

For non-tech adapt: design → portfolio/case studies/process/tools; marketing → campaigns/metrics/channels; sales → targets/deal size/industries.

## Storage
- `summary_markdown` for humans/UI/LLM context/export (.md/.txt secondary artifact in object storage if needed)
- `summary_json` for machines/filtering/matching

## Example .md summary
```md
# Candidate Summary
## Identity
- Role: Backend Developer
- Domain: Software Development
- Experience: 2 years
## Core Skills
- Node.js, Express, PostgreSQL, Redis, REST APIs
## Evidence
- Built order management APIs for e-commerce
- JWT auth + RBAC
- Improved response time via Redis caching
## Project Depth
- DB schema design, prod deployment, payment integration
## Education
- B.Tech Computer Science
## Constraints
- Location: Remote preferred
- Minimum salary: ₹50,000/month
- Availability: Immediate
## Gaps
- No cloud infra ownership
- No team leadership
```

## Example JSON summary
```json
{
  "professional_identity": "Backend developer with 2 years",
  "core_skills": ["Node.js","Express","PostgreSQL","Redis"],
  "evidence": ["Built REST APIs for e-commerce","Improved perf via Redis"],
  "measurable_outcomes": ["Reduced response 30%"],
  "education": "B.Tech Computer Science",
  "location_preference": "Remote",
  "minimum_salary": 45000,
  "salary_currency": "INR",
  "salary_frequency": "monthly",
  "availability": "Immediate",
  "gaps": ["No cloud ownership mentioned"]
}
```

LLM must not invent. Missing = "Not specified." Prompt in 13.
