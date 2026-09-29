# 07 - Matching Pipeline: Deep Understanding (Combined Best)

> Combines both Qwen deep-matching answers. Goal: actual comprehension of hiring need + candidate detail, not keyword search.

## Why keywords dead
Job: "scalable real-time systems" vs candidate: "WebSockets + Redis Pub/Sub 10k concurrent" → keyword misses, comprehension hits. Keyword rewards buzzword spam, punishes plain describers.

## Architecture: funnel (can't LLM 5000 at once - cost/slow)
- 10k → hard filters → 2k → skill/domain → 500 → hybrid retrieval → 100 → reranker → 20 → LLM judge → top 10 shown.

### Step 1: Bouncer - Hard SQL filters
Eliminate impossible: salary fit, location/remote, availability/start, min exp, visible + consent, work auth if needed.
5k→1k. Fast, indexed.

### Step 2: Scout - Hybrid retrieval
- Structured/keyword (BM25 / full-text): exact skills, title, domain, normalized skills with evidence weight (React in 3 projects > listed once).
- Semantic (embeddings: text-embedding-3-large or BGE-M3): job embedding vs `profile_chunks` embeddings. Catches "high-traffic" ≈ "5k req/min optimized."
Combine via Reciprocal Rank Fusion or weighted score. 1k→50.

### Step 3: Reranker (cheap deep)
Cohere Rerank 3 or BGE-Reranker: reads query + doc, conceptual score. Cheaper/faster than LLM. 50→20-30.

### Step 4: Judge - LLM deep evaluation (the magic)
Take top 50 (or 20) with full JSON: summary + project_depth + work exp. Send to Claude 3.5 Sonnet / GPT-4o / GPT-4o-mini with rubric prompt (in 13). Parallel async calls.
Scores: Technical Depth 0-25, Relevance 0-25, Impact/Ownership 0-25, Red-flags/BS 0-25 → total 0-100 + justification + gaps + interview questions.
Sort, show top 10.

Cost: 50 × ~2000 in + 500 out ≈125k tokens ≈ $0.05-0.15/search (B2B cheap). Speed: parallel → 3-5s.

UX loading to show thinking:
1. Filtering salary/location… (instant)
2. Finding conceptually similar… (1s)
3. Deep-analyzing project complexity top 50… (3s)
4. Generating reasons + interview Qs… (done)

### Step 5: Reporter - Explainability
Not just "87%". Show matched/ missing, project highlight, salary/location/seniority fits, gaps, interview Qs.
Example healthcare Data Engineer:
- Sarah 94%: secure financial pipeline AWS KMS Python → PII handling transfers to HIPAA, 5M rows/day encrypted. Gap: no HL7/FHIR.
- John 72%: Python marketing pipelines, no secure/sensitive evidence. Gap: compliance depth.
AI understood Finance+KMS = secure PII capacity, not keyword HIPAA.

## Example judge output (logistics backend)
```json
{
  "overall_score": 87,
  "match_level": "strong",
  "matched_requirements": ["Node.js","Postgres","APIs","Realtime via Socket.io"],
  "missing_requirements": ["No logistics domain explicit"],
  "project_evidence": ["Delivery tracking realtime","Redis caching","Public deploy"],
  "strengths": ["Direct realtime","Relevant stack","Deploy+perf"],
  "gaps": ["No enterprise logistics"],
  "risk_factors": ["Scale unclear"],
  "salary_fit": "good",
  "location_fit": "good",
  "seniority_fit": "good",
  "recommendation": "Strong junior-mid backend, tracking project maps to platform",
  "interview_questions": ["How handle reconnect/failures?","DB design for tracking?","What for 10k concurrent?"]
}
```

## Tech for understanding
- Embeddings: text-embedding-3-large / BGE-M3
- Rerank: Cohere Rerank 3 / BGE-Reranker
- Judge: Claude 3.5 Sonnet / GPT-4o-mini, forced structured JSON
