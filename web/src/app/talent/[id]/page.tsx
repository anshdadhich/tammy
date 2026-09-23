import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import AppNav from "@/components/AppNav";
import Portfolio from "@/components/Portfolio";
import { stripCandidatePii, verifyOwnerEmail } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import WarningsGate from "./warnings";
import OwnerSessionGuard from "./session-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Viewer =
  | { kind: "hr"; email: string }
  | { kind: "owner"; id: string; email: string }
  | { kind: "anon" };

async function viewerFromCookies(): Promise<Viewer> {
  try {
    const store = await cookies();
    const ownerRaw = store.get("tammy_owner")?.value ?? "";
    if (ownerRaw) {
      try {
        const o = JSON.parse(decodeURIComponent(ownerRaw)) as { id?: unknown; email?: unknown };
        if (typeof o.id === "string" && o.id && typeof o.email === "string" && o.email) {
          return { kind: "owner", id: o.id, email: o.email.toLowerCase() };
        }
      } catch {
        /* fall through */
      }
    }
    const hrRaw = store.get("tammy_hr")?.value ?? "";
    if (hrRaw) {
      try {
        const h = JSON.parse(decodeURIComponent(hrRaw)) as { email?: unknown };
        if (typeof h.email === "string" && h.email) {
          return { kind: "hr", email: h.email.toLowerCase() };
        }
      } catch {
        /* fall through */
      }
    }
  } catch {
    /* anonymous */
  }
  return { kind: "anon" };
}

function isHttp(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

// Mint a fresh signed URL for a storage path so the client renders files
// with zero extra waterfalls. Falls back to the raw path (client resolves).
async function resolveFile(
  db: ReturnType<typeof supabaseAdmin>,
  bucket: "photos" | "resumes" | "portfolios",
  value: unknown,
): Promise<string | null> {
  if (!value || isHttp(value) || typeof value !== "string") {
    return isHttp(value) ? (value as string) : null;
  }
  try {
    const { data } = await db.storage.from(bucket).createSignedUrl(value, 3600);
    return data?.signedUrl ?? value;
  } catch {
    return value;
  }
}

async function loadBundle(id: string) {
  const db = supabaseAdmin();
  const { data: candidate } = await db.from("candidates").select("*").eq("id", id).maybeSingle();
  if (!candidate) return null;
  const c = candidate as Record<string, unknown>;
  const viewer = await viewerFromCookies();
  if (String(c.visibility_status ?? "visible") === "hidden" && viewer.kind === "anon") {
    return null;
  }
  const isOwner =
    viewer.kind === "owner" && viewer.id === id && (await verifyOwnerEmail(id, viewer.email));
  const privileged = isOwner || viewer.kind === "hr";

  const [
    { data: profile },
    { data: views },
    { data: matches },
    { data: projects },
    { data: experiences },
    { data: education },
    { data: skillRows },
  ] = await Promise.all([
    db.from("candidate_profiles").select("summary_markdown, summary_json, updated_at").eq("candidate_id", id).maybeSingle(),
    privileged
      ? db.from("contact_log").select("id, channel, message, job_id, employer_id, created_at").eq("candidate_id", id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as unknown[] }),
    privileged
      ? db.from("candidate_matches").select("id, search_id, job_id, score, status, created_at").eq("candidate_id", id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as unknown[] }),
    db.from("projects").select("id, title, description, problem_statement, tech_stack, role_in_project, project_link, repo_link, deployment_link, impact_summary, project_type").eq("candidate_id", id),
    db.from("work_experiences").select("company_name, job_title, start_date, end_date, is_current, description, achievements, tech_stack").eq("candidate_id", id),
    db.from("education").select("institution, degree, field_of_study, start_year, end_year, achievements").eq("candidate_id", id),
    db.from("candidate_skills").select("experience_years, proficiency_level, source, skills(name)").eq("candidate_id", id),
  ]);

  let oss: Record<string, unknown>[] = [];
  try {
    const { data, error } = await db
      .from("open_source_contributions")
      .select("id, repo_name, repo_url, description, pr_links, tech_stack, role")
      .eq("candidate_id", id);
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

  const stripped = stripCandidatePii(c) as Record<string, unknown>;
  // Resolve private files server-side (zero client waterfalls).
  const [photo, resume, portfolioFile] = await Promise.all([
    resolveFile(db, "photos", stripped.photo_url),
    resolveFile(db, "resumes", stripped.resume_url),
    resolveFile(db, "portfolios", stripped.portfolio_url),
  ]);
  if (photo) stripped.photo_url = photo;
  if (resume) stripped.resume_url = resume;
  if (portfolioFile) stripped.portfolio_url = portfolioFile;

  return {
    bundle: {
      candidate: stripped,
      profile: (profile as { summary_markdown?: string | null } | null) ?? null,
      contact_log: (views ?? []) as Record<string, unknown>[],
      matches: (matches ?? []) as Record<string, unknown>[],
      shortlists: [],
      projects: (projects ?? []) as Record<string, unknown>[],
      oss,
      experiences: (experiences ?? []) as Record<string, unknown>[],
      education: (education ?? []) as Record<string, unknown>[],
      skills: (skillRows ?? []) as React.ComponentProps<typeof Portfolio>["bundle"]["skills"],
      depths,
    },
    isOwner,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Profile not found · Tammy" };
  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from("candidates")
      .select("full_name, headline, domain")
      .eq("id", id)
      .maybeSingle();
    const c = data as { full_name?: string; headline?: string; domain?: string } | null;
    if (!c) return { title: "Profile not found · Tammy" };
    const title = `${c.full_name ?? "Candidate"}${c.headline ? ` — ${c.headline}` : ""} · Tammy`;
    return {
      title,
      description: c.headline ?? `Candidate dossier${c.domain ? ` in ${c.domain}` : ""} on Tammy.`,
      alternates: { canonical: `/talent/${id}` },
      robots: { index: false, follow: true },
    };
  } catch {
    return { title: "Profile · Tammy" };
  }
}

export default async function PublicProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const loaded = await loadBundle(id);
  if (!loaded) notFound();
  return (
    <div className="public-profile-page">
      <AppNav />
      <OwnerSessionGuard wasOwner={loaded.isOwner} />
      <WarningsGate id={id} />
      <Portfolio
        bundle={loaded.bundle as unknown as React.ComponentProps<typeof Portfolio>["bundle"]}
        mode="public"
        editHref={`/talent/${id}/edit`}
        isOwner={loaded.isOwner}
      />
    </div>
  );
}
