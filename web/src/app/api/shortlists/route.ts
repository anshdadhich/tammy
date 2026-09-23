import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { newMatchEmail, sendEmail } from "@/lib/email";
import { getViewer, requireHr } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const uuid = z.string().uuid("Must be a valid UUID");

const listQuery = z.object({
  employer_id: uuid.optional(),
  candidate_id: uuid.optional(),
  job_id: uuid.optional(),
});

const saveSchema = z.object({
  candidate_id: uuid,
  job_id: uuid.nullish(),
  employer_id: uuid.nullish(),
  notes: z.string().trim().max(2000).default(""),
});

const removeByIdSchema = z.object({ id: uuid });

// GET /api/shortlists?employer_id=&candidate_id=&job_id= — list saved rows.
export async function GET(request: Request) {
  const rl = rateLimit(request, { key: "shortlists-get", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  // Shortlists expose candidate contact info: employer session required.
  const denied = requireHr(getViewer(request));
  if (denied) return denied;
  const url = new URL(request.url);
  const raw = {
    employer_id: url.searchParams.get("employer_id") ?? undefined,
    candidate_id: url.searchParams.get("candidate_id") ?? undefined,
    job_id: url.searchParams.get("job_id") ?? undefined,
  };
  // Drop empty strings so missing params stay optional.
  for (const k of Object.keys(raw) as (keyof typeof raw)[]) {
    if (raw[k] === "") raw[k] = undefined;
  }
  const parsed = listQuery.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  // Forbid unfiltered dumps across all employers.
  if (!parsed.data.employer_id && !parsed.data.candidate_id && !parsed.data.job_id) {
    return Response.json({ error: "Filter by employer_id, candidate_id, or job_id." }, { status: 400 });
  }
  const db = supabaseAdmin();
  let q = db
    .from("shortlists")
    .select("id, employer_id, candidate_id, job_id, status, notes, created_at, candidates(id, full_name, headline)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (parsed.data.employer_id) q = q.eq("employer_id", parsed.data.employer_id);
  if (parsed.data.candidate_id) q = q.eq("candidate_id", parsed.data.candidate_id);
  if (parsed.data.job_id) q = q.eq("job_id", parsed.data.job_id);
  const { data, error } = await q;
  if (error) {
    console.error("[shortlists] list failed");
    return Response.json({ error: "shortlist list failed" }, { status: 500 });
  }
  return Response.json({ results: data ?? [] });
}

// POST /api/shortlists { candidate_id, job_id?, employer_id?, notes? }
export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "shortlists-post", limit: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const denied = requireHr(getViewer(request));
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const { candidate_id, job_id, employer_id, notes } = parsed.data;
  const db = supabaseAdmin();

  const { data: cand } = await db.from("candidates").select("id").eq("id", candidate_id).maybeSingle();
  if (!cand) return Response.json({ error: "candidate not found" }, { status: 404 });

  if (job_id) {
    const { data: job } = await db.from("jobs").select("id").eq("id", job_id).maybeSingle();
    if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  }

  // Manual dedupe (UNIQUE with NULL employer/job doesn't block dupes in Postgres).
  const { data: existing } = await db
    .from("shortlists")
    .select("id, employer_id, candidate_id, job_id, status, notes, created_at")
    .eq("candidate_id", candidate_id)
    .limit(50);
  const dup = (existing as { employer_id: string | null; job_id: string | null }[] | null)?.find(
    (r) => (r.employer_id ?? null) === (employer_id ?? null) && (r.job_id ?? null) === (job_id ?? null),
  );
  if (dup) return Response.json({ shortlist: dup, deduped: true });

  const { data } = await db
    .from("shortlists")
    .insert({
      employer_id: employer_id ?? null,
      candidate_id,
      job_id: job_id ?? null,
      status: "saved",
      notes: notes || null,
    })
    .select("id, employer_id, candidate_id, job_id, status, notes, created_at")
    .single();
  if (!data) {
    console.error("[shortlists] save failed");
    return Response.json({ error: "shortlist save failed" }, { status: 500 });
  }
  try {
    const { data: cc } = await db.from("candidates").select("full_name, contact_email").eq("id", candidate_id).maybeSingle();
    const em = (cc as { contact_email?: string; full_name?: string } | null)?.contact_email;
    if (em) {
      const tpl = newMatchEmail((cc as { full_name?: string })?.full_name ?? "there", "a role you match", "An employer");
      await sendEmail(em, tpl.subject, tpl.html);
    }
  } catch { /* email never blocks */ }
  return Response.json({ shortlist: data }, { status: 201 });
}

// DELETE /api/shortlists?id=  OR  body { id }  OR  body { candidate_id, job_id?, employer_id? }
export async function DELETE(request: Request) {
  const rl = rateLimit(request, { key: "shortlists-delete", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const denied = requireHr(getViewer(request));
  if (denied) return denied;
  const url = new URL(request.url);
  const idParam = url.searchParams.get("id") ?? undefined;
  const body = await request.json().catch(() => null);

  if (idParam ?? body?.id) {
    const parsed = removeByIdSchema.safeParse({ id: idParam ?? body.id });
    if (!parsed.success) {
      return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { error } = await db.from("shortlists").delete().eq("id", parsed.data.id);
    if (error) {
      console.error("[shortlists] remove failed");
      return Response.json({ error: "shortlist remove failed" }, { status: 500 });
    }
    return Response.json({ ok: true });
  }

  const parsed = saveSchema.pick({ candidate_id: true, job_id: true, employer_id: true }).safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "provide ?id= or JSON { id } or { candidate_id, job_id?, employer_id? }" },
      { status: 400 },
    );
  }
  const db = supabaseAdmin();
  let q = db.from("shortlists").delete().eq("candidate_id", parsed.data.candidate_id);
  if (parsed.data.job_id) q = q.eq("job_id", parsed.data.job_id);
  else q = q.is("job_id", null);
  if (parsed.data.employer_id) q = q.eq("employer_id", parsed.data.employer_id);
  else q = q.is("employer_id", null);
  const { error } = await q;
  if (error) {
    console.error("[shortlists] remove failed");
    return Response.json({ error: "shortlist remove failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
