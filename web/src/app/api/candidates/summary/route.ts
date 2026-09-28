import { z } from "zod";
import { inngest } from "@/lib/inngest";
import { supabaseAdmin } from "@/lib/supabase";
import { guardOwnerAuth } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/http";

const uuid = z.string().uuid("Must be a valid UUID");

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "candidates-summary", limit: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const read = await readJsonBody(request, 4 * 1024);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = z.object({ id: uuid }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const denied = await guardOwnerAuth(request, parsed.data.id);
  if (denied) return denied;
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("candidates")
    .select("id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!existing) return Response.json({ error: "candidate not found" }, { status: 404 });
  try {
    await inngest.send({ name: "candidate.profile.submitted", data: { candidateId: parsed.data.id } });
  } catch {
    return Response.json({ error: "Could not start regeneration. Try again." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
