import { z } from "zod";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { contactLoggedEmail, sendEmail } from "@/lib/email";
import { requireHrDb, requireOwnerDb, getSessionUser } from "@/lib/supabase-user";
import { rateLimit, rateLimitRoute } from "@/lib/rate-limit";
import { startWideEvent } from "@/lib/observe";

const EMAIL_TIMEOUT_MS = 15000;
const IDEMPOTENCY_WINDOW_MS = 10 * 60_000;

const bodySchema = z.object({
  candidate_id: z.string().uuid(),
  job_id: z.string().uuid().nullish(),
  channel: z.enum(["email", "phone", "platform", "other"]).default("platform"),
  message: z.string().trim().max(4000).default(""),
});

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(500).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

const AUDIT_ACTIONS = ["search", "profile_view", "contact", "shortlist", "export", "profile_update", "upload"] as const;

type Db = ReturnType<typeof supabaseAdmin>;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("email timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function messageHash(channel: string, message: string): string {
  return createHash("sha256").update(`${channel}|${message}`, "utf8").digest("hex");
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const i = raw.lastIndexOf("|");
    if (i <= 0) return null;
    const createdAt = raw.slice(0, i);
    const id = raw.slice(i + 1);
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

async function auditBestEffort(
  db: Db,
  row: { action: string; target_type: string; target_id: string | null; metadata: Record<string, unknown> },
): Promise<void> {
  if (!(AUDIT_ACTIONS as readonly string[]).includes(row.action)) return;
  try {
    await db.from("audit_logs").insert(row);
  } catch {}
}

export async function POST(request: Request) {
  const wev = startWideEvent("contacts", "POST");
  const session = await getSessionUser();
  const limited = rateLimitRoute(request, {
    key: "contacts-post",
    limit: 20,
    windowMs: 10 * 60_000,
    principal: session?.email,
  });
  if (limited) {
    wev.end({ status: limited.status });
    return limited;
  }
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    wev.end({ status: 400 });
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
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
  const checks = supabaseAdmin();
  const db = hr.client;
  const employerId = hr.employerId;
  const { candidate_id, job_id, channel, message } = parsed.data;

  const perTarget = rateLimit(request, {
    key: `contacts-post-target:${candidate_id}`,
    limit: 5,
    windowMs: 10 * 60_000,
    principal: hr.user.email,
  });
  if (!perTarget.ok) {
    wev.end({ status: 429 });
    return Response.json(
      { error: "Too many requests. Slow down and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(perTarget.retryAfterMs / 1000)) },
      },
    );
  }

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

  const windowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
  let recentQuery = db
    .from("contact_log")
    .select("id, channel, message, job_id, created_at")
    .eq("employer_id", employerId)
    .eq("candidate_id", candidate_id)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(20);
  recentQuery = job_id ? recentQuery.eq("job_id", job_id) : recentQuery.is("job_id", null);
  const { data: recent } = await recentQuery;
  const incoming = messageHash(channel, message || "");
  const dupe = ((recent ?? []) as { id: string; channel: string; message: string | null }[]).find(
    (r) => messageHash(r.channel, r.message ?? "") === incoming,
  );
  if (dupe) {
    wev.add({ degraded: false });
    wev.end({ status: 200 });
    return Response.json({ id: dupe.id, status: "logged", deduped: true });
  }

  const { data } = await db
    .from("contact_log")
    .insert({
      employer_id: employerId,
      candidate_id,
      job_id: job_id ?? null,
      channel,
      message: message || null,
    })
    .select("id")
    .single();

  if (!data) {
    console.error("[contacts] log failed");
    wev.add({ degraded: true });
    wev.end({ status: 500, error: "contact log failed" });
    return Response.json(
      { error: "contact log failed" },
      { status: 500 },
    );
  }
  const contactId = (data as { id: string }).id;
  await auditBestEffort(db, {
    action: "contact",
    target_type: "contact",
    target_id: contactId,
    metadata: { employer_id: employerId, candidate_id, job_id: job_id ?? null, channel },
  });

  after(async () => {
    const bg = startWideEvent("contacts", "POST-email");
    try {
      const mailDb = supabaseAdmin();
      const [cRes, jRes] = await Promise.all([
        mailDb.from("candidates").select("full_name, contact_email").eq("id", candidate_id).maybeSingle(),
        job_id
          ? mailDb.from("jobs").select("title, employers(company_name)").eq("id", job_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const cc = cRes.data as { full_name?: string; contact_email?: string } | null;
      let jobTitle: string | null = null;
      let company: string | null = null;
      if (job_id) {
        const jj = jRes.data as {
          title?: string;
          employers?: { company_name?: string } | { company_name?: string }[] | null;
        } | null;
        jobTitle = jj?.title ?? null;
        const emp = jj?.employers;
        company = Array.isArray(emp)
          ? (emp[0]?.company_name ?? null)
          : (emp?.company_name ?? null);
      }
      if (!cc?.contact_email) {
        bg.add({ email_outcome: "skipped", email_reason: "no recipient", degraded: false });
        bg.end({ status: 200 });
        return;
      }
      const tpl = contactLoggedEmail(cc.full_name ?? "there", {
        jobTitle,
        company,
        channel,
      });
      const result = await withTimeout(sendEmail(cc.contact_email, tpl.subject, tpl.html), EMAIL_TIMEOUT_MS);
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
  return Response.json(
    { id: contactId, status: "logged" },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const wev = startWideEvent("contacts", "GET");
  const session = await getSessionUser();
  const limited = rateLimitRoute(request, {
    key: "contacts-get",
    limit: 60,
    windowMs: 60_000,
    principal: session?.email,
  });
  if (limited) {
    wev.end({ status: limited.status });
    return limited;
  }
  if (!session) {
    wev.end({ status: 401 });
    return Response.json({ error: "Sign in to view contact logs." }, { status: 401 });
  }
  const viewer = session.viewer;
  const url = new URL(request.url);
  const candidate_id = url.searchParams.get("candidate_id");
  if (!candidate_id) {
    wev.end({ status: 400 });
    return Response.json({ error: "candidate_id is required." }, { status: 400 });
  }
  const raw = {
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
  if (viewer.kind === "owner") {
    const owned = await requireOwnerDb(candidate_id, session);
    if (owned instanceof Response) {
      wev.end({ status: 403 });
      return Response.json({ error: "You can only view your own contact logs." }, { status: 403 });
    }
    const db = owned.client;
    let oq = db
      .from("contact_log")
      .select("id, employer_id, candidate_id, job_id, channel, message, created_at")
      .eq("candidate_id", candidate_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (parsed.data.cursor) {
      const c = decodeCursor(parsed.data.cursor);
      if (!c) {
        wev.end({ status: 400 });
        return Response.json({ error: "Invalid cursor." }, { status: 400 });
      }
      oq = oq.or(`created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`);
      oq = oq.limit(pageSize + 1);
    } else if (parsed.data.offset !== undefined) {
      oq = oq.range(parsed.data.offset, parsed.data.offset + pageSize);
    } else {
      oq = oq.limit(pageSize + 1);
    }
    const { data, error } = await oq;
    if (error) {
      console.error("[contacts] list failed");
      wev.add({ degraded: true });
      wev.end({ status: 500, error: "contact list failed" });
      return Response.json({ error: "contact list failed" }, { status: 500 });
    }
    const orows = (data ?? []) as { id: string; created_at: string }[];
    const opage = orows.slice(0, pageSize);
    const onext = orows.length > pageSize ? encodeCursor(orows[pageSize - 1].created_at, orows[pageSize - 1].id) : null;
    wev.add({ degraded: false });
    wev.end({ status: 200 });
    return Response.json({ results: opage, nextCursor: onext, degraded: false });
  }
  const hr = await requireHrDb(session);
  if (hr instanceof Response) {
    wev.end({ status: hr.status });
    return hr;
  }
  const db = hr.client;
  const employerId = hr.employerId;
  let q = db
    .from("contact_log")
    .select("id, employer_id, candidate_id, job_id, channel, message, created_at")
    .eq("candidate_id", candidate_id)
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
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
    console.error("[contacts] list failed");
    wev.add({ degraded: true });
    wev.end({ status: 500, error: "contact list failed" });
    return Response.json({ error: "contact list failed" }, { status: 500 });
  }
  const rows = (data ?? []) as { id: string; created_at: string }[];
  const page = rows.slice(0, pageSize);
  const nextCursor = rows.length > pageSize ? encodeCursor(rows[pageSize - 1].created_at, rows[pageSize - 1].id) : null;
  wev.add({ degraded: false });
  wev.end({ status: 200 });
  return Response.json({ results: page, nextCursor, degraded: false });
}
