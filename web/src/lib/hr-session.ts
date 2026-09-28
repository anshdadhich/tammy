import { getSessionUser } from "@/lib/supabase-user";

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
