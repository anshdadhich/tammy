import { z } from "zod";
import { verifyOwnerEmail } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// PATCH /api/session/owner { id, email } — re-mirror the candidate session
// after an email change. Verifies the new email actually owns the candidate
// row server-side before writing the cookie; otherwise it would be a
// session-forgery endpoint.
const bodySchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().email().max(200),
});

export async function PATCH(request: Request) {
  const rl = rateLimit(request, { key: "session-owner", limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const { id, email } = parsed.data;
  const ok = await verifyOwnerEmail(id, email);
  if (!ok) {
    return Response.json(
      { error: "That email does not own this profile." },
      { status: 403 },
    );
  }
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `tammy_owner=${encodeURIComponent(JSON.stringify({ id, email: email.toLowerCase() }))}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}HttpOnly`,
  );
  return res;
}
