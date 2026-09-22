// E2E test: search -> shortlist -> contact -> dashboard reads. Run: node scripts/e2e-test.mjs
// Uses runtime env only for Supabase URL (no keys printed). Hits local dev APIs.
import { readFileSync } from "node:fs";
function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = loadEnv(new URL("../.env.local", import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; } else { fail++; } console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); };

// 1. Fast search finds seeded candidate
const job = {
  title: "Backend Developer (Node/Postgres)", domain: "Software Development", seniority: "mid",
  must_have: ["Node.js", "PostgreSQL"], nice_to_have: ["Redis"],
  min_exp: 1, max_exp: 4, salary_min: 40000, salary_max: 80000,
  currency: "INR", location: "Remote", remote_policy: "remote", employment_type: "full-time",
  description: "Build logistics APIs with Node.js and PostgreSQL. Realtime tracking with WebSockets and Redis a plus. Must own auth, schema design, deployment.",
};
let res = await fetch(`${BASE}/api/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, limit: 20 }) });
let json = await res.json().catch(() => ({}));
ok("fast search 200 + seeded candidate", res.ok && JSON.stringify(json).includes("Test Candidate"), `(${(json.results ?? []).length} rows)`);
const cand = (json.results ?? []).find((r) => (r.full_name ?? "") === "Test Candidate");
const cid = cand?.id ?? cand?.candidate_id;

// 2. Shortlist round-trip
if (cid) {
  res = await fetch(`${BASE}/api/shortlists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate_id: cid, notes: "e2e" }) });
  json = await res.json().catch(() => ({}));
  ok("shortlist save", res.status === 201 || res.status === 200, `(${res.status})`);
  res = await fetch(`${BASE}/api/shortlists?candidate_id=${cid}`);
  json = await res.json().catch(() => ({}));
  ok("shortlist list", res.ok && (json.results ?? []).length > 0);
  // 3. Contact log round-trip
  res = await fetch(`${BASE}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate_id: cid, channel: "email", message: "e2e hello" }) });
  ok("contact log", res.status === 201, `(${res.status})`);
  // 4. Dashboard read
  res = await fetch(`${BASE}/api/candidates?id=${cid}`);
  json = await res.json().catch(() => ({}));
  ok("candidate GET + summary", res.ok && !!json.candidate, `(matches:${(json.matches ?? []).length} views:${(json.contact_log ?? []).length})`);
} else {
  ok("seeded candidate found", false, "(search fallback empty?)");
  fail += 2;
  console.log("FAIL shortlist/contact skipped (no cid)");
}
// 5. Deep judge (tolerant: passes if graceful without key)
res = await fetch(`${BASE}/api/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, limit: 5, deep: true }) });
json = await res.json().catch(() => ({}));
ok("deep search responds", res.ok, `(deep:${!!(json.results ?? [])[0]?.judge}${json.deepError ? " judge-skipped-no-key" : ""})`);
void env;
console.log(`--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
