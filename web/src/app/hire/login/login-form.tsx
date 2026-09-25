"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Info } from "lucide-react";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE = "tammy_hr";
const MAX_AGE = 60 * 60 * 24 * 30;

type Session = { name?: string; email: string };

function writeHrCookie(session: Session) {
  const payload = encodeURIComponent(
    JSON.stringify({ name: session.name ?? "", email: session.email }),
  );
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${payload}; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`;
}

function clearHrCookie() {
  document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export default function LoginForm({
  initialSession,
  bare = false,
}: {
  initialSession: Session | null;
  bare?: boolean;
}) {
  const router = useRouter();
  const cardClass = bare
    ? ""
    : "rounded-2xl bg-surface shadow-soft-md p-7 sm:p-9";
  const [session, setSession] = useState<Session | null>(initialSession);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const signIn = (ev: React.FormEvent) => {
    ev.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_OK.test(trimmed)) {
      setErr("Enter a valid work email.");
      return;
    }
    setErr(null);
    const next: Session = { email: trimmed, name: name.trim() || undefined };
    writeHrCookie(next);
    setSession(next);
    router.push("/hire/search");
    router.refresh();
  };

  const signOut = () => {
    clearHrCookie();
    setSession(null);
    setEmail("");
    setName("");
  };

  if (session) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2.5">
          <span
            className="pulse-dot inline-block w-2 h-2 rounded-full"
            style={{ background: "var(--success)" }}
            aria-hidden="true"
          />
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Session open
          </p>
        </div>
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Signed in as {session.name || session.email}
        </h2>
        <p className="mt-2 text-[15px] leading-[1.6] text-body">
          {session.name ? session.email : "This device holds the employer session."}{" "}
          Search, shortlists, and contact channels are unlocked.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <Link href="/hire/search" className="btn btn-primary press">
            Start a search <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <button type="button" className="btn btn-secondary press" onClick={signOut}>
            Sign out
          </button>
        </div>
        <div className="notice mt-6">
          <Info aria-hidden="true" />
          <span>
            The session lives in a cookie on this device. Clearing browser data
            or pressing sign out ends it.
          </span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={signIn} className={cardClass}>
      <div className="grid gap-4">
        <div className="field">
          <label className="field-label" htmlFor="hr-name">
            Your name
          </label>
          <input
            id="hr-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
            maxLength={100}
          />
          <span className="field-hint">Optional — it only labels the session.</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="hr-email">
            Work email
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="hr-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErr(null);
            }}
            placeholder="you@company.com"
            aria-invalid={err ? true : undefined}
            required
          />
          {err ? (
            <span className="field-error" role="alert">
              {err}
            </span>
          ) : (
            <span className="field-hint">
              Used to open the session — no password in this build.
            </span>
          )}
        </div>
      </div>

      <button type="submit" className="btn btn-primary press mt-6 w-full sm:w-auto">
        Continue to search <ArrowRight size={16} aria-hidden="true" />
      </button>

      <div className="notice mt-6">
        <CircleAlert aria-hidden="true" />
        <span>
          This demo stores the session cookie on your device. No password, no
          email verification — treat it as a seat, not an account.
        </span>
      </div>

      <p className="field-hint mt-4">
        Hiring for the first time?{" "}
        <Link href="/hire" className="underline font-semibold text-body">
          See how the search works
        </Link>
        .
      </p>
    </form>
  );
}
