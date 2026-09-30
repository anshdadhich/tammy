import { cookies } from "next/headers";
import { getNavSession, getSessionUser } from "@/lib/supabase-user";
import type { ViewerSession } from "@/lib/session-client";

export type HrSession = { name?: string; email: string };

export async function readHrSession(): Promise<HrSession | null> {
  let session: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    session = await getSessionUser();
  } catch {
    return null;
  }
  if (!session || session.viewer.kind !== "hr") return null;
  return session.viewer.name
    ? { email: session.viewer.email, name: session.viewer.name }
    : { email: session.viewer.email };
}

/**
 * Server-side initial viewer for the navbar. The server already knows the
 * session from cookies on first render, so the nav can paint the avatar
 * immediately instead of flashing logged-out until client checks finish.
 * The client still revalidates in the background (AppNav) for freshness.
 */
export async function readNavViewer(): Promise<{ viewer: ViewerSession | null; confirmed: boolean }> {
  let nav: Awaited<ReturnType<typeof getNavSession>>;
  try {
    nav = await getNavSession();
  } catch {
    return { viewer: null, confirmed: false };
  }
  if (!nav) {
    let hasAuthCookie = false;
    try {
      const jar = await cookies();
      hasAuthCookie = jar.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    } catch {
      hasAuthCookie = false;
    }
    return { viewer: null, confirmed: !hasAuthCookie };
  }
  if (nav.role === "employer" || nav.role === "admin") {
    return {
      viewer: { kind: "hr", email: nav.email, isAdmin: nav.role === "admin" },
      confirmed: true,
    };
  }
  if (nav.role === "candidate") {
    return { viewer: { kind: "owner", email: nav.email }, confirmed: true };
  }
  return { viewer: null, confirmed: true };
}
