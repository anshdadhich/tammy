import { cookies } from "next/headers";

export type HrSession = { name?: string; email: string };

/**
 * Server-side read of the client-minted `tammy_hr` cookie. Tries the raw
 * value first (document.cookie writes are already encoded once through
 * JSON.stringify), then a decode pass for cookies minted with encodeURIComponent.
 */
export async function readHrSession(): Promise<HrSession | null> {
  const jar = await cookies();
  const raw = jar.get("tammy_hr")?.value;
  if (!raw) return null;
  for (const candidate of [raw, safeDecode(raw)]) {
    if (!candidate) continue;
    try {
      const obj = JSON.parse(candidate) as { name?: unknown; email?: unknown };
      if (obj && typeof obj.email === "string" && obj.email.includes("@")) {
        return {
          email: obj.email,
          name: typeof obj.name === "string" && obj.name.trim() ? obj.name : undefined,
        };
      }
    } catch {
      /* try the next decoding */
    }
  }
  return null;
}

function safeDecode(v: string): string | null {
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}
