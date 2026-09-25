export type ViewerSession = { kind: "hr" | "owner"; name?: string; email: string };

const HR_COOKIE = "tammy_hr";

export const SESSION_EVENT = "tammy-session-changed";

function notifySessionChanged() {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function readHrSession(): ViewerSession | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${HR_COOKIE}=`));
  if (!entry) return null;
  try {
    const parsed = JSON.parse(
      decodeURIComponent(entry.slice(HR_COOKIE.length + 1)),
    ) as { name?: unknown; email?: unknown };
    if (parsed && typeof parsed.email === "string" && parsed.email.includes("@")) {
      return {
        kind: "hr",
        name:
          typeof parsed.name === "string" && parsed.name.trim()
            ? parsed.name
            : undefined,
        email: parsed.email,
      };
    }
  } catch {
  }
  return null;
}

export async function fetchOwnerSession(): Promise<ViewerSession | null> {
  try {
    const res = await fetch("/api/session/owner");
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      email?: unknown;
      name?: unknown;
    } | null;
    if (data && typeof data.email === "string" && data.email.includes("@")) {
      return {
        kind: "owner",
        name:
          typeof data.name === "string" && data.name.trim() ? data.name : undefined,
        email: data.email,
      };
    }
  } catch {
  }
  return null;
}

export function clearHrSession() {
  document.cookie = `${HR_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  notifySessionChanged();
}

export async function clearOwnerSession() {
  try {
    await fetch("/api/session/owner", { method: "DELETE" });
  } catch {
  }
  notifySessionChanged();
}

export function viewerInitials(viewer: ViewerSession): string {
  if (viewer.name) {
    const words = viewer.name.trim().split(/\s+/).filter(Boolean);
    const first = words[0]?.[0] ?? "";
    const second = words.length > 1 ? (words[1][0] ?? "") : (words[0]?.[1] ?? "");
    return (first + second).toUpperCase() || "?";
  }
  const local = viewer.email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}
