import {
  clearSessionCookie,
  getViewerAuth,
  HR_COOKIE,
  HR_DISPLAY_COOKIE,
} from "@/lib/api-auth";
import { getSessionUser, userDb } from "@/lib/supabase-user";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

function clearDisplayCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${HR_DISPLAY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax;${secure}`;
}

export async function GET() {
  const viewer = await getViewerAuth();
  if (viewer.kind === "hr") {
    const session = await getSessionUser();
    return Response.json({
      email: viewer.email,
      name: viewer.name && viewer.name.trim() ? viewer.name : null,
      isAdmin: session?.userRow?.role === "admin",
    });
  }
  return Response.json({ email: null, name: null, isAdmin: false });
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "session-hr", limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  return Response.json(
    { error: "Use email code login at /api/auth/otp" },
    { status: 410 },
  );
}

export async function DELETE() {
  try {
    const db = await userDb();
    await db.auth.signOut();
  } catch {
  }
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie(HR_COOKIE));
  res.headers.append("Set-Cookie", clearDisplayCookie());
  return res;
}
