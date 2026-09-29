# 11 - MVP, Tech Stack, Build Plan, Operations

## MVP scope (prove: employer finds good candidates fast)
Candidate: register, profile form, resume upload, generated summary, visibility toggle.
Employer: register, create job, search, match reasons, shortlist, direct contact (open model - contact visible).
Admin: approve employers, review profiles, basic analytics.
NOT first: social feed, chat, assessments, resume builder, mobile app, fancy rec engine, huge dashboards.

## Stack
Frontend: Next.js/React. Backend: Node or Python FastAPI. DB: PostgreSQL + pgvector. Auth: Clerk/Supabase Auth/Auth0. Storage: Supabase/S3/R2. AI summary/judge: LLM API. Embeddings: embedding API. Queue: BullMQ/Celery. Email: Resend/Postmark/SendGrid. Simplest: Supabase + Next.js + pgvector.

## Matching service modules
- job parser, candidate retrieval, scoring (hybrid), reranker/judge, explainer, storage. Separate so prompts/weights/models swappable. Golden test set: sample jobs + known goods - regression test each change. Feedback: was match useful? why not (skill/salary/location/quality)?

## Speed
Indexes, vector index, cache repeat, paginate. Fast mode vs Deep mode. Parallel LLM calls.

## Prevent fake/low-quality
Verify email/phone/links, resume, duplicates, AI copy/unrealistic detection, employer report, quality score.

## Salary/stipend
Store amount+currency+frequency+negotiable. Intern stipend ≠ full-time salary - separate handling. Strong constraint but not always absolute: small gap → show with warning; large → filter.

## Location/remote
Structured: country/city/region + remote_pref + relocation. Compare properly: remote-allowed + remote-want = good; onsite-required + remote-only = poor; relocation-open → show with note.

## Seniority
Not just years. Use years + complexity + responsibility + leadership + impact. Careful: "likely junior/mid" if weak evidence. Employer specifies intern/junior/mid/senior/lead/manager.

## Employer card (open model - full info)
Role, exp level, score + sub-scores, matched skills, salary/location/availability fits, AI explanation, project highlights ("delivery tracking realtime Node+Socket.io"), gaps ("no fintech but strong backend/security"), full contact + links + photo, actions: View analysis, Shortlist, Mark contacted/hired, Report.
Goal: decide without reading full resume.
