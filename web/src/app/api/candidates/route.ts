import { z } from "zod";
import { inngest } from "@/lib/inngest";
import { supabaseAdmin } from "@/lib/supabase";
import { candidateSchema } from "@/lib/validators";

const uuid = z.string().uuid("Must be a valid UUID");

// GET /api/candidates?id=<candidate uuid>  OR  ?email=<contact email>
// Returns own profile: candidate row + generated summary + who viewed/contacted me.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? undefined;
  const email = url.searchParams.get("email")?.toLowerCase().trim() || undefined;
  if (!id && !email) {
    return Response.json({ error: "provide ?id= or ?email=" }, { status: 400 });
  }
  if (id && !uuid.safeParse(id).success) {
    return Response.json({ error: "id must be a valid UUID" }, { status: 400 });
  }
  const db = supabaseAdmin();

  let candidate: Record<string, unknown> | null = null;
  if (id) {
    const { data } = await db.from("candidates").select("*").eq("id", id).maybeSingle();
    candidate = (data as Record<string, unknown> | null) ?? null;
  } else {
    const { data } = await db
      .from("candidates")
      .select("*")
      .ilike("contact_email", email as string)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    candidate = (data as Record<string, unknown> | null) ?? null;
  }
  if (!candidate) return Response.json({ error: "candidate not found" }, { status: 404 });

  const cid = candidate.id as string;
  const [{ data: profile }, { data: views }, { data: matches }, { data: shortlisted }, { data: projects }, { data: experiences }, { data: education }, { data: skillRows }] = await Promise.all([
    db.from("candidate_profiles").select("summary_markdown, summary_json, updated_at").eq("candidate_id", cid).maybeSingle(),
    db.from("contact_log").select("id, channel, message, job_id, employer_id, created_at").eq("candidate_id", cid).order("created_at", { ascending: false }).limit(50),
    db.from("candidate_matches").select("id, search_id, job_id, score, status, created_at").eq("candidate_id", cid).order("created_at", { ascending: false }).limit(50),
    db.from("shortlists").select("id, job_id, status, notes, created_at").eq("candidate_id", cid).order("created_at", { ascending: false }).limit(50),
    db.from("projects").select("id, title, description, problem_statement, tech_stack, role_in_project, project_link, repo_link, deployment_link, impact_summary, project_type").eq("candidate_id", cid),
    db.from("work_experiences").select("company_name, job_title, start_date, end_date, is_current, description, achievements, tech_stack").eq("candidate_id", cid),
    db.from("education").select("institution, degree, field_of_study, start_year, end_year, achievements").eq("candidate_id", cid),
    db.from("candidate_skills").select("experience_years, proficiency_level, source, skills(name)").eq("candidate_id", cid),
  ]);

  // Open source contributions — isolated: empty array if the migration
  // (supabase/oss_contributions.sql) hasn't been run yet.
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

  // Per-project AI depth analysis (badges on the profile page).
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

  return Response.json({
    candidate,
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
}

// POST /api/candidates — validate, save raw, trigger background processing.
// Heavy AI (summary/depth/embed) runs in Inngest, not in this request.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = candidateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const db = supabaseAdmin();
  const c = parsed.data;
  const email = String(c.email ?? "").toLowerCase().trim();

  // Reuse existing user on retry (unique email), else create.
  let userId: string | null = null;
  const existing = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (existing.data) {
    userId = (existing.data as { id: string }).id;
  } else {
    const { data: user, error: userErr } = await db
      .from("users")
      .insert({ email, role: "candidate" })
      .select("id")
      .single();
    if (!user) {
      return Response.json({ error: "user create failed", detail: userErr?.message ?? null }, { status: 500 });
    }
    userId = (user as { id: string }).id;
  }

  const remoteMap: Record<string, string> = { remote: "remote_only", hybrid: "hybrid", onsite: "onsite" };
  const avail = /immedi/i.test(c.availability ?? "") ? "immediate" : /inactive/i.test(c.availability ?? "") ? "inactive" : "notice";
  const { data: cand, error: candErr } = await db
    .from("candidates")
    .insert({
      user_id: userId,
      full_name: c.name,
      headline: c.headline || `${c.role} — ${c.domain}`,
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
      visibility_status: c.visibility ?? "visible",
      consent_status: "granted",
      contact_email: email,
      contact_phone: c.phone || null,
      github_url: c.links?.github || null,
      linkedin_url: c.links?.linkedin || null,
      portfolio_url: c.links?.portfolio || null,
      resume_url: c.links?.resume_url || null,
      photo_url: c.photo_url || null,
    })
    .select("id")
    .single();
  if (!cand) return Response.json({ error: "candidate create failed", detail: candErr?.message ?? null }, { status: 500 });
  const candidateId = (cand as { id: string }).id;

  // Child rows: each section saves in isolation so one bad section can never
  // eat the others. Anything that fails lands in `warnings` for the UI.
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
        start_date: /^\d{4}-\d{2}/.test(x.start_date || "") ? `${x.start_date}-01` : null,
        end_date: /^\d{4}-\d{2}/.test(x.end_date || "") ? `${x.end_date}-01` : null,
        is_current: x.current ?? false,
        description: x.description || null,
        achievements: x.achievements || null,
        tech_stack: cleanTech(x.tech),
      })));
      if (error) warnings.push(`experience: ${error.message}`);
    }
  } catch (e) {
    warnings.push(`experience: ${(e as Error).message}`);
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
      if (error) warnings.push(`projects: ${error.message}`);
    }
  } catch (e) {
    warnings.push(`projects: ${(e as Error).message}`);
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
      if (error) warnings.push(`open source: ${error.message}`);
    }
  } catch (e) {
    warnings.push(`open source: ${(e as Error).message}`);
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
        };
      });
      if (rows.length) {
        const { error } = await db.from("education").insert(rows);
        if (error) warnings.push(`education: ${error.message}`);
      }
    }
  } catch (e) {
    warnings.push(`education: ${(e as Error).message}`);
  }
  try {
    if (c.skills?.length) {
      const { data: skillRows } = await db.from("skills").select("id, name").in("name", c.skills);
      const byName = new Map(((skillRows ?? []) as { id: string; name: string }[]).map((s) => [s.name.toLowerCase(), s.id]));
      const links = c.skills.flatMap((s) => {
        const id = byName.get(s.toLowerCase());
        return id ? [{ candidate_id: candidateId, skill_id: id, source: "self_reported" }] : [];
      });
      if (links.length) {
        const { error } = await db.from("candidate_skills").upsert(links, { onConflict: "candidate_id,skill_id" });
        if (error) warnings.push(`skills: ${error.message}`);
      } else if (c.skills?.length) {
        warnings.push("skills: none of those skill names are in our recognized list yet — they were skipped");
      }
    }
  } catch (e) {
    warnings.push(`skills: ${(e as Error).message}`);
  }

  try {
    await inngest.send({ name: "candidate.profile.submitted", data: { candidateId } });
  } catch {
    // Inngest dev server offline — profile stays saved, worker picks up later.
  }

  return Response.json({ candidateId, status: "processing", warnings }, { status: 202 });
}

