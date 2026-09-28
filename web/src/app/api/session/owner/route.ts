import { clearSessionCookie, getViewerAuth, OWNER_COOKIE } from "@/lib/api-auth";
import { userDb } from "@/lib/supabase-user";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  const viewer = await getViewerAuth();
  if (viewer.kind === "owner") {
    return Response.json({ email: viewer.email, name: null });
  }
  return Response.json({ email: null, name: null });
}

export async function DELETE() {
  try {
    const db = await userDb();
    await db.auth.signOut();
  } catch {
  }
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie(OWNER_COOKIE));
  return res;
}

export async function PATCH(request: Request) {
  const rl = rateLimit(request, { key: "session-owner", limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  return Response.json(
    { error: "Use email code login at /api/auth/otp" },
    { status: 410 },
  );
}
