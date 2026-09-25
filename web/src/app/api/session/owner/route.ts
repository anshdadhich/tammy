import { cookies } from "next/headers";
import { z } from "zod";
import { verifyOwnerEmail } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().email().max(200),
});

function safeDecode(v: string): string | null {
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}

export async function GET() {
  const jar = await cookies();
  const raw = jar.get("tammy_owner")?.value;
  for (const candidate of raw ? [raw, safeDecode(raw)] : []) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as { email?: unknown; name?: unknown };
      if (parsed && typeof parsed.email === "string" && parsed.email.includes("@")) {
        return Response.json({
          email: parsed.email,
          name:
            typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : null,
        });
      }
    } catch {
    }
  }
  return Response.json({ email: null, name: null });
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `tammy_owner=; path=/; max-age=0; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}HttpOnly`,
  );
  return res;
}

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
