# 02 — Product Flow (Open-Contact Version)

> REVISION: No hidden-contact gate. No anonymized stage. No candidate approve-to-reveal. Verified employer sees full contact immediately on match.

## A. Candidate flow
Join as to-get-hired, fill form:
- basic info: name, email, phone, location
- professional identity: desired role, domain, years exp, current role, headline
- skills (normalized later)
- work experience (per-role entries)
- projects (structured — see 05)
- education
- links: GitHub, portfolio, LinkedIn, resume PDF
- desired role/domain, min salary/stipend + currency + frequency + negotiable flag
- location preference, remote preference, relocation openness
- availability, notice period
- photo (optional — visible directly in open model, see bias note in 12)
- consent for processing + visibility toggle (visible / hidden / inactive)

System after submit (async background job):
1. validate
2. normalize skills
3. generate factual summary (.md + JSON)
4. analyze project depth
5. create searchable chunks + embeddings
6. mark profile active if consent + visible

Candidate controls: edit anytime, toggle visibility, delete/export data.

Candidate CANNOT browse other candidates. No public profile URLs.

## B. Employer flow
Register with company details → verify/approve → create job:
- job title, domain, seniority
- must-have skills, nice-to-have skills
- experience range min/max
- salary/stipend budget min/max + currency
- location, remote/hybrid/onsite, relocation allowed
- job description + responsibilities
- start date, employment type
- screening requirements

Press **Search** → system returns:
- best matches ranked
- match score + sub-scores
- reasons for match + project evidence
- strengths + gaps/risks
- salary fit, location fit, availability
- full contact info visible immediately (name, email, phone, links, photo)
- actions: shortlist, save, mark contacted/hired, report bad profile

No free browsing of all candidates — only matched results per job search. Rate-limited, audit-logged.

## C. Hiring flow (open — no approval)
1. Employer searches
2. Sees full matched profiles with contact
3. Shortlists / contacts directly via email/phone
4. System logs view/shortlist/contact
5. Optional: candidate can still set visibility off to opt-out of future searches

Why open per your request:
- fastest for HR — "just get candidates fastly"
- no waiting for candidate accept
- Trade-off: more spam/exposure risk, more bias risk — mitigations in 09.
