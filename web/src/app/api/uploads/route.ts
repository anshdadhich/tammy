import { supabaseAdmin } from "@/lib/supabase";

// File uploads via service_role (bypasses RLS) + 1h signed URLs.
// Buckets are private; browsers never touch Storage directly.
//
// POST /api/uploads (multipart/form-data):
//   file: File (required) — pdf for resume; jpg/png for photo;
//                        pdf/jpg/png for portfolio. Max 10MB.
//   kind: "resume" | "photo" | "portfolio" (required)
//         -> bucket resumes | photos | portfolios,
//            candidates column resume_url | photo_url | portfolio_url
//   candidate_id: uuid (required) — storage path {candidate_id}/{file}
// Returns { bucket, path, signedUrl, expiresIn }.
// Also persists `path` onto the candidates row (best-effort).
//
// GET /api/uploads?bucket=<resumes|photos|portfolios>&path=<...>
// Returns a fresh 1h signed URL for an existing object.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL = 3600; // 1h
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Strict storage-path shape: {candidate_id}/{filename} (no nesting, no "..").
const PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,200}$/;

const KIND_BUCKET = {
  resume: "resumes",
  photo: "photos",
  portfolio: "portfolios",
} as const;
type Kind = keyof typeof KIND_BUCKET;

const KIND_MIME: Record<Kind, readonly string[]> = {
  resume: ["application/pdf"],
  photo: ["image/jpeg", "image/png", "image/jpg"],
  portfolio: ["application/pdf", "image/jpeg", "image/png", "image/jpg"],
};

const KIND_EXT: Record<Kind, readonly string[]> = {
  resume: ["pdf"],
  photo: ["jpg", "jpeg", "png"],
  portfolio: ["pdf", "jpg", "jpeg", "png"],
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

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err("expected multipart/form-data", 400);
  }

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
  if (!(file instanceof File)) {
    return err("file is required");
  }
  if (file.size <= 0) return err("file is empty");
  if (file.size > MAX_BYTES) {
    return err(
      `file too large: ${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB`,
    );
  }
  const mime = (file.type || "").toLowerCase();
  if (!KIND_MIME[kind].includes(mime)) {
    return err(
      `invalid type for ${kind}: got "${file.type || "unknown"}", expected ${KIND_MIME[kind].join(" / ")}`,
    );
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!KIND_EXT[kind].includes(ext)) {
    return err(`invalid extension for ${kind}: expected ${KIND_EXT[kind].join(" / ")}`);
  }

  const bucket = KIND_BUCKET[kind];
  const path = `${candidateId}/${Date.now()}-${sanitizeFilename(file.name)}`;

  const db = supabaseAdmin();

  // Refuse orphans: candidate row must exist.
  const { data: cand } = await db
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) return err("candidate not found", 404);

  const { error: upErr } = await db.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    const dup =
      /duplicate|already exists|resource already exists/i.test(upErr.message);
    return err("upload failed", dup ? 409 : 500, upErr.message);
  }

  const { data: signed, error: signErr } = await db.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !signed?.signedUrl) {
    return err("uploaded but signing failed", 500, signErr?.message ?? null);
  }

  // Persist storage path onto the candidate row (best-effort, never blocks).
  try {
    await db
      .from("candidates")
      .update({ [KIND_COLUMN[kind]]: path })
      .eq("id", candidateId);
  } catch {
    /* column write is a convenience; signed URL already returned */
  }

  return Response.json(
    { bucket, path, signedUrl: signed.signedUrl, expiresIn: SIGNED_URL_TTL },
    { status: 201 },
  );
}

export async function GET(request: Request) {
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

  const db = supabaseAdmin();
  const { data: signed, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !signed?.signedUrl) {
    return err("sign failed (object may not exist)", 404, error?.message ?? null);
  }
  return Response.json({
    bucket,
    path,
    signedUrl: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL,
  });
}
