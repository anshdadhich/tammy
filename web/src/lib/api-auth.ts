import { supabaseAdmin } from "@/lib/supabase";

/**
 * Demo-phase API auth — cookie-based, server-verified.
 *
 * The cookie readers below are kept for API compatibility: identity used
 * to be mirrored into cookies (tammy_hr / tammy_owner) by the now-removed
 * login UI, so route handlers can verify ownership server-side from the
 * cookie alone. (The login pages that wrote these cookies were deleted;
 * only the landing page + API remain.)
 *
 * Trust model (demo):
 *  - tammy_hr   → employer session; can search, shortlist, contact, list.
 *  - tammy_owner → candidate session; can PUT/PATCH/DELETE only their own
 *                 candidate row (id must match the session's candidate id).
 *  - no cookie  → anonymous; GETs of public profiles are PII-stripped.
 *
 * When real Supabase Auth lands, swap the readers below for verified
 * JWT/session lookups — every call site already goes through this module.
 */

export type Viewer =
  | { kind: "hr"; name: string; email: string }
  | { kind: "owner"; id: string; email: string }
  | { kind: "anon" };

export function getViewer(req: Request): Viewer {
  try {
    const cookie = req.headers.get("cookie") ?? "";
    const jar = new Map<string, string>();
    for (const part of cookie.split(";")) {
      const i = part.indexOf("=");
      if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }

    const ownerRaw = jar.get("tammy_owner");
    if (ownerRaw) {
      try {
        const o = JSON.parse(decodeURIComponent(ownerRaw)) as {
          id?: unknown;
          email?: unknown;
        };
        if (typeof o.id === "string" && o.id && typeof o.email === "string") {
          return { kind: "owner", id: o.id, email: o.email.toLowerCase() };
        }
      } catch {
        /* fall through */
      }
    }

    const hrRaw = jar.get("tammy_hr");
    if (hrRaw) {
      try {
        const h = JSON.parse(decodeURIComponent(hrRaw)) as {
          name?: unknown;
          email?: unknown;
        };
        if (typeof h.email === "string" && h.email) {
          return {
            kind: "hr",
            name: typeof h.name === "string" ? h.name : "Employer",
            email: h.email.toLowerCase(),
          };
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

export function isHr(v: Viewer): boolean {
  return v.kind === "hr";
}

export function isOwnerOf(v: Viewer, candidateId: string): boolean {
  return v.kind === "owner" && v.id === candidateId;
}

export function requireHr(v: Viewer): Response | null {
  if (isHr(v)) return null;
  return Response.json(
    { error: "Employer session required." },
    { status: 401 },
  );
}

export function requireOwnerOf(
  v: Viewer,
  candidateId: string,
): Response | null {
  if (isOwnerOf(v, candidateId)) return null;
  return Response.json(
    { error: "You can only modify your own profile." },
    { status: 403 },
  );
}

/**
 * Full ownership guard for destructive writes (PUT/PATCH/DELETE):
 * owner session + id match + server-side email cross-check against
 * the candidates row (the cookie is client-mirrored, so verify it).
 * Returns a Response to send, or null when the write may proceed.
 */
export async function guardOwner(
  request: Request,
  candidateId: string,
): Promise<Response | null> {
  const viewer = getViewer(request);
  if (viewer.kind === "anon") {
    return Response.json({ error: "Sign in to manage this profile." }, { status: 401 });
  }
  if (!isOwnerOf(viewer, candidateId)) {
    return Response.json(
      { error: "You can only modify your own profile." },
      { status: 403 },
    );
  }
  const ok = await verifyOwnerEmail(candidateId, viewer.email);
  if (!ok) {
    return Response.json(
      { error: "Session no longer matches this profile. Log in again." },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Anonymous viewer: strip every contact channel the candidate has not
 * explicitly opted in (show_* === true). Opted-in channels stay visible —
 * the site's open-contact promise — but private activity records never
 * leave the server (handled in bundleForViewer).
 */
const CONTACT_CHANNELS = [
  ["show_email", "contact_email"],
  ["show_phone", "contact_phone"],
  ["show_linkedin", "linkedin_url"],
  ["show_github", "github_url"],
  ["show_resume", "resume_url"],
  ["show_portfolio", "portfolio_url"],
  ["show_photo", "photo_url"],
] as const;

export function stripCandidatePii<T extends Record<string, unknown>>(
  candidate: T | null | undefined,
): T | null {
  if (!candidate) return candidate ?? null;
  const out: Record<string, unknown> = { ...candidate };
  for (const [flag, column] of CONTACT_CHANNELS) {
    if (out[flag] !== true) {
      out[column] = null;
    }
  }
  return out as T;
}

/**
 * Full bundle for the owner or an HR viewer. Anonymous visitors get the
 * candidate row PII-stripped, and contact_log / matches / shortlists
 * replaced with empty arrays (they are private activity records).
 */
export function bundleForViewer(
  viewer: Viewer,
  candidate: Record<string, unknown> | null,
  bundle: {
    profile: unknown;
    contact_log: unknown[];
    matches: unknown[];
    shortlists: unknown[];
    projects: unknown[];
    oss: unknown[];
    experiences: unknown[];
    education: unknown[];
    skills: unknown[];
    depths: Record<string, Record<string, unknown>>;
  },
): Record<string, unknown> {
  const stripped = stripCandidatePii(candidate);
  const privileged = viewer.kind !== "anon";
  return {
    candidate: stripped,
    profile: bundle.profile ?? null,
    contact_log: privileged ? bundle.contact_log : [],
    matches: privileged ? bundle.matches : [],
    shortlists: privileged ? bundle.shortlists : [],
    projects: bundle.projects,
    oss: bundle.oss,
    experiences: bundle.experiences,
    education: bundle.education,
    skills: bundle.skills,
    depths: bundle.depths,
  };
}

/**
 * Server-side ownership verification against the DB. The tammy_owner
 * cookie is client-mirrored, so cross-check email against the candidate
 * row before destructive writes. Returns the candidate id when verified.
 */
export async function verifyOwnerEmail(
  candidateId: string,
  email: string,
): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("candidates")
    .select("contact_email")
    .eq("id", candidateId)
    .maybeSingle();
  const row = data as { contact_email?: string } | null;
  if (!row?.contact_email) return false;
  return row.contact_email.toLowerCase() === email.toLowerCase();
}

/**
 * HR verification against the employers table (opt-in strict mode).
 * Demo phase: the (now-deleted) /hire/login page minted sessions without a
 * DB row, so strict mode is off by default. Set STRICT_HR_VERIFY=1 to
 * require a verified employer row matching the session email (company_email
 * or linked users.email). Returns true when the HR session may proceed.
 */
export async function verifyHrEmail(email: string): Promise<boolean> {
  if (process.env.STRICT_HR_VERIFY !== "1") return true;
  try {
    const db = supabaseAdmin();
    const lower = email.toLowerCase();
    const { data } = await db
      .from("employers")
      .select("id")
      .eq("verification_status", "verified")
      .ilike("company_email", lower)
      .limit(1)
      .maybeSingle();
    return !!(data as { id: string } | null)?.id;
  } catch {
    return false;
  }
}

/** HR gate with optional strict DB verification. */
export async function requireVerifiedHr(viewer: Viewer): Promise<Response | null> {
  const denied = requireHr(viewer);
  if (denied) return denied;
  if (viewer.kind !== "hr") return denied;
  const ok = await verifyHrEmail(viewer.email);
  if (!ok) {
    return Response.json({ error: "Employer verification required." }, { status: 403 });
  }
  return null;
}
