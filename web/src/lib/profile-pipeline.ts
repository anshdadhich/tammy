import { createHash } from "node:crypto";
import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest";
import { supabaseAdmin } from "@/lib/supabase";
import { embedChunks } from "@/lib/matching/voyage";
import { profileReadyEmail, sendEmail } from "@/lib/email";
import { analyzeProjectDepth, generateCandidateSummary } from "@/lib/ai";
import { startWideEvent } from "@/lib/observe";
import { withTimeout } from "@/lib/timeout";

interface ProfileSubmittedData {
  candidateId: string;
}

const EMBEDDING_MODEL = "voyage-4-lite";
const EXPECTED_EMBEDDING_DIM = 1024;
const MAX_PROJECTS = 8;
const EMAIL_TIMEOUT_MS = 15000;

function contentHash(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export const processProfile = inngest.createFunction(
  {
    id: "process-profile",
    triggers: [{ event: "candidate.profile.submitted" }],
    concurrency: { limit: 1, key: "event.data.candidateId" },
    retries: 2,
  },
  async ({ event, step }: { event: { data: ProfileSubmittedData }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const candidateId = event.data.candidateId;
    if (!candidateId || typeof candidateId !== "string") {
      throw new NonRetriableError("invalid candidateId");
    }
    const db = supabaseAdmin();

    const candidate = await step.run("fetch-candidate", async () => {
      const r = await db
        .from("candidates")
        .select("id, headline, domain, total_experience_years, visibility_status")
        .eq("id", candidateId)
        .single();
      return r.data as { id: string; headline: string | null; domain: string | null; total_experience_years: number | null; visibility_status?: string | null } | null;
    });
    if (!candidate) throw new NonRetriableError("candidate not found");
    if (candidate.visibility_status && candidate.visibility_status !== "visible") {
      return { ok: true, skipped: true as const, reason: "not visible" };
    }

    const bundle = await step.run("fetch-context", async () => {
      const [{ data: projects }, { data: experiences }, { data: skillRows }] = await Promise.all([
        db
          .from("projects")
          .select("id, title, description, tech_stack, impact_summary")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })
          .limit(MAX_PROJECTS),
        db
          .from("work_experiences")
          .select("company_name, job_title, description")
          .eq("candidate_id", candidateId)
          .limit(10),
        db
          .from("candidate_skills")
          .select("skills(name)")
          .eq("candidate_id", candidateId)
          .limit(50),
      ]);
      const skills = ((skillRows ?? []) as unknown as { skills: { name: string } | { name: string }[] | null }[])
        .flatMap((s) => (Array.isArray(s.skills) ? s.skills : s.skills ? [s.skills] : []))
        .map((s) => s.name)
        .filter(Boolean);
      return {
        projects: ((projects ?? []) as { id: string; title: string; description: string | null; tech_stack: string[] | null; impact_summary: string | null }[]),
        experiences: ((experiences ?? []) as { company_name: string | null; job_title: string | null; description: string | null }[]),
        skills,
      };
    });
    const { projects, experiences, skills } = bundle;

    const chunks = await step.run("build-chunks", async () => {
      const expText = experiences
        .slice(0, 5)
        .map((e) => `${e.job_title ?? ""} @ ${e.company_name ?? ""}`)
        .filter((s) => s.trim().length > 3)
        .join("; ");
      const base = [
        {
          candidate_id: candidateId,
          chunk_type: "summary",
          content_text: `${candidate.headline ?? ""} ${candidate.domain ?? ""} ${candidate.total_experience_years ?? ""}y Skills: ${skills.slice(0, 20).join(", ")}${expText ? ` Experience: ${expText}` : ""}`.trim().slice(0, 2000),
          metadata_json: {
            domain: candidate.domain ?? null,
            domain_tags: candidate.domain ? [candidate.domain] : [],
            technologies: skills.slice(0, 20),
          },
        },
        ...projects.map((p) => ({
          candidate_id: candidateId,
          chunk_type: "project",
          content_text: `Project: ${p.title}. ${p.description ?? ""} Tech: ${(p.tech_stack ?? []).join(", ")}. Impact: ${p.impact_summary ?? ""}`.trim().slice(0, 2000),
          metadata_json: { project_id: p.id, technologies: p.tech_stack ?? [] },
        })),
      ];
      return base.filter((c) => c.content_text.replace(/\W+/g, "").length > 10);
    });

    await step.run("summary", async () => {
      const summary = await generateCandidateSummary({
        role: candidate.headline ?? "",
        exp: String(candidate.total_experience_years ?? ""),
        domain: candidate.domain ?? "",
        skills,
        headline: candidate.headline ?? "",
        projects: projects.map((p) => ({
          title: p.title,
          description: p.description ?? "",
          tech: (p.tech_stack ?? []).join(", "),
          impact: p.impact_summary ?? "",
        })),
      });
      if (summary) {
        const { error: sumErr } = await db.from("candidate_profiles").upsert({
          candidate_id: candidateId,
          summary_markdown: summary.markdown,
          summary_json: summary.json,
        }, { onConflict: "candidate_id" });
        if (sumErr) throw sumErr;
      }
      return { ok: !!summary };
    });

    for (const p of projects) {
      await step.run(`project-depth-${p.id}`, async () => {
        const depth = await analyzeProjectDepth({
          title: p.title,
          description: p.description ?? "",
          tech: (p.tech_stack ?? []).join(", "),
          role: "",
          impact: p.impact_summary ?? "",
        });
        if (!depth) return { ok: false, skipped: true as const };
        const { error: depthErr } = await db.from("project_depth_analysis").upsert({
          project_id: p.id,
          complexity_score: typeof depth.complexity_score === "number" ? depth.complexity_score : 5,
          technical_complexity: String(depth.technical_complexity ?? "medium"),
          architectural_concepts: (depth.architectural_concepts as string[]) ?? [],
          evidence_quality: String(depth.evidence_quality ?? "moderate"),
          autonomy_level: String(depth.autonomy_level ?? "unknown"),
          relevance_tags: (depth.relevance_tags as string[]) ?? [],
          raw_ai_analysis: depth,
        }, { onConflict: "project_id" });
        if (depthErr) throw depthErr;
        return { ok: true };
      });
    }

    await step.run("embed-store", async () => {
      const wev = startWideEvent("inngest/process-profile", "run");
      try {
        if (!chunks.length) {
          wev.add({ candidate_id: candidateId, embed_failed: false, degraded: false });
          wev.end({ status: 200 });
          return { embedded: 0 };
        }
        const { data: existing } = await db
          .from("profile_chunks")
          .select("content_text, embedding_dim")
          .eq("candidate_id", candidateId);
        const oldHashes = new Set<string>();
        for (const r of ((existing ?? []) as { content_text: string; embedding_dim: number | null }[])) {
          if ((r.embedding_dim ?? EXPECTED_EMBEDDING_DIM) === EXPECTED_EMBEDDING_DIM) {
            oldHashes.add(contentHash(r.content_text));
          }
        }
        const changed = chunks.filter((c) => !oldHashes.has(contentHash(c.content_text)));
        const fresh = new Set(chunks.map((c) => c.content_text));
        const stale = ((existing ?? []) as { content_text: string }[])
          .map((r) => r.content_text)
          .filter((t) => !fresh.has(t));
        if (!changed.length && !stale.length) {
          wev.add({ candidate_id: candidateId, embed_failed: false, degraded: false });
          wev.end({ status: 200 });
          return { embedded: 0 };
        }
        let embedded = 0;
        if (changed.length) {
          const texts: string[] = changed.map((c: { content_text: string }) => c.content_text);
          const vectors = await embedChunks(texts);
          if (vectors.length !== texts.length) {
            throw new NonRetriableError(`embedding count ${vectors.length} for ${texts.length} inputs`);
          }
          for (const v of vectors) {
            if (!v.length || v.length !== EXPECTED_EMBEDDING_DIM) {
              throw new NonRetriableError(`embedding dim ${v.length}, expected ${EXPECTED_EMBEDDING_DIM}`);
            }
          }
          const rows = changed.map((c: Record<string, unknown>, i: number) => ({
            ...c,
            embedding: `[${vectors[i].join(",")}]`,
            embedding_model: EMBEDDING_MODEL,
            embedding_dim: vectors[i].length,
          }));
          const { error } = await db.from("profile_chunks").insert(rows);
          if (error) throw error;
          embedded = rows.length;
        }
        if (stale.length) {
          const { error: delError } = await db
            .from("profile_chunks")
            .delete()
            .eq("candidate_id", candidateId)
            .in("content_text", stale);
          if (delError) throw delError;
        }
        wev.add({ candidate_id: candidateId, embed_failed: false, degraded: false });
        wev.end({ status: 200 });
        return { embedded };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        wev.add({ candidate_id: candidateId, embed_failed: true, degraded: true });
        wev.end({ status: 500, error: msg.slice(0, 200) });
        throw e;
      }
    });

    await step.run("quality-score", async () => {
      let q = 20;
      if (projects.length) q += 15;
      if (projects.some((p) => p.tech_stack?.length)) q += 10;
      if (projects.some((p) => p.impact_summary)) q += 15;
      if (projects.some((p) => p.description && p.description.length > 100)) q += 10;
      if (experiences.length) q += 10;
      if (skills.length >= 3) q += 10;
      if (candidate.headline) q += 5;
      const { error: qErr } = await db.from("candidates").update({ profile_strength: Math.min(q, 100), freshness_updated_at: new Date().toISOString() }).eq("id", candidateId);
      if (qErr) throw qErr;
    });

    const notified = await step.run("notify-ready", async () => {
      const wev = startWideEvent("inngest/process-profile", "run");
      let outcome = "skipped";
      let reason = "no recipient";
      try {
        const { data } = await db
          .from("candidates")
          .select("full_name, contact_email")
          .eq("id", candidateId)
          .single();
        const c = data as { full_name?: string; contact_email?: string } | null;
        if (c?.contact_email) {
          const tpl = profileReadyEmail(c.full_name ?? "there", candidateId);
          const result = await withTimeout(sendEmail(c.contact_email, tpl.subject, tpl.html), EMAIL_TIMEOUT_MS);
          outcome = result.skipped ? "skipped" : "sent";
          reason = result.skipped ? result.reason : (result.id ?? "ok");
        }
      } catch (e) {
        outcome = "failed";
        reason = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      }
      wev.add({ candidate_id: candidateId, email_outcome: outcome, email_reason: reason, degraded: outcome === "failed" });
      wev.end({ status: outcome === "failed" ? 500 : 200 });
      return { outcome, reason };
    });

    return { candidateId, chunks: chunks.length, emailed: notified.outcome };
  },
);

export const functions = [processProfile];
