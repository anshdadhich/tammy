import { supabaseBrowser } from "@/lib/supabase";

export type ViewerSession = { kind: "hr" | "owner"; name?: string; email: string; isAdmin?: boolean };

const HR_DISPLAY_COOKIE = "tammy_hr_display";

export const SESSION_EVENT = "tammy-session-changed";

function notifySessionChanged() {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function readDisplayCookie(): ViewerSession | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${HR_DISPLAY_COOKIE}=`));
  if (!entry) return null;
  try {
    const parsed = JSON.parse(
      decodeURIComponent(entry.slice(HR_DISPLAY_COOKIE.length + 1)),
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

function clearDisplayCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${HR_DISPLAY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

function metadataName(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const m = v as Record<string, unknown>;
  for (const k of ["full_name", "name", "display_name"]) {
    const s = m[k];
    if (typeof s === "string" && s.trim()) return s.trim().slice(0, 100);
  }
  return undefined;
}

export function readHrSession(): ViewerSession | null {
  return readDisplayCookie();
}

export async function fetchHrSession(): Promise<ViewerSession | null> {
  try {
    const res = await fetch("/api/session/hr");
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      email?: unknown;
      name?: unknown;
      isAdmin?: unknown;
    } | null;
    if (data && typeof data.email === "string" && data.email.includes("@")) {
      return {
        kind: "hr",
        name:
          typeof data.name === "string" && data.name.trim() ? data.name : undefined,
        email: data.email,
        isAdmin: data.isAdmin === true,
      };
    }
  } catch {
  }
  return null;
}

export async function fetchOwnerSession(): Promise<ViewerSession | null> {
  try {
    const { data } = await supabaseBrowser().auth.getUser();
    const email = data.user?.email;
    if (!email || !email.includes("@")) return null;
    return {
      kind: "owner",
      name: metadataName(data.user?.user_metadata),
      email,
    };
  } catch {
  }
  return null;
}

export function clearHrSession() {
  clearDisplayCookie();
  notifySessionChanged();
}

export async function clearOwnerSession() {
  try {
    await supabaseBrowser().auth.signOut();
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
