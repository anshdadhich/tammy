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
export async function readNavViewer(): Promise<ViewerSession | null> {
  let session: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    session = await getSessionUser();
  } catch {
    return null;
  }
  if (!session) return null;
  if (session.viewer.kind === "hr") {
    return {
      kind: "hr",
      name: session.viewer.name,
      email: session.viewer.email,
      isAdmin: session.userRow?.role === "admin",
    };
  }
  if (session.viewer.kind === "owner") {
    return { kind: "owner", email: session.viewer.email };
  }
  // Authenticated but profile-less (fresh OTP inbox, no candidate row and no
  // employer row): mirror the client's fetchOwnerSession fallback so the nav
  // still paints the avatar instead of flashing logged-out.
  if (session.email) {
    return { kind: "owner", email: session.email };
  }
  return null;
}
