import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/supabase-user";
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
  let session: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    session = await getSessionUser();
  } catch {
    return { viewer: null, confirmed: false };
  }
  if (!session) {
    let hasAuthCookie = false;
    try {
      const jar = await cookies();
      hasAuthCookie = jar.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    } catch {
      hasAuthCookie = false;
    }
    return { viewer: null, confirmed: !hasAuthCookie };
  }
  if (session.viewer.kind === "hr") {
    return {
      viewer: {
        kind: "hr",
        name: session.viewer.name,
        email: session.viewer.email,
        isAdmin: session.userRow?.role === "admin",
      },
      confirmed: true,
    };
  }
  if (session.viewer.kind === "owner") {
    return { viewer: { kind: "owner", email: session.viewer.email }, confirmed: true };
  }
  if (session.email) {
    return { viewer: { kind: "owner", email: session.email }, confirmed: true };
  }
  return { viewer: null, confirmed: true };
}
