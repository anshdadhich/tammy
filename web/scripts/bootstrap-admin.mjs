// One-time bootstrap: promote first user to admin + verify pending employers.
// Run: node scripts/bootstrap-admin.mjs
// Reads web/.env.local at RUNTIME only. Never prints keys or full emails.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const mask = (e) => (!e || !e.includes("@") ? "***" : e.slice(0, 2) + "***@" + e.split("@")[1]);
const env = loadEnv(new URL("../.env.local", import.meta.url));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("missing Supabase URL or service key in web/.env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: admins } = await db.from("users").select("id,email").eq("role", "admin").limit(1);
if (!admins?.length) {
  const { data: first } = await db.from("users").select("id,email").order("created_at").limit(1).maybeSingle();
  if (!first) {
    console.log("no users yet — sign up at /signup first, then re-run");
    process.exit(0);
  }
  await db.from("users").update({ role: "admin" }).eq("id", first.id);
  console.log("promoted to admin:", mask(first.email));
} else {
  console.log("admin exists:", mask(admins[0].email), "(bootstrap closed for promotion)");
}
const { data: pending } = await db.from("employers").select("id").eq("verification_status", "pending");
if (pending?.length) {
  await db.from("employers").update({ verification_status: "verified" }).eq("verification_status", "pending");
  console.log("verified employers:", pending.length);
} else {
  console.log("verified employers: 0 pending");
}
console.log("done");
