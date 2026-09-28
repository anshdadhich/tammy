import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import type { Viewer } from "@/lib/api-auth";
import { redactPii } from "@/lib/redact";

export type UserRow = {
  id: string;
  auth_id: string | null;
  email: string;
  role: string;
  status: string;
  email_verified: boolean;
  created_at: string;
};

export type EmployerRow = {
  id: string;
  user_id: string | null;
  company_name: string;
  company_email: string | null;
  verification_status: string;
};

export type SessionUser = {
  authId: string;
  email: string;
  userRow: UserRow | null;
  employer: EmployerRow | null;
  candidateId: string | null;
  viewer: Viewer;
};

export type OwnerDb = {
  client: SupabaseClient;
  user: SessionUser;
  candidateId: string;
};

export type HrDb = {
  client: SupabaseClient;
  user: SessionUser;
  employerId: string;
};

const USER_COLS = "id, auth_id, email, role, status, email_verified, created_at";
const EMPLOYER_COLS = "id, user_id, company_name, company_email, verification_status";

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const email = v.trim().toLowerCase();
  if (!email || email.length > 320 || !email.includes("@")) return null;
  return email;
}

function viewerFor(userRow: UserRow | null, email: string, employer: EmployerRow | null, candidateId: string | null): Viewer {
  if (!userRow || userRow.status !== "active") return { kind: "anon" };
  if (userRow.role === "employer" || userRow.role === "admin") {
    const name =
      userRow.role === "admin"
        ? "Admin"
        : employer && employer.company_name.trim()
          ? employer.company_name.trim().slice(0, 100)
          : "Employer";
    return { kind: "hr", name, email };
  }
  if (userRow.role === "candidate" && candidateId) {
    return { kind: "owner", id: candidateId, email };
  }
  return { kind: "anon" };
}

function logErr(scope: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[supabase-user] ${scope} detail=${redactPii(msg.slice(0, 200))}`);
}

export async function userDb(): Promise<SupabaseClient> {
  return supabaseServer();
}

export async function getSessionUser(): Promise<SessionUser | null> {
  let client: SupabaseClient;
  try {
    client = await supabaseServer();
  } catch (e) {
    logErr("client failed", e);
    return null;
  }
  let authId: string | null = null;
  let email: string | null = null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    const au = data.user;
    if (!au || !au.id) return null;
    authId = au.id;
    email = normalizeEmail(au.email) ?? normalizeEmail(au.user_metadata?.email);
    if (!email) return null;
  } catch (e) {
    logErr("getUser failed", e);
    return null;
  }
  let userRow: UserRow | null = null;
  try {
    const { data, error } = await client.from("users").select(USER_COLS).eq("auth_id", authId).maybeSingle();
    if (error) throw error;
    userRow = (data as UserRow | null) ?? null;
  } catch (e) {
    logErr("userRow read failed", e);
    userRow = null;
  }
  let employer: EmployerRow | null = null;
  if (userRow) {
    try {
      const { data, error } = await client
        .from("employers")
        .select(EMPLOYER_COLS)
        .eq("user_id", userRow.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const rows = (data as EmployerRow[] | null) ?? [];
      employer = rows.find((r) => r.verification_status === "verified") ?? rows[0] ?? null;
    } catch (e) {
      logErr("employer read failed", e);
      employer = null;
    }
  }
  let candidateId: string | null = null;
  if (userRow && userRow.role === "candidate") {
    try {
      const { data, error } = await client
        .from("candidates")
        .select("id")
        .eq("user_id", userRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      candidateId = ((data as { id: string } | null)?.id) ?? null;
    } catch (e) {
      logErr("candidate read failed", e);
      candidateId = null;
    }
  }
  return {
    authId,
    email,
    userRow,
    employer,
    candidateId,
    viewer: viewerFor(userRow, email, employer, candidateId),
  };
}

export async function requireOwnerDb(candidateId: string, session?: SessionUser | null): Promise<OwnerDb | Response> {
  if (typeof candidateId !== "string" || !candidateId) {
    return Response.json({ error: "You can only modify your own profile." }, { status: 403 });
  }
  if (session === undefined) {
    try {
      session = await getSessionUser();
    } catch (e) {
      logErr("owner session failed", e);
      session = null;
    }
  }
  if (!session || !session.userRow) {
    return Response.json({ error: "Sign in to manage this profile." }, { status: 401 });
  }
  if (session.userRow.status !== "active") {
    return Response.json({ error: "You can only modify your own profile." }, { status: 403 });
  }
  let client: SupabaseClient;
  try {
    client = await userDb();
  } catch (e) {
    logErr("owner db failed", e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  try {
    let query = client.from("candidates").select("id").eq("id", candidateId);
    if (session.userRow.role !== "admin") {
      query = query.eq("user_id", session.userRow.id);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!(data as { id: string } | null)?.id) {
      return Response.json({ error: "You can only modify your own profile." }, { status: 403 });
    }
  } catch (e) {
    logErr("owner check failed", e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  return { client, user: session, candidateId };
}

export async function requireHrDb(session?: SessionUser | null): Promise<HrDb | Response> {
  if (session === undefined) {
    try {
      session = await getSessionUser();
    } catch (e) {
      logErr("hr session failed", e);
      session = null;
    }
  }
  if (!session || !session.userRow) {
    return Response.json({ error: "Employer session required." }, { status: 401 });
  }
  if (session.userRow.status !== "active") {
    return Response.json({ error: "Employer verification required." }, { status: 403 });
  }
  let client: SupabaseClient;
  try {
    client = await userDb();
  } catch (e) {
    logErr("hr db failed", e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  try {
    const { data, error } = await client
      .from("employers")
      .select("id")
      .eq("user_id", session.userRow.id)
      .eq("verification_status", "verified")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const employerId = (data as { id: string } | null)?.id ?? null;
    if (!employerId) {
      return Response.json({ error: "Employer verification required." }, { status: 403 });
    }
    return { client, user: session, employerId };
  } catch (e) {
    logErr("hr check failed", e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
