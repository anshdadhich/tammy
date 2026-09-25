import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { contactLoggedEmail, sendEmail } from "@/lib/email";
import { getViewer, requireHr, verifyOwnerEmail } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  candidate_id: z.string().uuid(),
  job_id: z.string().uuid().nullish(),
  employer_id: z.string().uuid().nullish(),
  channel: z.enum(["email", "phone", "platform", "other"]).default("platform"),
  message: z.string().trim().max(4000).default(""),
});

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "contacts-post", limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const denied = requireHr(getViewer(request));
  if (denied) return denied;
  const db = supabaseAdmin();
  const { candidate_id, job_id, employer_id, channel, message } = parsed.data;

  const { data } = await db
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
    console.error("[contacts] log failed");
    return Response.json(
      { error: "contact log failed" },
      { status: 500 },
    );
  }

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
  }

  return Response.json(
    { id: (data as { id: string }).id, status: "logged" },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const rl = rateLimit(request, { key: "contacts-get", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const viewer = getViewer(request);
  if (viewer.kind === "anon") {
    return Response.json({ error: "Sign in to view contact logs." }, { status: 401 });
  }
  const url = new URL(request.url);
  const candidate_id = url.searchParams.get("candidate_id");
  if (!candidate_id) {
    return Response.json({ error: "candidate_id is required." }, { status: 400 });
  }
  if (viewer.kind === "owner") {
    const ok =
      viewer.id === candidate_id && (await verifyOwnerEmail(candidate_id, viewer.email));
    if (!ok) return Response.json({ error: "You can only view your own contact logs." }, { status: 403 });
  }
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100,
  );
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("contact_log")
    .select("id, employer_id, candidate_id, job_id, channel, message, created_at")
    .eq("candidate_id", candidate_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[contacts] list failed");
    return Response.json({ error: "contact list failed" }, { status: 500 });
  }
  return Response.json({ results: data ?? [] });
}
