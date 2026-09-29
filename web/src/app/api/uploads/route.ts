import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, requireHrDb, requireOwnerDb } from "@/lib/supabase-user";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { redactPii } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL = 900;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,200}$/;

const KIND_BUCKET = {
  resume: "resumes",
  photo: "photos",
  portfolio: "portfolios",
} as const;
type Kind = keyof typeof KIND_BUCKET;

const SHOW_COLUMN_BY_BUCKET = {
  resumes: "show_resume",
  photos: "show_photo",
  portfolios: "show_portfolio",
} as const;

const KIND_EXT: Record<Kind, readonly string[]> = {
  resume: ["pdf"],
  photo: ["jpg", "jpeg", "png"],
  portfolio: ["pdf", "jpg", "jpeg", "png"],
};

const FIXED_CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const KIND_COLUMN = {
  resume: "resume_url",
  photo: "photo_url",
  portfolio: "portfolio_url",
} as const;

function err(message: string, status = 400, detail: unknown = null) {
  return Response.json({ error: message, detail }, { status });
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return clean || "file";
}

function hasActivePdfContent(bytes: Uint8Array): boolean {
  let text = "";
  try {
    text = Buffer.from(bytes).toString("latin1");
  } catch {
    return false;
  }
  const patterns = [
    "/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/EmbeddedFiles",
    "/AA", "/OpenAction", "/XFA", "/RichMedia", "/ObjStm",
  ];
  const lower = text.toLowerCase();
  if (lower.includes("<svg") || lower.includes("<script")) return true;
  for (const p of patterns) {
    if (text.includes(p)) return true;
  }
  return false;
}

