import { z } from "zod";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { newMatchEmail, sendEmail } from "@/lib/email";
import { requireHrDb, getSessionUser } from "@/lib/supabase-user";
import { rateLimitRoute } from "@/lib/rate-limit";
import { startWideEvent } from "@/lib/observe";
import { withTimeout } from "@/lib/timeout";
import { encodeCursor, decodeCursor } from "@/lib/cursor";

const uuid = z.string().uuid("Must be a valid UUID");

const EMAIL_TIMEOUT_MS = 15000;

const listQuery = z.object({
  candidate_id: uuid.optional(),
  job_id: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(500).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

const saveSchema = z.object({
  candidate_id: uuid,
  job_id: uuid.nullish(),
  notes: z.string().trim().max(2000).default(""),
});

const removeByIdSchema = z.object({ id: uuid });

const AUDIT_ACTIONS = ["search", "profile_view", "contact", "shortlist", "export", "profile_update", "upload"] as const;

type Db = ReturnType<typeof supabaseAdmin>;

async function auditBestEffort(
  db: Db,
  row: { action: string; target_type: string; target_id: string | null; metadata: Record<string, unknown> },
): Promise<void> {
  if (!(AUDIT_ACTIONS as readonly string[]).includes(row.action)) return;
  try {
    await db.from("audit_logs").insert(row);
  } catch {}
}

export async function GET(request: Request) {
  const wev = startWideEvent("shortlists", "GET");
  const session = await getSessionUser();
  const limited = rateLimitRoute(request, {
    key: "shortlists-get",
    limit: 120,
    windowMs: 60_000,
    principal: session?.email,
  });
  if (limited) {
    wev.end({ status: limited.status });
    return limited;
  }
  const hr = await requireHrDb(session);
  if (hr instanceof Response) {
    wev.end({ status: hr.status });
    return hr;
  }
  if (hr.user.viewer.kind !== "hr") {
    wev.end({ status: 401 });
    return Response.json({ error: "Employer session required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const raw = {
    candidate_id: url.searchParams.get("candidate_id") ?? undefined,
    job_id: url.searchParams.get("job_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  };
  for (const k of Object.keys(raw) as (keyof typeof raw)[]) {
    if (raw[k] === "") raw[k] = undefined;
  }
  const parsed = listQuery.safeParse(raw);
  if (!parsed.success) {
    wev.end({ status: 400 });
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const pageSize = parsed.data.limit ?? 50;
  const db = hr.client;
  const employerId = hr.employerId;
  let q = db
    .from("shortlists")
    .select("id, employer_id, candidate_id, job_id, status, notes, created_at, candidates(id, full_name, headline)")
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (parsed.data.candidate_id) q = q.eq("candidate_id", parsed.data.candidate_id);
  if (parsed.data.job_id) q = q.eq("job_id", parsed.data.job_id);
  if (parsed.data.cursor) {
    const c = decodeCursor(parsed.data.cursor);
    if (!c) {
      wev.end({ status: 400 });
      return Response.json({ error: "Invalid cursor." }, { status: 400 });
    }
    q = q.or(`created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`);
    q = q.limit(pageSize + 1);
  } else if (parsed.data.offset !== undefined) {
    q = q.range(parsed.data.offset, parsed.data.offset + pageSize);
  } else {
    q = q.limit(pageSize + 1);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[shortlists] list failed");
    wev.add({ degraded: true });
    wev.end({ status: 500, error: "shortlist list failed" });
    return Response.json({ error: "shortlist list failed" }, { status: 500 });
  }
  const rows = (data ?? []) as { id: string; created_at: string }[];
  const page = rows.slice(0, pageSize);
  const nextCursor = rows.length > pageSize ? encodeCursor(rows[pageSize - 1].created_at, rows[pageSize - 1].id) : null;
  wev.add({ degraded: false });
  wev.end({ status: 200 });
  return Response.json({ results: page, nextCursor, degraded: false });
}

export async function POST(request: Request) {
  const wev = startWideEvent("shortlists", "POST");
  const session = await getSessionUser();
  const limited = rateLimitRoute(request, {
    key: "shortlists-post",
    limit: 30,
    windowMs: 10 * 60_000,
    principal: session?.email,
  });
  if (limited) {
    wev.end({ status: limited.status });
    return limited;
  }
  const hr = await requireHrDb(session);
  if (hr instanceof Response) {
    wev.end({ status: hr.status });
    return hr;
  }
  if (hr.user.viewer.kind !== "hr") {
    wev.end({ status: 401 });
    return Response.json({ error: "Employer session required." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    wev.end({ status: 400 });
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const { candidate_id, job_id, notes } = parsed.data;
  const checks = supabaseAdmin();
  const db = hr.client;
  const employerId = hr.employerId;

  const [candRes, jobRes] = await Promise.all([
    checks.from("candidates").select("id").eq("id", candidate_id).maybeSingle(),
    job_id
      ? checks.from("jobs").select("id, employer_id").eq("id", job_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!candRes.data) {
    wev.end({ status: 404 });
    return Response.json({ error: "candidate not found" }, { status: 404 });
  }
  if (job_id) {
    const job = jobRes.data as { id: string; employer_id: string | null } | null;
    if (!job) {
      wev.end({ status: 404 });
      return Response.json({ error: "job not found" }, { status: 404 });
    }
    if (job.employer_id !== employerId) {
      wev.end({ status: 403 });
      return Response.json({ error: "Job does not belong to your organization." }, { status: 403 });
    }
  }

  let dupQuery = db
    .from("shortlists")
    .select("id, employer_id, candidate_id, job_id, status, notes, created_at")
    .eq("employer_id", employerId)
    .eq("candidate_id", candidate_id);
  dupQuery = job_id ? dupQuery.eq("job_id", job_id) : dupQuery.is("job_id", null);
  const { data: existing } = await dupQuery.limit(1).maybeSingle();
  if (existing) {
    wev.add({ degraded: false });
    wev.end({ status: 200 });
    return Response.json({ shortlist: existing, deduped: true });
  }

  const { data } = await db
    .from("shortlists")
    .insert({
      employer_id: employerId,
      candidate_id,
      job_id: job_id ?? null,
      status: "saved",
      notes: notes || null,
    })
    .select("id, employer_id, candidate_id, job_id, status, notes, created_at")
    .single();
  if (!data) {
    console.error("[shortlists] save failed");
    wev.add({ degraded: true });
    wev.end({ status: 500, error: "shortlist save failed" });
    return Response.json({ error: "shortlist save failed" }, { status: 500 });
  }
  const shortlistId = (data as { id: string }).id;
  await auditBestEffort(db, {
    action: "shortlist",
    target_type: "shortlist",
    target_id: shortlistId,
    metadata: { employer_id: employerId, candidate_id, job_id: job_id ?? null },
  });
  after(async () => {
    const bg = startWideEvent("shortlists", "POST-email");
    try {
      const mailDb = supabaseAdmin();
      const { data: cc } = await mailDb.from("candidates").select("full_name, contact_email").eq("id", candidate_id).maybeSingle();
      const em = (cc as { contact_email?: string; full_name?: string } | null)?.contact_email;
      if (!em) {
        bg.add({ email_outcome: "skipped", email_reason: "no recipient", degraded: false });
        bg.end({ status: 200 });
        return;
      }
      let jobTitle = "a role you match";
      let companyName = "An employer";
      try {
        if (job_id) {
          const { data: jj } = await mailDb.from("jobs").select("title, employer_id").eq("id", job_id).maybeSingle();
          const jt = (jj as { title?: string; employer_id?: string } | null)?.title;
          if (jt && jt.trim()) jobTitle = jt.trim().slice(0, 120);
          const eid = (jj as { employer_id?: string } | null)?.employer_id ?? employerId;
          if (eid) {
            const { data: ee } = await mailDb.from("employers").select("company_name").eq("id", eid).maybeSingle();
            const cn = (ee as { company_name?: string } | null)?.company_name;
            if (cn && cn.trim()) companyName = cn.trim().slice(0, 120);
          }
        } else {
          const { data: ee } = await mailDb.from("employers").select("company_name").eq("id", employerId).maybeSingle();
          const cn = (ee as { company_name?: string } | null)?.company_name;
          if (cn && cn.trim()) companyName = cn.trim().slice(0, 120);
        }
      } catch {
      }
      const tpl = newMatchEmail((cc as { full_name?: string })?.full_name ?? "there", jobTitle, companyName);
      const result = await withTimeout(sendEmail(em, tpl.subject, tpl.html), EMAIL_TIMEOUT_MS);
      bg.add({
        email_outcome: result.skipped ? "skipped" : "sent",
        email_reason: result.skipped ? result.reason : (result.id ?? "ok"),
        degraded: false,
      });
      bg.end({ status: 200 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bg.add({ email_outcome: "failed", email_reason: msg.slice(0, 200), degraded: true });
      bg.end({ status: 500, error: msg.slice(0, 200) });
    }
  });
  wev.add({ degraded: false });
  wev.end({ status: 201 });
  return Response.json({ shortlist: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const wev = startWideEvent("shortlists", "DELETE");
  const session = await getSessionUser();
  const limited = rateLimitRoute(request, {
    key: "shortlists-delete",
    limit: 60,
    windowMs: 60_000,
    principal: session?.email,
  });
  if (limited) {
    wev.end({ status: limited.status });
    return limited;
  }
  const hr = await requireHrDb(session);
  if (hr instanceof Response) {
    wev.end({ status: hr.status });
    return hr;
  }
  if (hr.user.viewer.kind !== "hr") {
    wev.end({ status: 401 });
    return Response.json({ error: "Employer session required." }, { status: 401 });
  }
  const db = hr.client;
  const employerId = hr.employerId;
  const url = new URL(request.url);
  const idParam = url.searchParams.get("id") ?? undefined;
  const body = await request.json().catch(() => null);

  if (idParam ?? body?.id) {
    const parsed = removeByIdSchema.safeParse({ id: idParam ?? body.id });
    if (!parsed.success) {
      wev.end({ status: 400 });
      return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
    }
    const { data: row } = await db
      .from("shortlists")
      .select("id, employer_id")
      .eq("id", parsed.data.id)
      .maybeSingle();
    const owned = (row as { id: string; employer_id: string | null } | null)?.employer_id === employerId;
    if (!row || !owned) {
      wev.end({ status: 404 });
      return Response.json({ error: "shortlist not found" }, { status: 404 });
    }
    const { error } = await db
      .from("shortlists")
      .delete()
      .eq("id", parsed.data.id)
      .eq("employer_id", employerId);
    if (error) {
      console.error("[shortlists] remove failed");
      wev.add({ degraded: true });
      wev.end({ status: 500, error: "shortlist remove failed" });
      return Response.json({ error: "shortlist remove failed" }, { status: 500 });
    }
    wev.add({ degraded: false });
    wev.end({ status: 200 });
    return Response.json({ ok: true });
  }

  const parsed = saveSchema.pick({ candidate_id: true, job_id: true }).safeParse(body);
  if (!parsed.success) {
    wev.end({ status: 400 });
    return Response.json(
      { error: "provide ?id= or JSON { id } or { candidate_id, job_id? }" },
      { status: 400 },
    );
  }
  let q = db
    .from("shortlists")
    .delete()
    .eq("employer_id", employerId)
    .eq("candidate_id", parsed.data.candidate_id);
  q = parsed.data.job_id ? q.eq("job_id", parsed.data.job_id) : q.is("job_id", null);
  const { error } = await q;
  if (error) {
    console.error("[shortlists] remove failed");
    wev.add({ degraded: true });
    wev.end({ status: 500, error: "shortlist remove failed" });
    return Response.json({ error: "shortlist remove failed" }, { status: 500 });
  }
  wev.add({ degraded: false });
  wev.end({ status: 200 });
  return Response.json({ ok: true });
}
