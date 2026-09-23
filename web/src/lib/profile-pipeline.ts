import { inngest } from "@/lib/inngest";
import { supabaseAdmin } from "@/lib/supabase";
import { embedChunks } from "@/lib/matching/voyage";
import { profileReadyEmail, sendEmail } from "@/lib/email";
import { analyzeProjectDepth, generateCandidateSummary } from "@/lib/ai";

interface ProfileSubmittedData {
  candidateId: string;
}

// Background pipeline: normalize -> chunks -> embed -> active.
export const processProfile = inngest.createFunction(
  {
    id: "process-profile",
    triggers: [{ event: "candidate.profile.submitted" }],
  },
  async ({ event, step }: { event: { data: ProfileSubmittedData }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const candidateId = event.data.candidateId;
    const db = supabaseAdmin();

    const candidate = await step.run("fetch-candidate", async () => {
      const r = await db
        .from("candidates")
        .select("id, headline, domain, total_experience_years, visibility_status")
        .eq("id", candidateId)
        .single();
      return r.data as { id: string; headline: string | null; domain: string | null; total_experience_years: number | null; visibility_status?: string | null } | null;
    });
    if (!candidate) throw new Error("candidate not found");

    const bundle = await step.run("fetch-context", async () => {
      const [{ data: projects }, { data: experiences }, { data: skillRows }] = await Promise.all([
        db
          .from("projects")
          .select("id, title, description, tech_stack, impact_summary")
          .eq("candidate_id", candidateId),
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
          metadata_json: { domain: candidate.domain ?? null },
        },
        ...projects.map((p) => ({
          candidate_id: candidateId,
          chunk_type: "project",
          content_text: `Project: ${p.title}. ${p.description ?? ""} Tech: ${(p.tech_stack ?? []).join(", ")}. Impact: ${p.impact_summary ?? ""}`.trim().slice(0, 2000),
          metadata_json: { project_id: p.id, technologies: p.tech_stack ?? [] },
        })),
      ];
      // Skip empties (e.g. "0y") so Voyage isn't paid for blank vectors.
      return base.filter((c) => c.content_text.replace(/\W+/g, "").length > 10);
    });

    await step.run("summary-depth", async () => {
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
        await db.from("candidate_profiles").upsert({
          candidate_id: candidateId,
          summary_markdown: summary.markdown,
          summary_json: summary.json,
        }, { onConflict: "candidate_id" });
      }
      // Concurrent depth (max 4 at once) instead of sequential per-project calls.
      const queue = [...projects];
      const workers = Array.from({ length: Math.min(4, queue.length || 1) }, async () => {
        while (queue.length) {
          const p = queue.shift()!;
          const depth = await analyzeProjectDepth({
            title: p.title,
            description: p.description ?? "",
            tech: (p.tech_stack ?? []).join(", "),
            role: "",
            impact: p.impact_summary ?? "",
          });
          if (depth) {
            await db.from("project_depth_analysis").upsert({
              project_id: p.id,
              complexity_score: typeof depth.complexity_score === "number" ? depth.complexity_score : 5,
              technical_complexity: String(depth.technical_complexity ?? "medium"),
              architectural_concepts: (depth.architectural_concepts as string[]) ?? [],
              evidence_quality: String(depth.evidence_quality ?? "moderate"),
              autonomy_level: String(depth.autonomy_level ?? "unknown"),
              relevance_tags: (depth.relevance_tags as string[]) ?? [],
              raw_ai_analysis: depth,
            }, { onConflict: "project_id" });
          }
        }
      });
      await Promise.all(workers);
    });

    await step.run("embed-store", async () => {
      if (!chunks.length) return;
      // Diff: skip re-embed when texts are unchanged (PUT of unrelated fields
      // shouldn't burn Voyage tokens or create a search gap).
      const { data: existing } = await db
        .from("profile_chunks")
        .select("content_text")
        .eq("candidate_id", candidateId);
      const oldTexts = new Set(((existing ?? []) as { content_text: string }[]).map((r) => r.content_text));
      const same =
        (existing?.length ?? -1) === chunks.length &&
        chunks.every((c) => oldTexts.has(c.content_text));
      if (same) return;
      const texts: string[] = chunks.map((c: { content_text: string }) => c.content_text);
      const vectors = await embedChunks(texts);
      const rows = chunks.map((c: Record<string, unknown>, i: number) => ({
        ...c,
        embedding: `[${vectors[i].join(",")}]`,
        embedding_model: "voyage-4-lite",
        embedding_dim: vectors[i].length,
      }));
      // Insert-first then prune stale (no empty-search window on failure).
      const { error } = await db.from("profile_chunks").insert(rows);
      if (error) throw error;
      const freshTexts = new Set(texts);
      const stale = (existing ?? [])
        .map((r) => (r as { content_text: string }).content_text)
        .filter((t) => !freshTexts.has(t));
      if (stale.length) {
        await db.from("profile_chunks").delete().eq("candidate_id", candidateId).in("content_text", stale);
      }
      // Remove exact duplicates that predate the diff.
      if ((existing?.length ?? 0) + rows.length > chunks.length) {
        const { data: all } = await db
          .from("profile_chunks")
          .select("id, content_text")
          .eq("candidate_id", candidateId);
        const seen = new Set<string>();
        const dupIds: string[] = [];
        for (const r of ((all ?? []) as { id: string; content_text: string }[])) {
          if (seen.has(r.content_text)) dupIds.push(r.id);
          else seen.add(r.content_text);
        }
        if (dupIds.length) await db.from("profile_chunks").delete().in("id", dupIds);
      }
    });

    await step.run("quality-score", async () => {
      // Qwen: evidence-rich profiles outrank vague ones (0-100).
      let q = 20;
      if (projects.length) q += 15;
      if (projects.some((p) => p.tech_stack?.length)) q += 10;
      if (projects.some((p) => p.impact_summary)) q += 15;
      if (projects.some((p) => p.description && p.description.length > 100)) q += 10;
      if (experiences.length) q += 10;
      if (skills.length >= 3) q += 10;
      if (candidate.headline) q += 5;
      await db.from("candidates").update({ profile_strength: Math.min(q, 100), freshness_updated_at: new Date().toISOString() }).eq("id", candidateId);
    });

    await step.run("notify-ready", async () => {
      // Respect the candidate's own visibility (never force visible).
      // Best-effort "profile ready" email — never fails the pipeline.
      try {
        const { data } = await db
          .from("candidates")
          .select("full_name, contact_email")
          .eq("id", candidateId)
          .single();
        const c = data as { full_name?: string; contact_email?: string } | null;
        if (c?.contact_email) {
          const tpl = profileReadyEmail(c.full_name ?? "there", candidateId);
          await sendEmail(c.contact_email, tpl.subject, tpl.html);
        }
      } catch {
        // Email is best-effort only.
      }
    });

    return { candidateId, chunks: chunks.length };
  },
);

export const functions = [processProfile];
