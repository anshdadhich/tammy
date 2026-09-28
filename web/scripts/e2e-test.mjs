import { loadEnv } from "./lib/env.mjs";

const env = loadEnv(new URL("../.env.local", import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3000";
const HR_EMAIL = process.env.E2E_HR_EMAIL || env.E2E_HR_EMAIL || "employer@test.com";
const HR_PASSWORD = process.env.E2E_HR_PASSWORD || env.E2E_HR_PASSWORD || "Test@1234";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; } else { fail++; } console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); };

async function hrSignIn() {
  if (!SUPABASE_URL || !ANON_KEY) {
    ok("e2e env (supabase url + anon key)", false, "(set in .env.local)");
    return "";
  }
  const tok = await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: HR_EMAIL, password: HR_PASSWORD }),
  })).json().catch(() => null);
  if (!tok?.access_token || !tok?.refresh_token) {
    ok("hr password sign-in (run reset-test-data first)", false, `(${tok?.error_description ?? tok?.error ?? "no-token"})`);
    return "";
  }
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const session = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600),
    token_type: "bearer",
    user: tok.user ?? null,
  };
  const jar = `sb-${ref}-auth-token=${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const me = await (await fetch(`${BASE}/api/session/hr`, { headers: { Cookie: jar } })).json().catch(() => null);
  ok("hr session via supabase auth", me?.email === HR_EMAIL.toLowerCase(), `(${me?.email ?? "no-session"})`);
  return me?.email ? jar : "";
}

const HR_COOKIE = await hrSignIn();

const job = {
  title: "Backend Developer (Node/Postgres)", domain: "Software Development", seniority: "mid",
  must_have: ["Node.js", "PostgreSQL"], nice_to_have: ["Redis"],
  min_exp: 1, max_exp: 4, salary_min: 40000, salary_max: 80000,
  currency: "INR", location: "Remote", remote_policy: "remote", employment_type: "full-time",
  description: "Build logistics APIs with Node.js and PostgreSQL. Realtime tracking with WebSockets and Redis a plus. Must own auth, schema design, deployment.",
};
let res = await fetch(`${BASE}/api/search`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: HR_COOKIE }, body: JSON.stringify({ job, limit: 20 }) });
let json = await res.json().catch(() => ({}));
ok("fast search 200 + seeded candidate", res.ok && JSON.stringify(json).includes("Test Candidate"), `(${(json.results ?? []).length} rows)`);
const cand = (json.results ?? []).find((r) => (r.full_name ?? "") === "Test Candidate");
const cid = cand?.id ?? cand?.candidate_id;

if (cid) {
  res = await fetch(`${BASE}/api/shortlists`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: HR_COOKIE }, body: JSON.stringify({ candidate_id: cid, notes: "e2e" }) });
  json = await res.json().catch(() => ({}));
  ok("shortlist save", res.status === 201 || res.status === 200, `(${res.status})`);
  res = await fetch(`${BASE}/api/shortlists?candidate_id=${cid}`, { headers: { Cookie: HR_COOKIE } });
  json = await res.json().catch(() => ({}));
  ok("shortlist list", res.ok && (json.results ?? []).length > 0);
  res = await fetch(`${BASE}/api/contacts`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: HR_COOKIE }, body: JSON.stringify({ candidate_id: cid, channel: "email", message: "e2e hello" }) });
  ok("contact log", res.status === 201 || res.status === 200, `(${res.status})`);
  res = await fetch(`${BASE}/api/candidates?id=${cid}`);
  json = await res.json().catch(() => ({}));
  ok("candidate GET + summary", res.ok && !!json.candidate, `(matches:${(json.matches ?? []).length} views:${(json.contact_log ?? []).length})`);
} else {
  ok("seeded candidate found", false, "(search fallback empty?)");
  fail += 2;
  console.log("FAIL shortlist/contact skipped (no cid)");
}
res = await fetch(`${BASE}/api/search`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: HR_COOKIE }, body: JSON.stringify({ job, limit: 5, deep: true }) });
json = await res.json().catch(() => ({}));
ok("deep search responds", res.ok, `(deep:${!!(json.results ?? [])[0]?.judge}${json.deepError ? " judge-skipped-no-key" : ""})`);
console.log(`--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