// PATCH /api/candidates { id, visibility_status } — visibility toggle.
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = z
    .object({ id: uuid, visibility_status: z.enum(["visible", "hidden", "inactive"]) })
    .safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("candidates")
    .update({ visibility_status: parsed.data.visibility_status })
    .eq("id", parsed.data.id)
    .select("id, visibility_status")
    .single();
  if (!data) return Response.json({ error: "candidate not found", detail: error?.message ?? null }, { status: 404 });
  return Response.json({ candidate: data });
}

// PUT /api/candidates — full profile update (owner edit flow).
// Body: { id (uuid), ...any subset of candidateSchema fields }.
// Updates the candidates row for provided keys; when experiences / projects /
// education / skills arrays are present they replace existing child rows.
// Re-fires the background pipeline so search vectors refresh.
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const idParsed = z.object({ id: uuid }).safeParse(body);
  if (!idParsed.success) {
    return Response.json({ errors: idParsed.error.flatten() }, { status: 400 });
  }
  const id = idParsed.data.id;
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
    else if (role || domain) patch.headline = [role, domain].filter(Boolean).join(" — ");
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
  if (present.has("visibility")) patch.visibility_status = c.visibility ?? "visible";
  if (present.has("phone")) patch.contact_phone = c.phone || null;
  // Link/file columns: empty string means "no change" (forms can't round-trip
  // storage paths), so an edit never wipes an uploaded photo/resume/portfolio.
  if (present.has("photo_url") && c.photo_url) patch.photo_url = c.photo_url;
  if (present.has("links")) {
    patch.github_url = c.links?.github || null;
    patch.linkedin_url = c.links?.linkedin || null;
    if (c.links?.portfolio) patch.portfolio_url = c.links.portfolio;
    if (c.links?.resume_url) patch.resume_url = c.links.resume_url;
  }
  if (present.has("email") && c.email) {
    const email = String(c.email).toLowerCase().trim();
    if (email && email !== prev.contact_email) {
      let userId: string | null = null;
      const found = await db.from("users").select("id").eq("email", email).maybeSingle();
      if (found.data) {
        userId = (found.data as { id: string }).id;
      } else {
        const { data: user } = await db
          .from("users")
          .insert({ email, role: "candidate" })
          .select("id")
          .single();
        userId = (user as { id: string } | null)?.id ?? null;
      }
      patch.contact_email = email;
      if (userId) patch.user_id = userId;
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("candidates").update(patch).eq("id", id);
    if (error) return Response.json({ error: "candidate update failed", detail: error.message }, { status: 500 });
  }

  const putWarnings: string[] = [];
  const cleanTech = (t: unknown): string[] =>
    Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
  const cleanProjType = (t: unknown): string | null =>
    typeof t === "string" &&
    ["personal", "academic", "freelance", "production", "open_source", "prototype"].includes(t)
      ? t
      : null;
  if (present.has("experiences")) {
    try {
      await db.from("work_experiences").delete().eq("candidate_id", id);
      if (c.experiences?.length) {
        const { error } = await db.from("work_experiences").insert(c.experiences.map((x) => ({
          candidate_id: id,
          company_name: x.company,
          job_title: x.title,
          start_date: /^\d{4}-\d{2}/.test(x.start_date || "") ? `${x.start_date}-01` : null,
          end_date: /^\d{4}-\d{2}/.test(x.end_date || "") ? `${x.end_date}-01` : null,
          is_current: x.current ?? false,
          description: x.description || null,
          achievements: x.achievements || null,
          tech_stack: cleanTech(x.tech),
        })));
        if (error) putWarnings.push(`experience: ${error.message}`);
      }
    } catch (e) {
      putWarnings.push(`experience: ${(e as Error).message}`);
    }
  }
  if (present.has("projects")) {
    try {
      await db.from("projects").delete().eq("candidate_id", id);
      if (c.projects?.length) {
        const { error } = await db.from("projects").insert(c.projects.map((p) => ({
          candidate_id: id,
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
        if (error) putWarnings.push(`projects: ${error.message}`);
      }
    } catch (e) {
      putWarnings.push(`projects: ${(e as Error).message}`);
    }
  }
  if (present.has("oss")) {
    try {
      await db.from("open_source_contributions").delete().eq("candidate_id", id);
      if (c.oss?.length) {
        const rows = c.oss
          .filter((o) => o.repo_name?.trim())
          .map((o) => ({
            candidate_id: id,
            repo_name: o.repo_name.trim(),
            repo_url: o.repo_url || null,
            description: o.description || null,
            pr_links: (o.pr_links ?? []).filter((u) => u && u.trim()),
            tech_stack: cleanTech(o.tech),
            role: o.role || "Contributor",
          }));
        if (rows.length) {
          const { error } = await db.from("open_source_contributions").insert(rows);
          if (error) putWarnings.push(`open source: ${error.message}`);
        }
      }
    } catch (e) {
      putWarnings.push(`open source: ${(e as Error).message}`);
    }
  }
  if (present.has("education")) {
    try {
      await db.from("education").delete().eq("candidate_id", id);
      if (c.education?.length) {
        const rows = c.education.filter((e) => e.institution).map((e) => {
          const yrs = (e.years || "").match(/\d{4}/g) ?? [];
          return {
            candidate_id: id,
            institution: e.institution,
            degree: e.degree || null,
            field_of_study: e.field || null,
            start_year: yrs[0] ? Number(yrs[0]) : null,
            end_year: yrs[1] ? Number(yrs[1]) : null,
          };
        });
        if (rows.length) {
          const { error } = await db.from("education").insert(rows);
          if (error) putWarnings.push(`education: ${error.message}`);
        }
      }
    } catch (e) {
      putWarnings.push(`education: ${(e as Error).message}`);
    }
  }
  if (present.has("skills")) {
    try {
      await db.from("candidate_skills").delete().eq("candidate_id", id);
      if (c.skills?.length) {
        const { data: skillRows } = await db.from("skills").select("id, name").in("name", c.skills);
        const byName = new Map(((skillRows ?? []) as { id: string; name: string }[]).map((s) => [s.name.toLowerCase(), s.id]));
        const links = c.skills.flatMap((s) => {
          const sid = byName.get(s.toLowerCase());
          return sid ? [{ candidate_id: id, skill_id: sid, source: "self_reported" }] : [];
        });
        if (links.length) {
          const { error } = await db.from("candidate_skills").upsert(links, { onConflict: "candidate_id,skill_id" });
          if (error) putWarnings.push(`skills: ${error.message}`);
        } else {
          putWarnings.push("skills: none of those skill names are in our recognized list yet — they were skipped");
        }
      }
    } catch (e) {
      putWarnings.push(`skills: ${(e as Error).message}`);
    }
  }

  try {
    await inngest.send({ name: "candidate.profile.submitted", data: { candidateId: id } });
  } catch {
    // Offline worker picks up later.
  }

  return Response.json({ candidateId: id, status: "processing", warnings: putWarnings });
}

// DELETE /api/candidates?id=<candidate uuid> — delete own profile (cascades).
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => null);
  const id = url.searchParams.get("id") ?? body?.id ?? undefined;
  if (!uuid.safeParse(id).success) {
    return Response.json({ error: "provide ?id=<candidate uuid>" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { error } = await db.from("candidates").delete().eq("id", id as string);
  if (error) return Response.json({ error: "candidate delete failed", detail: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
