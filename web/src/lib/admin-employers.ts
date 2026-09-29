import { supabaseAdmin } from "@/lib/supabase";

export type AdminEmployer = {
  id: string;
  company_name: string | null;
  company_email: string | null;
  website: string | null;
  linkedin_url: string | null;
  company_size: string | null;
  industry: string | null;
  verification_status: string | null;
  created_at: string | null;
  account_email: string | null;
};

export async function listAdminEmployers(
  status: "pending" | "verified" | "rejected" | "suspended" | "all" = "pending",
  limit = 100,
): Promise<AdminEmployer[]> {
  const db = supabaseAdmin();
  let query = db
    .from("employers")
    .select(
      "id, user_id, company_name, company_email, website, linkedin_url, company_size, industry, verification_status, created_at",
    )
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(Math.floor(limit), 1), 100));
  if (status !== "all") query = query.eq("verification_status", status);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as (Omit<AdminEmployer, "account_email"> & {
    user_id: string | null;
  })[];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
  const emailByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: users, error: usersError } = await db
      .from("users")
      .select("id, email")
      .in("id", userIds);
    if (usersError) throw usersError;
    for (const user of (users ?? []) as { id: string; email: string }[]) {
      emailByUser.set(user.id, user.email);
    }
  }

  return rows.map(({ user_id, ...row }) => ({
    ...row,
    account_email: user_id ? emailByUser.get(user_id) ?? null : null,
  }));
}
