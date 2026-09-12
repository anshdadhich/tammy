import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { contactLoggedEmail, sendEmail } from "@/lib/email";

// POST /api/contacts — audit-log an outreach (OPEN-CONTACT: audit, not a gate).
// Body: { candidate_id (uuid), job_id? (uuid|null), employer_id? (uuid|null),
//         channel? (email|phone|platform|other), message? }
// Writes to public.contact_log, then best-effort emails the candidate.
// Email is guarded try/catch and never breaks the API.

const bodySchema = z.object({
  candidate_id: z.string().uuid(),
  job_id: z.string().uuid().nullish(),
  employer_id: z.string().uuid().nullish(),
  channel: z.enum(["email", "phone", "platform", "other"]).default("platform"),
  message: z.string().trim().max(4000).default(""),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { candidate_id, job_id, employer_id, channel, message } = parsed.data;

  const { data, error } = await db
    .from("contact_log")
    .insert({
      employer_id: employer_id ?? null,
      candidate_id,
      job_id: job_id ?? null,
      channel,
      message: message || null,
    })
    .select("id")
    .single();

  if (!data) {
    return Response.json(
      { error: "contact log failed", detail: error?.message ?? null },
      { status: 500 },
    );
  }

  // Best-effort candidate email — guarded, never breaks the API.
  try {
    const { data: c } = await db
      .from("candidates")
      .select("full_name, contact_email")
      .eq("id", candidate_id)
      .single();
    const cc = c as { full_name?: string; contact_email?: string } | null;
    let jobTitle: string | null = null;
    let company: string | null = null;
    if (job_id) {
      const { data: j } = await db
        .from("jobs")
        .select("title, employers(company_name)")
        .eq("id", job_id)
        .single();
      const jj = j as {
        title?: string;
        employers?: { company_name?: string } | { company_name?: string }[] | null;
      } | null;
      jobTitle = jj?.title ?? null;
      const emp = jj?.employers;
      company = Array.isArray(emp)
        ? (emp[0]?.company_name ?? null)
        : (emp?.company_name ?? null);
    }
    if (cc?.contact_email) {
      const tpl = contactLoggedEmail(cc.full_name ?? "there", {
        jobTitle,
        company,
        channel,
      });
      await sendEmail(cc.contact_email, tpl.subject, tpl.html);
    }
  } catch {
    // Email is best-effort only.
  }

  return Response.json(
    { id: (data as { id: string }).id, status: "logged" },
    { status: 201 },
  );
}

// GET /api/contacts?candidate_id=&limit=50 — recent contact_log rows.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const candidate_id = url.searchParams.get("candidate_id");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100,
  );
  const db = supabaseAdmin();
  let q = db
    .from("contact_log")
    .select("id, employer_id, candidate_id, job_id, channel, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (candidate_id) q = q.eq("candidate_id", candidate_id);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ results: data ?? [] });
}
