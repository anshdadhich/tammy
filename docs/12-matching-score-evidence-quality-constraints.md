# 12 — Scores, Evidence, Constraints, Bias, LLM Use

## Score composition (adjust per niche)
`final = 0.25*semantic + 0.25*skill_evidence + 0.20*project_depth + 0.15*constraint_fit + 0.10*seniority + 0.05*freshness/evidence`
Alt simple: 0.35 semantic +0.25 must-have +0.15 exp +0.10 loc/remote +0.10 salary +0.05 freshness/verify.
Show sub-scores: Technical 9/10, Depth 8/10, Salary 10/10, Location 7/10, Availability 9/10, Evidence 8/10.

Hard exclusions/downranks: not open, impossible location, huge salary gap, missing must-have, unavailable start.

## Evidence quality (see 05)
Strong = deployed + repo + demo + role + metrics + real users + beyond CRUD + problem-solving. Weak = skill listed once, no links, tutorial clone. Rank strong higher.

## Avoid keyword limits (examples)
"High-traffic" ≈ "5k req/min optimized". "Independent startup-minded" ≈ solo+deploy+iteration evidence. Don't over-infer — unknown if no evidence.

## LLM use carefully
Use for: summarization, extraction, rerank, explanation. Don't rely alone: hallucinates, biased, misses hard constraints, inconsistent. DB+filters = control, scoring = explainability.

## Explainability = trust
Always show why: matched reqs, project evidence, fits, gaps. Huge advantage.

## Admin/moderation
Human review early: spam, fakes, employer approval, summary quality, abuse. Not fully auto day one.

## Legal
Consent, delete/export, retention, secure, audit, minimize sensitive data. Comply with local DP law.

## Bias (adapted to open-contact)
Original: hide name/photo first, skills first, reveal after consent. You removed gate, so bias protection lower. Keep: evidence-first UI ordering, optional photo with disclosure, don't decide on protected attributes, log views. Market as evidence-first but acknowledge open contact trade-off.
