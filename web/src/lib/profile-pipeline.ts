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
        .select("id, headline, domain, total_experience_years")
        .eq("id", candidateId)
        .single();
      return r.data as { id: string; headline: string | null; domain: string | null; total_experience_years: number | null } | null;
    });
    if (!candidate) throw new Error("candidate not found");

    const projects = await step.run("fetch-projects", async () => {
      const r = await db
        .from("projects")
        .select("id, title, description, tech_stack, impact_summary")
        .eq("candidate_id", candidateId);
      return (r.data ?? []) as { id: string; title: string; description: string | null; tech_stack: string[] | null; impact_summary: string | null }[];
    });

    const chunks = await step.run("build-chunks", async () => {
      return [
        {
          candidate_id: candidateId,
          chunk_type: "summary",
          content_text: `${candidate.headline ?? ""} ${candidate.domain ?? ""} ${candidate.total_experience_years ?? ""}y`.trim(),
          metadata_json: { domain: candidate.domain ?? null },
        },
        ...projects.map((p) => ({
          candidate_id: candidateId,
          chunk_type: "project",
          content_text: `Project: ${p.title}. ${p.description ?? ""} Tech: ${(p.tech_stack ?? []).join(", ")}. Impact: ${p.impact_summary ?? ""}`.trim(),
          metadata_json: { project_id: p.id, technologies: p.tech_stack ?? [] },
        })),
      ];
    });

    await step.run("summary-depth", async () => {
      const summary = await generateCandidateSummary({
        role: candidate.headline ?? "",
        exp: String(candidate.total_experience_years ?? ""),
        domain: candidate.domain ?? "",
        skills: [],
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
      for (const p of projects) {
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

    await step.run("embed-store", async () => {
      const texts: string[] = chunks.map((c: { content_text: string }) => c.content_text);
      const vectors = await embedChunks(texts);
      const rows = chunks.map((c: Record<string, unknown>, i: number) => ({
        ...c,
        embedding: `[${vectors[i].join(",")}]`,
        embedding_model: "voyage-4-lite",
        embedding_dim: vectors[i].length,
      }));
      await db.from("profile_chunks").delete().eq("candidate_id", candidateId);
      const { error } = await db.from("profile_chunks").insert(rows);
      if (error) throw error;
    });

    await step.run("quality-score", async () => {
      // Qwen: evidence-rich profiles outrank vague ones (0-100).
      let q = 20;
      if (projects.length) q += 15;
      if (projects.some((p) => p.tech_stack?.length)) q += 10;
      if (projects.some((p) => p.impact_summary)) q += 15;
      if (projects.some((p) => p.description && p.description.length > 100)) q += 10;
      const { data: expRows } = await db.from("work_experiences").select("id").eq("candidate_id", candidateId).limit(1);
      if (expRows?.length) q += 10;
      const { data: skillRows } = await db.from("candidate_skills").select("skill_id").eq("candidate_id", candidateId).limit(5);
      if ((skillRows?.length ?? 0) >= 3) q += 10;
      if (candidate.headline) q += 5;
      await db.from("candidates").update({ profile_strength: Math.min(q, 100), freshness_updated_at: new Date().toISOString() }).eq("id", candidateId);
    });

    await step.run("mark-active", async () => {
      // Respect the candidate's own visibility (never force visible: Qwen review-before-exposure).
      // Best-effort "profile ready" email — never fails the pipeline.
      try {
        const { data } = await db
          .from("candidates")
          .select("full_name, contact_email")
          .eq("id", candidateId)
          .single();
        const c = data as { full_name?: string; contact_email?: string } | null;
        if (c?.contact_email) {
          const tpl = profileReadyEmail(c.full_name ?? "there");
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
