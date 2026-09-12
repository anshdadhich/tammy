# matching/ — pipeline module draft

Flow: `parse -> filter -> embed -> hybrid top30 -> rerank/rules -> judge top10 -> final`

```
JD text --[prompt 13#3]--> JobReq (types.ts)
        --[hybrid.buildPrefilterQuery]--> candidate ids (<=2000, "Bouncer")
        --[voyage.embedQuery + embedChunks]--> vectors (voyage-4-lite)
        --[hybrid vector + keyword]--> ranked chunks
        --[hybrid.combineRanks RRF]--> HybridHit[30] ("Scout")
        --[scoring.* rules]--> SubScores + final 0..100 ("Reranker/rules")
        --[judge.judgeTop x10 parallel]--> JudgeResult ("Judge")
        --[scoring.blendWithJudge 0.7/0.3]--> MatchScore[10] ("Reporter")
```

## Files

| File | Covers |
|---|---|
| `types.ts` | `CandidateChunk`, `ChunkMetadata`, `JobReq`, `SubScores`, `HybridHit`, `MatchScore`, `MatchLevel` |
| `voyage.ts` | `embedTexts` (`input_type` document/query), `embedChunks`, `embedQuery`, `buildJobQueryText`. Needs `VOYAGE_API_KEY`. |
| `hybrid.ts` | `buildHardFilterWhere` / `buildPrefilterQuery`, `buildVectorSearchQuery` (pgvector `<=>`), `buildKeywordSearchQuery` (ILIKE + `pg_trgm`), `combineRanks` (RRF, top30). Returns `{text, values}` for any pg client. |
| `judge.ts` | `JudgeProvider` interface, `defaultOpenAIProvider` (cheap model, default `gpt-4o-mini` via `JUDGE_MODEL`), `JUDGE_SYSTEM_PROMPT` (docs/13#4), `judgeCandidate`, `judgeTop` (parallel, null-tolerant), `parseJudgeOutput` (-> docs/13#5 shape). |
| `scoring.ts` | `final = 0.25 semantic + 0.25 skill + 0.20 depth + 0.15 constraints + 0.10 seniority`; helpers `semanticFromDistance`, `skillScore` (evidence-weighted), `depthScore`, `constraintsScore`, `seniorityScore`, `fitLabel`, `blendWithJudge` (0.7 rules + 0.3 judge). |

## Required Postgres setup (later migration)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- profile_chunks(embedding vector(<dims>)) with HNSW index; GIN on text for trgm
```

## Env

- `VOYAGE_API_KEY` — embeddings
- `OPENROUTER_API_KEY` (or `LLM_API_KEY`) + optional `JUDGE_MODEL`, `OPENROUTER_BASE_URL` — judge

## Integration TODO (after Next.js scaffold)

1. Add `pg` (or Drizzle) client + run builders in a `POST /api/search` route.
2. Group ranked chunks by candidate before `combineRanks`; attach per-skill evidence counts for `skillScore`.
3. Fast mode: skip `judgeTop`, return rule scores. Deep mode: `judgeTop(10)` then `blendWithJudge`.
4. Persist `MatchScore` rows + cache repeat searches.
