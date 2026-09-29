import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";

const mask = (e) => (!e || !e.includes("@") ? "***" : e.slice(0, 2) + "***@" + e.split("@")[1]);
const env = loadEnv(new URL("../.env.local", import.meta.url));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const bootstrapSecret = env.BOOTSTRAP_SECRET;
const base = (env.NEXT_PUBLIC_SITE_URL || env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
if (!url || !key) {
  console.error("missing Supabase URL or service key in web/.env.local");
  process.exit(1);
}
if (!bootstrapSecret) {
  console.error("BOOTSTRAP_SECRET is required in web/.env.local - refusing to bootstrap over an open endpoint");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function promoteViaApi(email) {
  const res = await fetch(`${base}/api/admin/bootstrap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bootstrap-secret": bootstrapSecret,
    },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("bootstrap request failed:", res.status, data?.error ?? "unknown error");
    process.exit(1);
  }
  return data;
}

const { data: admins } = await db.from("users").select("id,email").eq("role", "admin").limit(1);
if (!admins?.length) {
  const target = process.argv[2]?.trim();
  let email = target || null;
  if (!email) {
    const { data: first } = await db.from("users").select("id,email").order("created_at").limit(1).maybeSingle();
    if (!first) {
      console.log("no users yet - sign up at /signup first, then re-run");
      process.exit(0);
    }
    email = first.email;
  }
  await promoteViaApi(email);
  console.log("promoted to admin:", mask(email));
  console.log("unset BOOTSTRAP_SECRET now that bootstrap is complete");
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
