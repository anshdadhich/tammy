import { supabaseAdmin } from "./supabase";
import { supabaseServer } from "./supabase-server";

export type Role = "candidate" | "employer" | "admin";

export type UserRow = {
  id: string;
  auth_id: string;
  email: string;
  role: Role;
  status: string;
  email_verified: boolean;
  created_at: string;
};

export type SessionUser = {
  authId: string;
  email: string;
  profile: UserRow | null;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const db = supabaseAdmin();
  const { data } = await db
    .from("users")
    .select("id, auth_id, email, role, status, email_verified, created_at")
    .eq("auth_id", user.id)
    .maybeSingle();

  return {
    authId: user.id,
    email: user.email ?? "",
    profile: (data as UserRow | null) ?? null,
  };
}

export async function requireRole(
  role: Role | Role[],
): Promise<SessionUser & { profile: UserRow }> {
  const session = await getSessionUser();
  if (!session || !session.profile) {
    throw new AuthError("Unauthorized — sign in first", 401);
  }
  if (session.profile.status !== "active") {
    throw new AuthError("Account suspended", 403);
  }
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(session.profile.role)) {
    throw new AuthError(
      `Forbidden — requires role: ${roles.join(" or ")}`,
      403,
    );
  }
  return session as SessionUser & { profile: UserRow };
}
