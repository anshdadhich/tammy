import { z } from "zod";
import { inngest } from "@/lib/inngest";
import { supabaseAdmin } from "@/lib/supabase";
import { candidateSchema, normalizeEmail } from "@/lib/validators";
import { revealedCandidateIds, lockContacts } from "@/lib/contact-prefs";
import { normalizeSkills } from "@/lib/skills";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { redactPii } from "@/lib/redact";
import { readJsonBody } from "@/lib/http";
import {
  bundleForViewer,
  guardOwnerAuth,
  verifyEmailChangeToken,
} from "@/lib/api-auth";
import { requireHrDb, requireOwnerDb, userDb, getSessionUser } from "@/lib/supabase-user";

const uuid = z.string().uuid("Must be a valid UUID");

const SHOW_FLAGS = [
  "show_email",
  "show_phone",
  "show_linkedin",
  "show_github",
  "show_resume",
  "show_portfolio",
  "show_photo",
] as const;

const CONTACT_COLS = [
  "contact_email",
  "contact_phone",
  "linkedin_url",
  "github_url",
  "portfolio_url",
  "resume_url",
  "photo_url",
] as const;

const JSON_LIMITS: Record<string, number> = {
  "candidates-post": 1024 * 1024,
  "candidates-put": 1024 * 1024,
  "candidates-patch": 256 * 1024,
  "candidates-delete": 256 * 1024,
};

function isMissingColumnErr(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST204") return true;
  return /could not find the|column .* does not exist/i.test(err.message ?? "");
}

function stripShowFlags(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  for (const f of SHOW_FLAGS) delete out[f];
  return out;
}

function nullPublicContact(c: Record<string, unknown>): Record<string, unknown> {
  const out = { ...c };
  for (const col of CONTACT_COLS) out[col] = null;
  out.min_salary = null;
  out.salary_currency = null;
  out.salary_frequency = null;
  out.salary_negotiable = null;
  return out;
}

function prefsDegraded(c: Record<string, unknown>): boolean {
  return SHOW_FLAGS.some((f) => !(f in c));
}

function verifyCaptchaHook(raw: unknown): boolean {
  if (process.env.CAPTCHA_REQUIRED === "1" || process.env.TURNSTILE_REQUIRED === "1") {
    const r = (raw ?? {}) as Record<string, unknown>;
    const token = r.captchaToken ?? r.turnstileToken ?? r["cf-turnstile-response"];
    if (typeof token !== "string" || token.trim().length < 8) return false;
  }
  return true;
}

function honeypotTripped(raw: unknown): boolean {
  const r = (raw ?? {}) as Record<string, unknown>;
  for (const k of ["website", "company_website", "url_website", "honeypot", "_hp"]) {
    const v = r[k];
    if (typeof v === "string" && v.trim() !== "") return true;
  }
  return false;
}

