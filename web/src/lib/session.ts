"use client";

export type SessionKind = "hr" | "owner" | null;

export type SessionInfo = {
  kind: SessionKind;
  label: string;
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
    return { kind: "owner", label: `${owner.email} · Candidate` };
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

export function subscribeSession(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("storage", handler);
  window.addEventListener(SESSION_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SESSION_EVENT, handler);
  };
}

function emitSessionChange() {
  try {
    window.dispatchEvent(new Event(SESSION_EVENT));
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
  emitSessionChange();
}

export function clearSession() {
  try {
    localStorage.removeItem("tammy_hr");
    localStorage.removeItem("tammy_owner");
    localStorage.removeItem("tammy_draft");
    sessionStorage.removeItem("tammy_last_search");
    sessionStorage.removeItem("tammy_warnings");
    sessionStorage.removeItem("tammy_rerun");
    sessionStorage.removeItem("tammy_open");
  } catch {
    /* ignore */
  }
  emitSessionChange();
}
