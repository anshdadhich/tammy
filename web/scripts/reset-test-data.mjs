import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";

const EXPECTED_EMBEDDING_MODEL = "voyage-4-lite";
const MODEL_DIMS = { "voyage-4-lite": 1024 };
const EXPECTED_EMBEDDING_DIM = MODEL_DIMS[EXPECTED_EMBEDDING_MODEL];
if (!EXPECTED_EMBEDDING_DIM) throw new Error("unknown embedding model dim");

const env = loadEnv(new URL("../.env.local", import.meta.url));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("missing Supabase URL or service-role key in web/.env.local");
  process.exit(1);
}
let hostname = "";
try {
  hostname = new URL(supabaseUrl).hostname;
} catch {
  console.error("invalid Supabase URL");
  process.exit(1);
}
const allowlisted = /localhost|127\.0\.0\.1|test|staging|\.local/i.test(supabaseUrl);
const confirmed = process.argv.includes("--confirm") || process.argv.includes("--yes");
if (!allowlisted && !confirmed) {
  console.error(`refusing to wipe non-test database host (${hostname}); re-run with --confirm to override`);
  process.exit(1);
}
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const PASS = "Test@1234";
const ACCOUNTS = [
  { email: "admin@test.com", role: "admin" },
  { email: "employer@test.com", role: "employer" },
  { email: "candidate@test.com", role: "candidate" },
];

for (const t of ["audit_logs","candidate_matches","contact_log","shortlists","searches","job_requirements","jobs","profile_chunks","project_depth_analysis","projects","work_experiences","education","candidate_skills","candidate_profiles","candidates","employers","users"]) {
  const { error } = await db.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) console.log("wipe", t, "->", error.message);
}
const { data: existing } = await db.auth.admin.listUsers({ perPage: 100 });
for (const u of existing?.users ?? []) {
  if (u.email?.endsWith("@test.com") || u.email?.endsWith("@demo.local")) {
    await db.auth.admin.deleteUser(u.id);
  }
}
const ids = {};
for (const a of ACCOUNTS) {
  const { data, error } = await db.auth.admin.createUser({ email: a.email, password: PASS, email_confirm: true, user_metadata: { role: a.role } });
  if (error) throw new Error("createUser " + a.email + ": " + error.message);
  ids[a.role] = data.user.id;
  await db.from("users").insert({ auth_id: data.user.id, email: a.email, role: a.role, status: "active", email_verified: true });
}
const { data: emp } = await db.from("employers").insert({ company_name: "Test Labs", company_email: "employer@test.com", verification_status: "verified" }).select("id").single();
const { data: empUser } = await db.from("users").select("id").eq("email", "employer@test.com").maybeSingle();
if (empUser) await db.from("employers").update({ user_id: empUser.id }).eq("id", emp.id);
await db.from("jobs").insert({
  employer_id: emp.id, title: "Backend Developer (Node/Postgres)", domain: "Software Development",
  seniority: "mid", description: "Build logistics APIs with Node.js and PostgreSQL. Realtime tracking with WebSockets and Redis a plus. Must own auth, schema design, deployment.",
  must_have_skills: ["Node.js", "PostgreSQL"], nice_to_have_skills: ["Redis"],
  min_experience: 1, max_experience: 4, salary_min: 40000, salary_max: 80000,
  salary_currency: "INR", location: "Remote", remote_policy: "remote", employment_type: "full-time", status: "active",
});
const { data: cand } = await db.from("candidates").insert({
  full_name: "Test Candidate", headline: "Node/Postgres APIs, auth + caching, 2y",
  domain: "Software Development", current_position: "SDE-1", total_experience_years: 2,
  location_city: "Pune, India", remote_preference: "remote_only", min_salary: 45000,
  salary_currency: "INR", salary_frequency: "monthly", availability_status: "immediate",
  visibility_status: "visible", consent_status: "granted",
  contact_email: "candidate@test.com", contact_phone: "+91 98765 43210",
}).select("id").single();
const { data: candUser } = await db.from("users").select("id").eq("email", "candidate@test.com").maybeSingle();
if (candUser) await db.from("candidates").update({ user_id: candUser.id }).eq("id", cand.id);
const { data: skillRows } = await db.from("skills").select("id,name").in("name", ["Node.js", "PostgreSQL", "Redis"]);
if (skillRows?.length) await db.from("candidate_skills").insert(skillRows.map((s) => ({ candidate_id: cand.id, skill_id: s.id, source: "self_reported" })));
const { data: proj } = await db.from("projects").insert({
  candidate_id: cand.id, title: "Delivery tracker", description: "Realtime tracking with Socket.io",
  problem_statement: "Live driver updates", tech_stack: ["Node.js", "Socket.io", "Redis"],
  role_in_project: "Sole backend", impact_summary: "500 concurrent connections", project_type: "personal",
}).select("id").single();
await db.from("candidate_profiles").insert({ candidate_id: cand.id, summary_markdown: "# Test Candidate\n\nBackend developer, 2y, Node/Postgres/Redis. Built delivery tracker with realtime updates (500 concurrent).", summary_json: { seeded: true } });
const zeros = new Array(EXPECTED_EMBEDDING_DIM).fill(0);
if (zeros.length !== 1024) throw new Error("embedding dim drift: expected 1024");
const zero = "[" + zeros.join(",") + "]";
await db.from("profile_chunks").insert([
  { candidate_id: cand.id, chunk_type: "summary", content_text: "Backend developer 2y Node.js PostgreSQL Redis realtime tracking", metadata_json: {}, embedding: zero, embedding_model: EXPECTED_EMBEDDING_MODEL, embedding_dim: EXPECTED_EMBEDDING_DIM },
  { candidate_id: cand.id, chunk_type: "project", content_text: "Project: Delivery tracker. Realtime tracking with Socket.io. Tech: Node.js, Socket.io, Redis. Impact: 500 concurrent connections.", metadata_json: { project_id: proj.id }, embedding: zero, embedding_model: EXPECTED_EMBEDDING_MODEL, embedding_dim: EXPECTED_EMBEDDING_DIM },
]);

console.log("RESET DONE. Login with:");
for (const a of ACCOUNTS) console.log(`- ${a.role}: ${a.email} / ${PASS}`);
console.log("Flow (UI removed - use the JSON API): employer -> POST /api/search | candidate -> POST /api/candidates | admin -> POST /api/admin/bootstrap");
