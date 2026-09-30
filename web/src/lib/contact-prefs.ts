export type ContactPrefs = {
  show_email?: boolean | null; show_phone?: boolean | null;
  show_linkedin?: boolean | null; show_github?: boolean | null;
  show_portfolio?: boolean | null; show_resume?: boolean | null;
  show_photo?: boolean | null;
  contact_email?: unknown; contact_phone?: unknown;
  linkedin_url?: unknown; github_url?: unknown;
  portfolio_url?: unknown; resume_url?: unknown; photo_url?: unknown;
};

export function applyContactPrefs<T extends ContactPrefs>(c: T): T {
  const out = { ...c };
  if (c.show_email !== true) { out.contact_email = null; }
  if (c.show_phone !== true) { out.contact_phone = null; }
  if (c.show_linkedin !== true) { out.linkedin_url = null; }
  if (c.show_github !== true) { out.github_url = null; }
  if (c.show_portfolio !== true) { out.portfolio_url = null; }
  if (c.show_resume !== true) { out.resume_url = null; }
  if (c.show_photo !== true) { out.photo_url = null; }
  return out;
}

const LOCK_COLS = [
  "contact_email",
  "contact_phone",
  "linkedin_url",
  "github_url",
  "portfolio_url",
  "resume_url",
  "photo_url",
] as const;

export function lockContacts<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const col of LOCK_COLS) out[col] = null;
  out.contact_locked = true;
  return out as T;
}

import type { SupabaseClient } from "@supabase/supabase-js";

type IdQuery = Pick<SupabaseClient, "from">;

export async function revealedCandidateIds(
  db: IdQuery,
  employerId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const [{ data: sl }, { data: cl }] = await Promise.all([
      db.from("shortlists").select("candidate_id").eq("employer_id", employerId).limit(10000),
      db.from("contact_log").select("candidate_id").eq("employer_id", employerId).limit(10000),
    ]);
    for (const r of ((sl ?? []) as { candidate_id: string }[])) {
      if (r.candidate_id) out.add(String(r.candidate_id));
    }
    for (const r of ((cl ?? []) as { candidate_id: string }[])) {
      if (r.candidate_id) out.add(String(r.candidate_id));
    }
  } catch {
  }
  return out;
}
