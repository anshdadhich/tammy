import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { contactLoggedEmail, sendEmail } from "@/lib/email";

const uuid = z.string().uuid("Must be a valid UUID");

// POST /api/contact { candidate_id, job_id?, employer_id?, channel, message? }
// OPEN-CONTACT: contact is visible directly; this only appends an audit trail
// to contact_log (+ a mirror row in audit_logs).
const contactSchema = z.object({
  candidate_id: uuid,
  job_id: uuid.nullish(),
  employer_id: uuid.nullish(),
  channel: z.enum(["email", "phone", "platform", "other"]),
  message: z.string().trim().max(4000).default(""),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const { candidate_id, job_id, employer_id, channel, message } = parsed.data;
  const db = supabaseAdmin();

  const { data: cand } = await db.from("candidates").select("id").eq("id", candidate_id).maybeSingle();
  if (!cand) return Response.json({ error: "candidate not found" }, { status: 404 });

  const { data: logged, error } = await db
    .from("contact_log")
    .insert({
      employer_id: employer_id ?? null,
      candidate_id,
      job_id: job_id ?? null,
      channel,
      message: message || null,
    })
    .select("id, created_at")
    .single();
  if (!logged) {
    return Response.json({ error: "contact log failed", detail: error?.message ?? null }, { status: 500 });
  }

  // Mirror into audit_logs (best-effort, never blocks the response).
  try {
    await db.from("audit_logs").insert({
      action: "contact",
      target_type: "candidate",
      target_id: candidate_id,
    });
  } catch {
    // audit mirror is optional
  }

  try {
    const { data: cc } = await db.from("candidates").select("full_name, contact_email").eq("id", candidate_id).maybeSingle();
    const em = (cc as { contact_email?: string; full_name?: string } | null)?.contact_email;
    if (em) {
      const tpl = contactLoggedEmail((cc as { full_name?: string })?.full_name ?? "there", { jobTitle: "a role", company: "An employer", channel });
      await sendEmail(em, tpl.subject, tpl.html);
    }
  } catch { /* email never blocks */ }

  return Response.json({ contactId: (logged as { id: string }).id }, { status: 201 });
}
