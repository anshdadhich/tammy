# 05 - Project Depth Evaluation (Secret Sauce)

## Why projects > skills list
Skills lie. Projects prove. To-do app ≠ prod system with auth/payments/realtime/deploy. System must estimate depth.

## What to extract per project
- problem solved
- technical complexity (low/medium/high/very_high + 1-10 score)
- architectural concepts (microservices, event-driven, caching, WebSockets, etc.)
- core + implied technologies
- candidate role + autonomy (solo/contributed/led)
- maturity (prototype/academic/personal/freelance/production/open_source)
- scale indicators (users, req/min, data volume)
- evidence quality (weak/moderate/strong)
- impact, relevance tags, seniority signal, strengths/limitations

## Evidence quality signals
- live link? repo? screenshots/demo video?
- specific role stated? impact/metrics? deployed?
- prod vs tutorial clone? complexity beyond CRUD? problem-solving shown?
Clone + no additions = low value. Real users / real problem = high.

## Project ingestion example
Input: "Built chat app for college using React + Firebase."
AI stores:
```json
{
  "project": "College Chat App",
  "complexity": "Medium",
  "core_problems_solved": ["Real-time state", "Auth", "DB syncing"],
  "technologies_implied": ["WebSockets","NoSQL","Event-driven UI"],
  "impact": "Used by local student body",
  "autonomy": "High (Solo)"
}
```

## Full analysis example
Input: Title "Real-time chat", React/Node/Socket.io/Redis, Render deploy, solo, 200 students at events.
Output:
```json
{
  "problem_summary": "Room-based realtime messaging",
  "technical_complexity": "medium",
  "architectural_concepts": ["realtime","WebSockets","state mgmt","caching","event-driven"],
  "core_technologies": ["React","Node.js","Socket.io","Redis"],
  "implied_skills": ["backend APIs","realtime handling","frontend state","deployment"],
  "scale_indicators": ["200 active users"],
  "autonomy_level": "solo",
  "evidence_quality": "moderate",
  "project_maturity": "personal",
  "relevance_tags": ["real-time","web","backend"],
  "estimated_seniority_signal": "junior",
  "strengths": ["realtime understanding","caching layer","public deploy"],
  "limitations": ["No large-scale prod","No auth/security depth"]
}
```

Depth table `project_depth_analysis` holds this. Search joins it to judge relevance.

## Depth judgment example (why keywords fail)
Need: Mid Backend for Realtime Logistics.
- A: "Used Firebase for chat" → 4/10. Managed service, no concurrency proof.
- B: "Custom Go WebSocket server to track drivers" → 9/10. Direct tracking + concurrency.
Both have "real-time" keyword, depth differs. AI must catch that.

Prompt for extraction in 13.
