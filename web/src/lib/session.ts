"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

export type SessionKind = "hr" | "owner" | null;

export type SessionInfo = {
  kind: SessionKind;
  label: string;
  /** Candidate id when kind === "owner" (for profile links). */
  ownerId?: string;
};

type StoredSession = { name?: string; email?: string; id?: string } | null;

function readJSON(key: string): StoredSession {
  try {
    const v = localStorage.getItem(key);
    if (!v) return null;
    const parsed: unknown = JSON.parse(v);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

/** Single-session: HR and owner are mutually exclusive. */
export function getSession(): SessionInfo {
  const hr = readJSON("tammy_hr");
  const owner = readJSON("tammy_owner");
  if (hr?.name && hr?.email) {
    return { kind: "hr", label: `${hr.name} · Employer` };
  }
  if (owner?.id && owner?.email) {
    return { kind: "owner", label: `${owner.email} · Candidate`, ownerId: owner.id };
  }
  // legacy owner shape without id? treat email-only as session too
  if (owner?.email) {
    return { kind: "owner", label: `${owner.email} · Candidate` };
  }
  return { kind: null, label: "" };
}

const SESSION_EVENT = "tammy-session";

let snapshotCache: SessionInfo = { kind: null, label: "" };
let snapshotRaw: string | null = null;
let snapshotInit = false;

function readRaw(): string {
  try {
    return `${localStorage.getItem("tammy_hr") ?? ""}|${localStorage.getItem("tammy_owner") ?? ""}`;
  } catch {
    return "";
  }
}

/** Cached snapshot so useSyncExternalStore gets a stable reference. */
export function getSessionSnapshot(): SessionInfo {
  const raw = readRaw();
  if (!snapshotInit || raw !== snapshotRaw) {
    snapshotInit = true;
    snapshotRaw = raw;
    snapshotCache = getSession();
  }
  return snapshotCache;
}

/**
 * Raw localStorage identity, re-read live — pages that keep their own
 * {name,email} state (dash, search) can subscribe with useSyncExternalStore
 * and never go stale after logout/login.
 */
export function getRawSession(): { name: string; email: string; id?: string } | null {
  const hr = readJSON("tammy_hr");
  if (hr?.name && hr?.email) return { name: hr.name, email: hr.email };
  return null;
}

/** Stable string key for getRawSession() results (null-safe). */
export function serializeRawSession(s: { name: string; email: string } | null): string {
  return s ? `${s.name}\u0000${s.email}` : "null";
}

export function subscribeSession(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("storage", handler);
  window.addEventListener(SESSION_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SESSION_EVENT, handler);
  };
}

/* Mirror the session into cookies so Next.js middleware can gate /hire/*
   server-side — no more mount-then-redirect flashes on the client.
   NOTE: these are UI-gating cookies only; API authorization re-verifies
   against the DB (verifyOwnerEmail / requireVerifiedHr). */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function writeSessionCookie(key: "tammy_hr" | "tammy_owner", value: string | null) {
  try {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${key}=${value === null ? "" : encodeURIComponent(value)}; path=/; ` +
      `max-age=${value === null ? 0 : COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

export function setHrSession(hr: { name: string; email: string }) {
  try {
    localStorage.setItem("tammy_hr", JSON.stringify(hr));
    // single account: logging in as employer clears candidate session
    localStorage.removeItem("tammy_owner");
  } catch {
    /* ignore */
  }
  writeSessionCookie("tammy_hr", JSON.stringify(hr));
  writeSessionCookie("tammy_owner", null);
  emitSessionChange();
}

export function setOwnerSession(owner: { id: string; email: string }) {
  try {
    localStorage.setItem("tammy_owner", JSON.stringify(owner));
    // single account: signing up as candidate clears employer session
    localStorage.removeItem("tammy_hr");
  } catch {
    /* ignore */
  }
  writeSessionCookie("tammy_owner", JSON.stringify(owner));
  writeSessionCookie("tammy_hr", null);
  emitSessionChange();
}

/**
 * Client-side route guard: redirects live when the session no longer
 * satisfies the page's requirement. Catches logout in ANOTHER tab (storage
 * event), which middleware and the navbar's own logout can't see.
 *   require: "hr" | "owner" | "any" | null — null disables the guard.
 * Never redirects while the session is still valid.
 */
export function useSessionGuard(require: "hr" | "owner" | "any" | null) {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    () => EMPTY_SESSION_INFO,
  );
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (require === null || redirectedRef.current) return;
    const ok =
      require === "any"
        ? session.kind !== null
        : session.kind === require;
    if (!ok) {
      redirectedRef.current = true;
      const login =
        require === "hr"
          ? "/hire/login"
          : require === "owner"
            ? "/join"
            : "/";
      // replace(): back button must not resurrect the gated page.
      router.replace(login);
    }
  }, [require, session.kind, router]);

  return session;
}

/**
 * Redirect to `to` only when a session ENDS while the page is open
 * (owner/hr → anon). Initial anonymous mounts are left alone, so pages
 * that are legitimately public (shared candidate dossiers) stay viewable
 * signed out — but logging out while viewing bounces you off.
 */
export function useLogoutRedirect(to: string = "/"): SessionInfo {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    () => EMPTY_SESSION_INFO,
  );
  const prevKind = useRef<SessionKind | undefined>(undefined);

  useEffect(() => {
    const prev = prevKind.current;
    prevKind.current = session.kind;
    // Only an actual transition (was signed in, now isn't) redirects —
    // never the initial anonymous mount of a public page.
    if (prev && prev !== null && session.kind === null) {
      // replace(): back button must not resurrect the signed-in view.
      router.replace(to);
    }
  }, [session.kind, router, to]);

  return session;
}

const EMPTY_SESSION_INFO: SessionInfo = { kind: null, label: "" };

function emitSessionChange() {
  try {
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem("tammy_hr");
    localStorage.removeItem("tammy_owner");
    localStorage.removeItem("tammy_draft");
    localStorage.removeItem("tammy_searches");
    sessionStorage.removeItem("tammy_warnings");
  } catch {
    /* ignore */
  }
  writeSessionCookie("tammy_hr", null);
  writeSessionCookie("tammy_owner", null);
  emitSessionChange();
}
