# 08 — Retrieval, Chunking, Embeddings

## Don't embed whole profile as blob
Split into meaningful chunks: summary, per-experience, per-project, education, skills.

Example project chunk:
```
Project: Expense Tracker
React, Node, Postgres. JWT auth, REST, charts, monthly reports. AWS + CI/CD.
```
Example experience chunk:
```
Frontend Dev at ABC: dashboard UI, APIs, reusable comps, perf +30%.
```

Each chunk: candidate_id, chunk_type, text, metadata, embedding.

Metadata example:
```json
{
  "chunk_type": "project",
  "project_title": "Delivery tracking",
  "technologies": ["Node.js","PostgreSQL","Socket.io","Redis"],
  "domain_tags": ["backend","real-time","logistics"],
  "complexity": "high",
  "evidence_quality": "strong",
  "candidate_id": "abc123"
}
```
Enables filtered vector search: domain=frontend + skill=React + exp>=2 + remote_ok.

## Improving relevance
- Metadata filters: domain, role, skills, seniority, exp, location, salary
- Field weighting: experience/projects > hobbies; skills > generic; recent > old
- Recency: recent roles, recently updated, currently available rank higher
- Negative signals: incomplete, no links, contradiction, salary mismatch, inactive → downrank
- Freshness score: <30d high, 180d+ low

## Source of truth
Postgres is the source of truth: profiles, structured fields, and rows live there.
The pipeline only manages derived retrieval artifacts (chunks, embeddings) and can be
re-run from the profile rows at any time — search never reads anything but Postgres.

## Implementation
MVP: Next.js + Postgres + pgvector + LLM API + embedding API + background queue (BullMQ/Celery) + auth + storage + email.
On profile create/update (async): normalize → summary → project analysis → chunks → embeddings → active.
On search: parse job if needed → structured filters → vector+keyword → group by candidate → hybrid score → rerank/judge → store matches → return with explanations.

Fast vs Deep mode: fast = hybrid only (quick); deep = +LLM judge (3-5s, better).

Indexes: structured fields, vector HNSW/IVFFlat, pagination, caching repeat searches.
