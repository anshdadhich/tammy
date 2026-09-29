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
      "id, company_name, company_email, website, linkedin_url, company_size, industry, verification_status, created_at, account:users!employers_user_id_fkey(email)",
    )
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(Math.floor(limit), 1), 100));
  if (status !== "all") query = query.eq("verification_status", status);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as (Omit<AdminEmployer, "account_email"> & {
    account: { email: string } | null;
  })[];

  return rows.map(({ account, ...row }) => ({
    ...row,
    account_email: account?.email ?? null,
  }));
}