function sniffFile(ext: string, bytes: Uint8Array): { ok: boolean; reason?: string } {
  if (bytes.length < 8) return { ok: false, reason: "file too small" };
  const head = bytes;
  const asciiStart = Buffer.from(bytes.slice(0, 512)).toString("latin1").toLowerCase();
  if (asciiStart.includes("<svg") || asciiStart.includes("<?xml")) {
    return { ok: false, reason: "SVG content is not allowed" };
  }
  if (ext === "pdf") {
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d;
    if (!isPdf) return { ok: false, reason: "file content does not match its extension" };
    if (hasActivePdfContent(bytes)) {
      return { ok: false, reason: "PDF contains active content and was rejected" };
    }
    return { ok: true };
  }
  if (ext === "png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < sig.length; i++) {
      if (head[i] !== sig[i]) return { ok: false, reason: "file content does not match its extension" };
    }
    return { ok: true };
  }
  if (ext === "jpg" || ext === "jpeg") {
    const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    if (!isJpg) return { ok: false, reason: "file content does not match its extension" };
    const tail = bytes.slice(bytes.length - 2);
    if (!(tail[0] === 0xff && tail[1] === 0xd9)) {
      return { ok: false, reason: "truncated image content" };
    }
    return { ok: true };
  }
  return { ok: false, reason: "unsupported extension" };
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "uploads-post", limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err("expected multipart/form-data", 400);
  }

  const session = await getSessionUser();
  const viewer = session?.viewer ?? { kind: "anon" };
  const kindRaw = form.get("kind");
  const candidateIdRaw = form.get("candidate_id");
  const file = form.get("file");

  const kind = typeof kindRaw === "string" ? kindRaw : "";
  if (kind !== "resume" && kind !== "photo" && kind !== "portfolio") {
    return err('kind must be "resume", "photo", or "portfolio"');
  }
  const candidateId =
    typeof candidateIdRaw === "string" ? candidateIdRaw.trim() : "";
  if (!UUID_RE.test(candidateId)) {
    return err("candidate_id must be a valid uuid");
  }
  if (viewer.kind === "anon") {
    return err("Sign in to upload files.", 401);
  }
  if (viewer.kind === "hr") {
    return err("Employers cannot upload profile files.", 403);
  }
  if (viewer.kind === "owner") {
    const gate = await requireOwnerDb(candidateId, session);
    if (gate instanceof Response) return err("You can only upload files to your own profile.", gate.status);
  }
  if (!(file instanceof File)) {
    return err("file is required");
  }
  if (file.size <= 0) return err("file is empty");
  if (file.size > MAX_BYTES) {
    return err(
      `file too large: ${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB`,
    );
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!KIND_EXT[kind].includes(ext)) {
    return err(`invalid extension for ${kind}: expected ${KIND_EXT[kind].join(" / ")}`);
  }
  let bytes: Uint8Array;
  try {
    const buf = await file.arrayBuffer();
    bytes = new Uint8Array(buf);
  } catch {
    return err("could not read file");
  }
  if (bytes.length > MAX_BYTES) {
    return err("file too large: exceeds 10MB");
  }
  if (bytes.length === 0) return err("file is empty");
  const sniffed = sniffFile(ext, bytes);
  if (!sniffed.ok) return err(sniffed.reason ?? "file content rejected");
  const safeContentType = FIXED_CONTENT_TYPE[ext] ?? "application/octet-stream";

  const bucket = KIND_BUCKET[kind];
  const path = `${candidateId}/${Date.now()}-${sanitizeFilename(file.name)}`;

  const db = supabaseAdmin();

  const { data: cand } = await db
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) return err("candidate not found", 404);

  const { error: upErr } = await db.storage
    .from(bucket)
    .upload(path, new Blob([bytes as unknown as BlobPart], { type: safeContentType }), { contentType: safeContentType, upsert: false });
  if (upErr) {
    const dup =
      /duplicate|already exists|resource already exists/i.test(upErr.message);
    console.error("[uploads] storage upload failed", redactPii(bucket));
    return err("upload failed", dup ? 409 : 500);
  }

  const downloadName = path.split("/").pop() ?? "download";
  const { data: signed, error: signErr } = await db.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL, { download: downloadName });
  if (signErr || !signed?.signedUrl) {
    console.error("[uploads] signing failed", redactPii(bucket));
    return err("uploaded but signing failed", 500);
  }

  try {
    await db
      .from("candidates")
      .update({ [KIND_COLUMN[kind]]: path })
      .eq("id", candidateId);
  } catch {
  }

  return Response.json(
    { bucket, path, signedUrl: signed.signedUrl, expiresIn: SIGNED_URL_TTL },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const rl = rateLimit(request, { key: "uploads-get", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket") ?? "";
  const path = url.searchParams.get("path") ?? "";

  if (
    bucket !== "resumes" &&
    bucket !== "photos" &&
    bucket !== "portfolios"
  ) {
    return err("bucket must be resumes, photos, or portfolios");
  }
  if (!PATH_RE.test(path) || path.includes("..")) {
    return err("path must be {candidate_uuid}/{filename}");
  }

  const session = await getSessionUser();
  const viewer = session?.viewer ?? { kind: "anon" };
  const folderId = path.split("/")[0] ?? "";
  if (viewer.kind === "anon") {
    return err("Sign in to view files.", 401);
  }
  if (viewer.kind === "owner") {
    const gate = await requireOwnerDb(folderId, session);
    if (gate instanceof Response) return err("You can only view your own files.", gate.status);
  }

  const db = supabaseAdmin();
  if (viewer.kind === "hr") {
    const hr = await requireHrDb(session);
    if (hr instanceof Response) return hr;
    const showColumn = SHOW_COLUMN_BY_BUCKET[bucket];
    const { data: cand, error: candidateError } = await db
      .from("candidates")
      .select(`visibility_status, ${showColumn}`)
      .eq("id", folderId)
      .maybeSingle();
    const candidate = cand as
      | { visibility_status?: string | null; [key: string]: unknown }
      | null;
    if (
      candidateError ||
      !candidate ||
      (candidate.visibility_status ?? "visible") !== "visible" ||
      candidate[showColumn] !== true
    ) {
      return err("candidate not found", 404);
    }
    try {
      const [{ data: sl }, { data: mt }, { data: cl }] = await Promise.all([
        db.from("shortlists").select("id").eq("candidate_id", folderId).eq("employer_id", hr.employerId).limit(1),
        db.from("candidate_matches").select("id, search_id").eq("candidate_id", folderId).limit(50),
        db.from("contact_log").select("id").eq("candidate_id", folderId).eq("employer_id", hr.employerId).limit(1),
      ]);
      const matchedSearchIds = ((mt ?? []) as { id: string; search_id: string }[]).map((m) => m.search_id).filter(Boolean);
      let matchedOwn = false;
      if (matchedSearchIds.length) {
        const { data: own } = await db.from("searches").select("id").in("id", matchedSearchIds).eq("employer_id", hr.employerId).limit(1);
        matchedOwn = Array.isArray(own) && own.length > 0;
      }
      const entitled =
        (Array.isArray(sl) && sl.length > 0) ||
        matchedOwn ||
        (Array.isArray(cl) && cl.length > 0);
      if (!entitled) {
        return err("no access to these files", 403);
      }
    } catch {
      return err("no access to these files", 403);
    }
  }
  const downloadName = path.split("/").pop() ?? "download";
  const { data: signed, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL, { download: downloadName });
  if (error || !signed?.signedUrl) {
    return err("sign failed (object may not exist)", 404);
  }
  try {
    await db.from("audit_logs").insert({
      action: "file_view",
      target_type: bucket,
      target_id: folderId,
      metadata: { path, bucket },
    });
  } catch {
  }
  return Response.json({
    bucket,
    path,
    signedUrl: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL,
  });
}