export async function GET(request: Request) {
  const rl = rateLimit(request, { key: "candidates-get", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? undefined;
  if (!id) {
    return Response.json({ error: "provide ?id=<candidate uuid>" }, { status: 400 });
  }
  const session = await getSessionUser();
  const viewer = session?.viewer ?? { kind: "anon" };
  if (!uuid.safeParse(id).success) {
    return Response.json({ error: "id must be a valid UUID" }, { status: 400 });
  }
  const db = supabaseAdmin();

  const { data } = await db.from("candidates").select("*").eq("id", id).maybeSingle();
  const candidate = (data as Record<string, unknown> | null) ?? null;
  if (!candidate) return Response.json({ error: "candidate not found" }, { status: 404 });
  const cid = candidate.id as string;

  let isOwnerVerified = false;
  if (viewer.kind === "owner" && viewer.id === cid) {
    const gate = await requireOwnerDb(cid, session);
    isOwnerVerified = !(gate instanceof Response);
  }
  let isHrVerified = false;
  let hrEmployerId: string | null = null;
  if (viewer.kind === "hr") {
    const hr = await requireHrDb(session);
    if (!(hr instanceof Response)) {
      isHrVerified = true;
      hrEmployerId = hr.employerId;
    }
  }

  if (String(candidate.visibility_status ?? "visible") !== "visible" && !isOwnerVerified) {
    return Response.json({ error: "candidate not found" }, { status: 404 });
  }

  const privilegedLogs = isOwnerVerified || isHrVerified;

  let effective: Record<string, unknown>;
  if (isOwnerVerified) {
    effective = { ...candidate };
  } else if (isHrVerified) {
    effective = { ...candidate, user_id: null, consent_status: null };
  } else {
    effective = nullPublicContact({ ...candidate, user_id: null, consent_status: null });
  }
  if (isHrVerified && !isOwnerVerified && hrEmployerId) {
    const revealed = await revealedCandidateIds(db, hrEmployerId);
    if (!revealed.has(cid)) {
      effective = lockContacts(effective);
    }
  }
  const degraded = prefsDegraded(candidate);

  let ownSearchIds: string[] | null = null;
  if (privilegedLogs && !isOwnerVerified && hrEmployerId) {
    try {
      const { data: ownSearches } = await db.from("searches").select("id").eq("employer_id", hrEmployerId).limit(2000);
      ownSearchIds = ((ownSearches ?? []) as { id: string }[]).map((s) => s.id);
    } catch {
      ownSearchIds = [];
    }
  }

  const contactLogQuery = () => {
    let q = db.from("contact_log").select("id, channel, message, job_id, employer_id, created_at").eq("candidate_id", cid).order("created_at", { ascending: false }).limit(50);
    if (!isOwnerVerified && hrEmployerId) q = q.eq("employer_id", hrEmployerId);
    return q;
  };
  const matchesQuery = () => {
    let q = db.from("candidate_matches").select("id, search_id, job_id, score, status, created_at").eq("candidate_id", cid).order("created_at", { ascending: false }).limit(50);
    if (!isOwnerVerified && ownSearchIds) q = q.in("search_id", ownSearchIds.length ? ownSearchIds : ["00000000-0000-0000-0000-000000000000"]);
    return q;
  };
  const shortlistsQuery = () => {
    let q = db.from("shortlists").select("id, job_id, status, notes, created_at").eq("candidate_id", cid).order("created_at", { ascending: false }).limit(50);
    if (!isOwnerVerified && hrEmployerId) q = q.eq("employer_id", hrEmployerId);
    return q;
  };
  const [{ data: profile }, { data: views }, { data: matches }, { data: shortlisted }, { data: projects }, { data: experiences }, { data: education }, { data: skillRows }] = await Promise.all([
    db.from("candidate_profiles").select("summary_markdown, summary_json, updated_at").eq("candidate_id", cid).maybeSingle(),
    privilegedLogs ? contactLogQuery() : Promise.resolve({ data: [] }),
    privilegedLogs ? matchesQuery() : Promise.resolve({ data: [] }),
    privilegedLogs ? shortlistsQuery() : Promise.resolve({ data: [] }),
    db.from("projects").select("id, title, description, problem_statement, tech_stack, role_in_project, project_link, repo_link, deployment_link, impact_summary, project_type").eq("candidate_id", cid),
    db.from("work_experiences").select("company_name, job_title, start_date, end_date, is_current, description, achievements, tech_stack").eq("candidate_id", cid),
    db.from("education").select("institution, degree, field_of_study, start_year, end_year, achievements").eq("candidate_id", cid),
    db.from("candidate_skills").select("experience_years, proficiency_level, source, skills(name)").eq("candidate_id", cid),
  ]);

  let oss: Record<string, unknown>[] = [];
  try {
    const { data, error } = await db
      .from("open_source_contributions")
      .select("id, repo_name, repo_url, description, pr_links, tech_stack, role")
      .eq("candidate_id", cid);
    if (!error && data) oss = data as Record<string, unknown>[];
  } catch {
    oss = [];
  }

  const depths: Record<string, Record<string, unknown>> = {};
  const projIds = ((projects ?? []) as { id: string }[]).map((p) => p.id).filter(Boolean);
  if (projIds.length) {
    const { data: depthRows } = await db
      .from("project_depth_analysis")
      .select("project_id, complexity_score, technical_complexity, architectural_concepts, autonomy_level, evidence_quality, estimated_seniority_signal, business_impact, project_maturity")
      .in("project_id", projIds);
    for (const d of ((depthRows ?? []) as Record<string, unknown>[])) {
      depths[String(d.project_id)] = d;
    }
  }

  const bundled = bundleForViewer(privilegedLogs ? viewer : { kind: "anon" }, effective, {
    profile: profile ?? null,
    contact_log: views ?? [],
    matches: matches ?? [],
    shortlists: shortlisted ?? [],
    projects: projects ?? [],
    oss,
    experiences: experiences ?? [],
    education: education ?? [],
    skills: skillRows ?? [],
    depths,
  });
  if (isOwnerVerified) {
    (bundled as Record<string, unknown>).candidate = { ...candidate };
  }
  if (degraded) {
    return Response.json({ ...bundled, contactPrefsDegraded: true });
  }
  return Response.json(bundled);
}

const MONTHS: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

function toDateInput(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  const m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mm = MONTHS[m[1].toLowerCase()];
    if (mm) return `${m[2]}-${mm}-01`;
  }
  return null;
}

function normJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normJson);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      o[k] = normJson((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v ?? null;
}

function sameRows(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map((r) => JSON.stringify(normJson(r))).sort();
  const sb = b.map((r) => JSON.stringify(normJson(r))).sort();
  return sa.every((s, i) => s === sb[i]);
}

async function restoreRows(
  db: ReturnType<typeof supabaseAdmin>,
  table: string,
  candidateId: string,
  prev: unknown[],
  label: string,
): Promise<void> {
  try {
    const rows = (prev as Record<string, unknown>[]).map((r) => ({ candidate_id: candidateId, ...r }));
    if (!rows.length) return;
    const { error } = await db.from(table).insert(rows);
    if (error) throw error;
  } catch (e) {
    console.error(`[candidates] ${label} restore failed`, redactPii((e as Error)?.message ?? String(e)).slice(0, 200));
  }
}

async function skillIdMap(
  db: ReturnType<typeof supabaseAdmin>,
  names: unknown,
): Promise<{ canon: string[]; byName: Map<string, string>; ok: boolean }> {
  const raw = Array.isArray(names) ? names : [];
  const canon = normalizeSkills(
    raw
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 60 && /^[A-Za-z0-9][A-Za-z0-9 +#./&\-]{1,59}$/.test(s)),
  );
  const byName = new Map<string, string>();
  if (!canon.length) return { canon, byName, ok: true };
  try {
    await db.from("skills").upsert(
      canon.map((name) => ({ name })),
      { onConflict: "name", ignoreDuplicates: true },
    );
  } catch {
  }
  try {
    const { data, error } = await db.from("skills").select("id, name").in("name", canon);
    if (error) throw error;
    for (const s of ((data ?? []) as { id: string; name: string }[])) {
      byName.set(s.name.toLowerCase(), s.id);
    }
  } catch {
    return { canon, byName, ok: false };
  }
  return { canon, byName, ok: true };
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "candidates-post", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const read = await readJsonBody(request, JSON_LIMITS["candidates-post"]);
  if (!read.ok) return read.response;
  const rawBody = read.body;
  if (honeypotTripped(rawBody)) {
    return Response.json({ error: "submission rejected" }, { status: 400 });
  }
  if (!verifyCaptchaHook(rawBody)) {
    return Response.json({ error: "verification required" }, { status: 403 });
  }
  const session = await getSessionUser();
  if (session?.userRow && session.userRow.role === "employer") {
    return Response.json({ error: "Employer accounts cannot create candidate profiles." }, { status: 403 });
  }
  const parsed = candidateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const db = supabaseAdmin();
  const c = parsed.data;
  const email = normalizeEmail(c.email);

  try {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from("candidates")
      .select("id, created_at")
      .eq("contact_email", email)
      .gt("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(5);
    const rows = (recent ?? []) as { id: string; created_at: string }[];
    if (rows.length >= 3) {
      return Response.json({ error: "Too many submissions for this email. Try again later." }, { status: 429 });
    }
    const newest = rows[0];
    if (newest && Date.now() - new Date(newest.created_at).getTime() < 10 * 60 * 1000) {
      return Response.json(
        { error: "A submission for this email is already pending.", candidateId: newest.id },
        { status: 429 },
      );
    }
  } catch {
  }

  const { data: dupe } = await db
    .from("candidates")
    .select("id")
    .eq("contact_email", email)
    .limit(1)
    .maybeSingle();
  if ((dupe as { id: string } | null)?.id) {
    return Response.json(
      { error: "A profile already exists for this email.", candidateId: (dupe as { id: string }).id },
      { status: 409 },
    );
  }

  let userId: string | null = null;
  let createdUser = false;
  const existing = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (existing.data) {
    userId = (existing.data as { id: string }).id;
  } else {
    const { data: user } = await db
      .from("users")
      .insert({ email, role: "candidate" })
      .select("id")
      .single();
    if (!user) {
      console.error("[candidates] user create failed");
      return Response.json({ error: "user create failed" }, { status: 500 });
    }
    userId = (user as { id: string }).id;
    createdUser = true;
  }

  const remoteMap: Record<string, string> = { remote: "remote_only", hybrid: "hybrid", onsite: "onsite" };
  const avail = /immedi/i.test(c.availability ?? "") ? "immediate" : /inactive/i.test(c.availability ?? "") ? "inactive" : "notice";
  const row: Record<string, unknown> = {
    user_id: userId,
    full_name: c.name,
    headline: c.headline || `${c.role} - ${c.domain}`,
    domain: c.domain,
    current_position: c.current_role || c.role,
    total_experience_years: c.exp ?? 0,
    location_city: c.location_pref || c.location,
    remote_preference: remoteMap[c.remote_pref] ?? "flexible",
    open_to_relocation: c.relocation ?? false,
    min_salary: c.min_salary ?? 0,
    salary_currency: (c.currency ?? "INR").toUpperCase(),
    salary_frequency: c.frequency ?? "monthly",
    salary_negotiable: c.negotiable ?? true,
    availability_status: avail,
    notice_period: (c.notice_period ?? "").trim().slice(0, 200) || null,
    visibility_status: "hidden",
    consent_status: "pending",
    ...(c.show_email !== undefined ? { show_email: c.show_email } : {}),
    ...(c.show_phone !== undefined ? { show_phone: c.show_phone } : {}),
    ...(c.show_linkedin !== undefined ? { show_linkedin: c.show_linkedin } : {}),
    ...(c.show_github !== undefined ? { show_github: c.show_github } : {}),
    ...(c.show_resume !== undefined ? { show_resume: c.show_resume } : {}),
    ...(c.show_portfolio !== undefined ? { show_portfolio: c.show_portfolio } : {}),
    ...(c.show_photo !== undefined ? { show_photo: c.show_photo } : {}),
    contact_email: email,
    contact_phone: c.phone || null,
    github_url: c.links?.github || null,
    linkedin_url: c.links?.linkedin || null,
    portfolio_url: c.links?.portfolio || null,
    resume_url: c.links?.resume_url || null,
    photo_url: c.photo_url || null,
  };
  let { data: cand, error: candErr } = await db.from("candidates").insert(row).select("id").single();
  if (!cand && isMissingColumnErr(candErr)) {
    ({ data: cand, error: candErr } = await db
      .from("candidates")
      .insert(stripShowFlags(row))
      .select("id")
      .single());
  }
  if (!cand) {
    console.error("[candidates] create failed");
    return Response.json({ error: "candidate create failed" }, { status: 500 });
  }
  const candidateId = (cand as { id: string }).id;

  const warnings: string[] = [];
  const cleanTech = (t: unknown): string[] =>
    Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
  const cleanProjType = (t: unknown): string | null =>
    typeof t === "string" &&
    ["personal", "academic", "freelance", "production", "open_source", "prototype"].includes(t)
      ? t
      : null;
  try {
    if (c.experiences?.length) {
      const { error } = await db.from("work_experiences").insert(c.experiences.map((x) => ({
        candidate_id: candidateId,
        company_name: x.company,
        job_title: x.title,
        start_date: toDateInput(x.start_date),
        end_date: toDateInput(x.end_date),
        is_current: x.current ?? false,
        description: x.description || null,
        achievements: x.achievements || null,
        tech_stack: cleanTech(x.tech),
      })));
      if (error) {
        console.error("[candidates] experience insert failed", redactPii(error.message));
        warnings.push("experience: could not save (code EXP_SAVE)");
      }
    }
  } catch (e) {
    console.error("[candidates] experience insert threw", redactPii((e as Error).message));
    warnings.push("experience: could not save (code EXP_SAVE)");
  }
  try {
    if (c.projects?.length) {
      const { error } = await db.from("projects").insert(c.projects.map((p) => ({
        candidate_id: candidateId,
        title: p.title,
        description: p.description,
        problem_statement: p.problem || null,
        tech_stack: cleanTech(p.tech),
        role_in_project: p.role || null,
        project_link: p.links?.live || null,
        repo_link: p.links?.repo || null,
        deployment_link: p.links?.demo || p.links?.live || null,
        impact_summary: [p.impact, p.users_scale, p.hardest_challenge, p.personal_contribution].filter(Boolean).join("\n\n") || null,
        project_type: cleanProjType(p.project_type),
      })));
      if (error) {
        console.error("[candidates] projects insert failed", redactPii(error.message));
        warnings.push("projects: could not save (code PRJ_SAVE)");
      }
    }
  } catch (e) {
    console.error("[candidates] projects insert threw", redactPii((e as Error).message));
    warnings.push("projects: could not save (code PRJ_SAVE)");
  }
  try {
    if (c.oss?.length) {
      const { error } = await db.from("open_source_contributions").insert(
        c.oss
          .filter((o) => o.repo_name?.trim())
          .map((o) => ({
            candidate_id: candidateId,
            repo_name: o.repo_name.trim(),
            repo_url: o.repo_url || null,
            description: o.description || null,
            pr_links: (o.pr_links ?? []).filter((u) => u && u.trim()),
            tech_stack: cleanTech(o.tech),
            role: o.role || "Contributor",
          })),
      );
      if (error) {
        console.error("[candidates] oss insert failed", redactPii(error.message));
        warnings.push("open source: could not save (code OSS_SAVE)");
      }
    }
  } catch (e) {
    console.error("[candidates] oss insert threw", redactPii((e as Error).message));
    warnings.push("open source: could not save (code OSS_SAVE)");
  }
  try {
    if (c.education?.length) {
      const rows = c.education.filter((e) => e.institution).map((e) => {
        const yrs = (e.years || "").match(/\d{4}/g) ?? [];
        return {
          candidate_id: candidateId,
          institution: e.institution,
          degree: e.degree || null,
          field_of_study: e.field || null,
          start_year: yrs[0] ? Number(yrs[0]) : null,
          end_year: yrs[1] ? Number(yrs[1]) : null,
          achievements: e.achievements || null,
        };
      });
      if (rows.length) {
        const { error } = await db.from("education").insert(rows);
        if (error) {
          console.error("[candidates] education insert failed", redactPii(error.message));
          warnings.push("education: could not save (code EDU_SAVE)");
        }
      }
    }
  } catch (e) {
    console.error("[candidates] education insert threw", redactPii((e as Error).message));
    warnings.push("education: could not save (code EDU_SAVE)");
  }
  try {
    if (c.skills?.length) {
      const { canon, byName } = await skillIdMap(db, c.skills);
      const links = canon.flatMap((name) => {
        const id = byName.get(name.toLowerCase());
        return id ? [{ candidate_id: candidateId, skill_id: id, source: "self_reported" }] : [];
      });
      if (links.length) {
        const { error } = await db.from("candidate_skills").upsert(links, { onConflict: "candidate_id,skill_id" });
        if (error) {
          console.error("[candidates] skills upsert failed", redactPii(error.message));
          warnings.push("skills: could not save (code SKL_SAVE)");
        }
      } else if (c.skills?.length) {
        warnings.push("skills: some skill names were skipped");
      }
    }
  } catch (e) {
    console.error("[candidates] skills upsert threw", redactPii((e as Error).message));
    warnings.push("skills: could not save (code SKL_SAVE)");
  }

  if (warnings.some((w) => /\(code [A-Z_]+\)/.test(w))) {
    try {
      if (candidateId) {
        const { error: delErr } = await db.from("candidates").delete().eq("id", candidateId);
        if (delErr) throw delErr;
      }
      if (createdUser && userId) {
        const { error: userDelErr } = await db.from("users").delete().eq("id", userId);
        if (userDelErr) throw userDelErr;
      }
    } catch (e) {
      console.error("[candidates] rollback failed — manual cleanup needed", redactPii(candidateId ?? ""));
      return Response.json({ error: "Could not save the profile and rollback failed. Contact support." }, { status: 500 });
    }
    return Response.json({ error: "Could not save the profile. Fix the highlighted fields and retry." }, { status: 500 });
  }

  try {
    await inngest.send({ name: "candidate.profile.submitted", data: { candidateId } });
  } catch (e) {
    console.error("[candidates] pipeline enqueue failed", redactPii((e as Error)?.message ?? String(e)).slice(0, 200));
  }

  return Response.json({ candidateId, status: "processing", warnings }, { status: 202 });
}

export async function PATCH(request: Request) {
  const rl = rateLimit(request, { key: "candidates-patch", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const read = await readJsonBody(request, JSON_LIMITS["candidates-patch"]);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = z
    .object({ id: uuid, visibility_status: z.enum(["visible", "hidden", "inactive"]) })
    .safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const denied = await guardOwnerAuth(request, parsed.data.id);
  if (denied) return denied;
  let db;
  try {
    db = await userDb();
  } catch {
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  const { data } = await db
    .from("candidates")
    .update({ visibility_status: parsed.data.visibility_status })
    .eq("id", parsed.data.id)
    .select("id, visibility_status")
    .maybeSingle();
  if (!data) return Response.json({ error: "candidate not found" }, { status: 404 });
  return Response.json({ candidate: data });
}

export async function PUT(request: Request) {
  const rl = rateLimit(request, { key: "candidates-put", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const read = await readJsonBody(request, JSON_LIMITS["candidates-put"]);
  if (!read.ok) return read.response;
  const body = read.body;
  const idParsed = z.object({ id: uuid }).safeParse(body);
  if (!idParsed.success) {
    return Response.json({ errors: idParsed.error.flatten() }, { status: 400 });
  }
  const id = idParsed.data.id;
  const denied = await guardOwnerAuth(request, id);
  if (denied) return denied;
  const rest = { ...(body as Record<string, unknown>) };
  delete rest.id;
  if (Object.keys(rest).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }
  const parsed = candidateSchema.partial().safeParse(rest);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("candidates")
    .select("id, user_id, contact_email")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return Response.json({ error: "candidate not found" }, { status: 404 });
  const prev = existing as { id: string; user_id: string; contact_email: string };
  const c = parsed.data;
  const present = new Set(Object.keys(rest));

  const patch: Record<string, unknown> = {};
  if (present.has("name")) patch.full_name = c.name;
  if (present.has("headline") || present.has("role") || present.has("domain")) {
    const head = (c.headline || "").trim();
    const role = (c.role || "").trim();
    const domain = (c.domain || "").trim();
    if (head) patch.headline = head;
    else if (role || domain) patch.headline = [role, domain].filter(Boolean).join(" - ");
  }
  if (present.has("domain")) patch.domain = c.domain;
  if (present.has("current_role") || present.has("role")) {
    const cur = (c.current_role || "").trim();
    patch.current_position = cur || (c.role || "").trim() || null;
  }
  if (present.has("exp")) patch.total_experience_years = c.exp ?? 0;
  if (present.has("location_pref") || present.has("location")) {
    const pref = (c.location_pref || "").trim();
    const loc = (c.location || "").trim();
    if (pref || loc) patch.location_city = pref || loc;
  }
  if (present.has("remote_pref")) {
    const remoteMap: Record<string, string> = { remote: "remote_only", hybrid: "hybrid", onsite: "onsite" };
    if (c.remote_pref) patch.remote_preference = remoteMap[c.remote_pref] ?? "flexible";
  }
  if (present.has("relocation")) patch.open_to_relocation = c.relocation ?? false;
  if (present.has("min_salary")) patch.min_salary = c.min_salary ?? 0;
  if (present.has("currency")) patch.salary_currency = ((c.currency ?? "INR") || "INR").toUpperCase();
  if (present.has("frequency")) patch.salary_frequency = c.frequency ?? "monthly";
  if (present.has("negotiable")) patch.salary_negotiable = c.negotiable ?? true;
  if (present.has("availability")) {
    const a = c.availability ?? "";
    patch.availability_status = /immedi/i.test(a) ? "immediate" : /inactive/i.test(a) ? "inactive" : "notice";
  }
  if (present.has("notice_period")) {
    patch.notice_period = (c.notice_period ?? "").trim().slice(0, 200) || null;
  }
  if (present.has("visibility")) patch.visibility_status = c.visibility ?? "visible";
  for (const flag of [
    "show_email",
    "show_phone",
    "show_linkedin",
    "show_github",
    "show_resume",
    "show_portfolio",
    "show_photo",
  ] as const) {
    if (present.has(flag)) patch[flag] = c[flag] === true;
  }
  if (present.has("phone")) patch.contact_phone = c.phone || null;
  if (present.has("photo_url")) {
    const v = typeof c.photo_url === "string" ? c.photo_url.trim() : "";
    patch.photo_url = v ? v : null;
  }
  if (present.has("links")) {
    const li = (rest.links ?? {}) as Record<string, unknown>;
    const linkOrNull = (k: string): string | null => {
      const v = li[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    if ("github" in li) patch.github_url = linkOrNull("github");
    if ("linkedin" in li) patch.linkedin_url = linkOrNull("linkedin");
    if ("portfolio" in li) patch.portfolio_url = linkOrNull("portfolio");
    if ("resume_url" in li) patch.resume_url = linkOrNull("resume_url");
  }
  if (present.has("email") && c.email) {
    const email = normalizeEmail(c.email);
    if (email && email !== normalizeEmail(prev.contact_email)) {
      const rawToken = (body as Record<string, unknown>)?.email_change_token;
      const changeToken = typeof rawToken === "string" ? rawToken : "";
      if (!changeToken || !verifyEmailChangeToken(changeToken, id, email)) {
        return Response.json(
          { error: "Verify the new email address first, then retry the save." },
          { status: 403 },
        );
      }
      const clash = await db.from("users").select("id").eq("email", email).maybeSingle();
      if ((clash.data as { id: string } | null)?.id) {
        return Response.json(
          { error: "That email is already in use. Verify ownership first." },
          { status: 409 },
        );
      }
      // Keep Supabase Auth in sync: OTPs route to the Auth user's email, so
      // updating only public rows would strand future codes at the old inbox
      // and orphan any login attempted from the new address.
      const { data: ownerRow } = await db
        .from("users")
        .select("id, auth_id")
        .eq("id", prev.user_id)
        .maybeSingle();
      const ownerAuthId = (ownerRow as { auth_id: string | null } | null)?.auth_id ?? null;
      if (ownerAuthId) {
        const { error: authErr } = await db.auth.admin.updateUserById(ownerAuthId, { email });
        if (authErr) {
          const msg = authErr.message ?? "";
          if (/already|exists|taken|duplicate/i.test(msg)) {
            return Response.json(
              { error: "That email is already in use. Verify ownership first." },
              { status: 409 },
            );
          }
          console.error("[candidates] auth email update failed", redactPii(msg).slice(0, 200));
          return Response.json({ error: "Could not change email. Try again." }, { status: 500 });
        }
      }
      const { error: userErr } = await db.from("users").update({ email }).eq("id", prev.user_id);
      if (userErr) {
        console.error("[candidates] user email update failed", redactPii(userErr.message));
        return Response.json({ error: "Could not change email. Try again." }, { status: 500 });
      }
      patch.contact_email = email;
    }
  }

  if (Object.keys(patch).length > 0) {
    let { error } = await db.from("candidates").update(patch).eq("id", id);
    if (error && isMissingColumnErr(error)) {
      ({ error } = await db.from("candidates").update(stripShowFlags(patch)).eq("id", id));
    }
    if (error) {
      console.error("[candidates] update failed", redactPii(id));
      return Response.json({ error: "candidate update failed" }, { status: 500 });
    }
  }

  const putWarnings: string[] = [];
  let materialChanged = Object.keys(patch).length > 0;
  const cleanTech = (t: unknown): string[] =>
    Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
  const cleanProjType = (t: unknown): string | null =>
    typeof t === "string" &&
    ["personal", "academic", "freelance", "production", "open_source", "prototype"].includes(t)
      ? t
      : null;
  if (present.has("experiences")) {
    try {
      const nextExp = (c.experiences ?? []).map((x) => ({
        company_name: x.company,
        job_title: x.title,
        start_date: toDateInput(x.start_date),
        end_date: toDateInput(x.end_date),
        is_current: x.current ?? false,
        description: x.description || null,
        achievements: x.achievements || null,
        tech_stack: cleanTech(x.tech),
      }));
      const { data: expRows, error: expFetchErr } = await db
        .from("work_experiences")
        .select("company_name, job_title, start_date, end_date, is_current, description, achievements, tech_stack")
        .eq("candidate_id", id);
      if (expFetchErr) throw expFetchErr;
      if (!sameRows(nextExp, (expRows ?? []) as unknown[])) {
        materialChanged = true;
        await db.from("work_experiences").delete().eq("candidate_id", id);
        if (nextExp.length) {
          const { error } = await db.from("work_experiences").insert(
            nextExp.map((r) => ({ candidate_id: id, ...r })),
          );
          if (error) {
            console.error("[candidates] experience replace failed", redactPii(error.message));
            putWarnings.push("experience: could not save (code EXP_SAVE)");
            await restoreRows(db, "work_experiences", id, (expRows ?? []) as unknown[], "experience");
          }
        }
      }
    } catch (e) {
      console.error("[candidates] experience replace threw", redactPii((e as Error).message));
      putWarnings.push("experience: could not save (code EXP_SAVE)");
    }
  }
  if (present.has("projects")) {
    try {
      const nextProj = (c.projects ?? []).map((p) => ({
        title: p.title,
        description: p.description,
        problem_statement: p.problem || null,
        tech_stack: cleanTech(p.tech),
        role_in_project: p.role || null,
        project_link: p.links?.live || null,
        repo_link: p.links?.repo || null,
        deployment_link: p.links?.demo || p.links?.live || null,
        impact_summary: [p.impact, p.users_scale, p.hardest_challenge, p.personal_contribution].filter(Boolean).join("\n\n") || null,
        project_type: cleanProjType(p.project_type),
      }));
      const { data: projRows, error: projFetchErr } = await db
        .from("projects")
        .select("title, description, problem_statement, tech_stack, role_in_project, project_link, repo_link, deployment_link, impact_summary, project_type")
        .eq("candidate_id", id);
      if (projFetchErr) throw projFetchErr;
      if (!sameRows(nextProj, (projRows ?? []) as unknown[])) {
        materialChanged = true;
        await db.from("projects").delete().eq("candidate_id", id);
        if (nextProj.length) {
          const { error } = await db.from("projects").insert(
            nextProj.map((r) => ({ candidate_id: id, ...r })),
          );
          if (error) {
            console.error("[candidates] projects replace failed", redactPii(error.message));
            putWarnings.push("projects: could not save (code PRJ_SAVE)");
            await restoreRows(db, "projects", id, (projRows ?? []) as unknown[], "projects");
          }
        }
      }
    } catch (e) {
      console.error("[candidates] projects replace threw", redactPii((e as Error).message));
      putWarnings.push("projects: could not save (code PRJ_SAVE)");
    }
  }
  if (present.has("oss")) {
    try {
      const nextOss = (c.oss ?? [])
        .filter((o) => o.repo_name?.trim())
        .map((o) => ({
          repo_name: o.repo_name.trim(),
          repo_url: o.repo_url || null,
          description: o.description || null,
          pr_links: (o.pr_links ?? []).filter((u) => u && u.trim()),
          tech_stack: cleanTech(o.tech),
          role: o.role || "Contributor",
        }));
      const { data: ossRows, error: ossFetchErr } = await db
        .from("open_source_contributions")
        .select("repo_name, repo_url, description, pr_links, tech_stack, role")
        .eq("candidate_id", id);
      if (ossFetchErr) throw ossFetchErr;
      if (!sameRows(nextOss, (ossRows ?? []) as unknown[])) {
        materialChanged = true;
        await db.from("open_source_contributions").delete().eq("candidate_id", id);
        if (nextOss.length) {
          const { error } = await db.from("open_source_contributions").insert(
            nextOss.map((r) => ({ candidate_id: id, ...r })),
          );
          if (error) {
            console.error("[candidates] oss replace failed", redactPii(error.message));
            putWarnings.push("open source: could not save (code OSS_SAVE)");
            await restoreRows(db, "open_source_contributions", id, (ossRows ?? []) as unknown[], "oss");
          }
        }
      }
    } catch (e) {
      console.error("[candidates] oss replace threw", redactPii((e as Error).message));
      putWarnings.push("open source: could not save (code OSS_SAVE)");
    }
  }
  if (present.has("education")) {
    try {
      const nextEdu = (c.education ?? []).filter((e) => e.institution).map((e) => {
        const yrs = (e.years || "").match(/\d{4}/g) ?? [];
        return {
          institution: e.institution,
          degree: e.degree || null,
          field_of_study: e.field || null,
          start_year: yrs[0] ? Number(yrs[0]) : null,
          end_year: yrs[1] ? Number(yrs[1]) : null,
          achievements: e.achievements || null,
        };
      });
      const { data: eduRows, error: eduFetchErr } = await db
        .from("education")
        .select("institution, degree, field_of_study, start_year, end_year, achievements")
        .eq("candidate_id", id);
      if (eduFetchErr) throw eduFetchErr;
      if (!sameRows(nextEdu, (eduRows ?? []) as unknown[])) {
        materialChanged = true;
        await db.from("education").delete().eq("candidate_id", id);
        if (nextEdu.length) {
          const { error } = await db.from("education").insert(
            nextEdu.map((r) => ({ candidate_id: id, ...r })),
          );
          if (error) {
            console.error("[candidates] education replace failed", redactPii(error.message));
            putWarnings.push("education: could not save (code EDU_SAVE)");
            await restoreRows(db, "education", id, (eduRows ?? []) as unknown[], "education");
          }
        }
      }
    } catch (e) {
      console.error("[candidates] education replace threw", redactPii((e as Error).message));
      putWarnings.push("education: could not save (code EDU_SAVE)");
    }
  }
  if (present.has("skills")) {
    try {
      const { canon, byName, ok: skillsOk } = await skillIdMap(db, c.skills ?? []);
      const nextNames = [...canon.map((s) => s.toLowerCase())].sort();
      const { data: haveRows, error: haveErr } = await db
        .from("candidate_skills")
        .select("skills(name)")
        .eq("candidate_id", id);
      if (!skillsOk || haveErr) {
        console.error("[candidates] skills read failed — skipping rewrite to protect existing links");
        putWarnings.push("skills: could not save (code SKL_SAVE)");
      } else {
      const haveNames = (((haveRows ?? []) as unknown as { skills: { name: string } | { name: string }[] | null }[])
        .flatMap((s) => (Array.isArray(s.skills) ? s.skills : s.skills ? [s.skills] : []))
        .map((s) => s.name.toLowerCase())
        .filter(Boolean) as string[]).sort();
      const links = canon.flatMap((name) => {
        const sid = byName.get(name.toLowerCase());
        return sid ? [{ candidate_id: id, skill_id: sid, source: "self_reported" }] : [];
      });
      if (!(links.length > 0 && JSON.stringify(nextNames) === JSON.stringify(haveNames))) {
        materialChanged = true;
        await db.from("candidate_skills").delete().eq("candidate_id", id);
        if ((c.skills ?? []).length > 0) {
          if (links.length) {
            const { error } = await db.from("candidate_skills").upsert(links, { onConflict: "candidate_id,skill_id" });
            if (error) {
              console.error("[candidates] skills replace failed", redactPii(error.message));
              putWarnings.push("skills: could not save (code SKL_SAVE)");
              const prevLinks = haveNames.flatMap((name) => {
                const sid = byName.get(name);
                return sid ? [{ candidate_id: id, skill_id: sid, source: "self_reported" }] : [];
              });
              if (prevLinks.length) {
                try {
                  await db.from("candidate_skills").upsert(prevLinks, { onConflict: "candidate_id,skill_id" });
                } catch {
                }
              }
            }
          } else {
            putWarnings.push("skills: some skill names were skipped");
          }
        }
      }
    }
    } catch (e) {
      console.error("[candidates] skills replace threw", redactPii((e as Error).message));
      putWarnings.push("skills: could not save (code SKL_SAVE)");
    }
  }

  if (materialChanged) {
    try {
      await db.from("candidates").update({ updated_at: new Date().toISOString() }).eq("id", id);
    } catch {
    }
    try {
      await inngest.send({ name: "candidate.profile.submitted", data: { candidateId: id } });
    } catch (e) {
      console.error("[candidates] pipeline enqueue failed", redactPii((e as Error)?.message ?? String(e)).slice(0, 200));
    }
  }

  return Response.json({ candidateId: id, status: "processing", warnings: putWarnings });
}

export async function DELETE(request: Request) {
  const rl = rateLimit(request, { key: "candidates-delete", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const url = new URL(request.url);
  let body: unknown = null;
  {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.toLowerCase().includes("application/json")) {
      const read = await readJsonBody(request, JSON_LIMITS["candidates-delete"]);
      if (!read.ok) return read.response;
      body = read.body;
    }
  }
  const id = url.searchParams.get("id") ?? (body as { id?: unknown } | null)?.id ?? undefined;
  if (!uuid.safeParse(id).success) {
    return Response.json({ error: "provide ?id=<candidate uuid>" }, { status: 400 });
  }
  const denied = await guardOwnerAuth(request, id as string);
  if (denied) return denied;
  const db = supabaseAdmin();
  const { data: doomed } = await db
    .from("candidates")
    .select("resume_url, photo_url, portfolio_url")
    .eq("id", id as string)
    .maybeSingle();
  const { error } = await db.from("candidates").delete().eq("id", id as string);
  if (error) {
    console.error("[candidates] delete failed");
    return Response.json({ error: "candidate delete failed" }, { status: 500 });
  }
  try {
    const paths = doomed as { resume_url?: string | null; photo_url?: string | null; portfolio_url?: string | null } | null;
    const jobs: Promise<unknown>[] = [];
    if (paths?.resume_url && !/^https?:\/\//i.test(paths.resume_url)) {
      jobs.push(db.storage.from("resumes").remove([paths.resume_url]));
    }
    if (paths?.photo_url && !/^https?:\/\//i.test(paths.photo_url)) {
      jobs.push(db.storage.from("photos").remove([paths.photo_url]));
    }
    if (paths?.portfolio_url && !/^https?:\/\//i.test(paths.portfolio_url)) {
      jobs.push(db.storage.from("portfolios").remove([paths.portfolio_url]));
    }
    if (jobs.length) await Promise.all(jobs);
  } catch {
  }
  return Response.json({ ok: true });
}
