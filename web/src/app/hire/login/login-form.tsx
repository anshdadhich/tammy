"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Info, Loader2 } from "lucide-react";
import { SESSION_EVENT, clearHrSession, clearOwnerSession } from "@/lib/session-client";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 320;

type Session = { name?: string; email: string };

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
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "company">("email");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [coBusy, setCoBusy] = useState(false);
  const [coErr, setCoErr] = useState<string | null>(null);
  const [coDone, setCoDone] = useState(false);

  const sendCode = async (target: string): Promise<boolean> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      await res.json().catch(() => null);
      if (!res.ok) {
        setErr("Could not send the code. Try again.");
        return false;
      }
      setInfo("Check your inbox for the sign-in code.");
      return true;
    } catch {
      setErr("Could not send the code. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const requestCode = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length > MAX_EMAIL_LEN || !EMAIL_OK.test(trimmed)) {
      setErr("Enter a valid work email.");
      return;
    }
    setEmail(trimmed);
    const ok = await sendCode(trimmed);
    if (ok) setStage("code");
  };

  const verifyCode = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const token = code.trim().replace(/\s+/g, "");
    if (token.length < 6) {
      setErr("Enter the code from your email.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), token }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: unknown;
        email?: unknown;
        error?: unknown;
      } | null;
      if (!res.ok || !data || typeof data.email !== "string") {
        setErr(
          typeof data?.error === "string" && data.error
            ? data.error
            : "That code did not work. Try again.",
        );
        return;
      }
      const next: Session = {
        email: data.email,
        name: name.trim() ? name.trim() : undefined,
      };
      const hr = await fetch("/api/session/hr").then((r) => r.json().catch(() => null)) as {
        email?: unknown;
      } | null;
      if (typeof hr?.email === "string" && hr.email.includes("@")) {
        setSession(next);
        setInfo(null);
        setCode("");
        window.dispatchEvent(new Event(SESSION_EVENT));
        router.push("/hire/search");
        router.refresh();
        return;
      }
      setSession(next);
      setCode("");
      setErr(null);
      setInfo(null);
      setStage("company");
      window.dispatchEvent(new Event(SESSION_EVENT));
      router.refresh();
    } catch {
      setErr("Could not verify the code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    clearHrSession();
    void clearOwnerSession();
    setSession(null);
    setCode("");
    setStage("email");
    setErr(null);
    setInfo(null);
    setCompany("");
    setWebsite("");
    setLinkedin("");
    setCoErr(null);
    setCoDone(false);
    router.refresh();
  };

  const registerCompany = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const trimmed = company.trim();
    if (trimmed.length < 2 || coBusy) return;
    setCoBusy(true);
    setCoErr(null);
    try {
      const res = await fetch("/api/employers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_name: trimmed.slice(0, 200),
          website: website.trim().slice(0, 500),
          linkedin_url: linkedin.trim().slice(0, 500),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        employerId?: unknown;
        status?: unknown;
        error?: unknown;
      } | null;
      if (!res.ok) {
        setCoErr(
          typeof data?.error === "string" && data.error
            ? data.error
            : "Could not register the company. Try again.",
        );
        return;
      }
      setCoDone(true);
      window.dispatchEvent(new Event(SESSION_EVENT));
      router.refresh();
    } catch {
      setCoErr("Network error — try again.");
    } finally {
      setCoBusy(false);
    }
  };

  if (session && stage === "company" && !coDone) {
    return (
      <form onSubmit={(ev) => void registerCompany(ev)} className={cardClass}>
        <div className="grid gap-4">
          <div className="field">
            <label className="field-label" htmlFor="hr-company">
              Company name
              <span className="req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="hr-company"
              className="input"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setCoErr(null);
              }}
              placeholder="Acme Inc"
              maxLength={200}
              aria-invalid={coErr ? true : undefined}
              required
            />
            {coErr ? (
              <span className="field-error" role="alert">
                {coErr}
              </span>
            ) : (
              <span className="field-hint">
                No company on file for {session.email} yet. Register it for verification.
              </span>
            )}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="hr-website">
              Company website
              <span className="req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="hr-website"
              className="input"
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
                setCoErr(null);
              }}
              placeholder="https://acme.com"
              inputMode="url"
              maxLength={500}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="hr-linkedin">
              Your LinkedIn URL
              <span className="req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="hr-linkedin"
              className="input"
              value={linkedin}
              onChange={(e) => {
                setLinkedin(e.target.value);
                setCoErr(null);
              }}
              placeholder="https://linkedin.com/in/you"
              inputMode="url"
              maxLength={500}
              required
            />
            <span className="field-hint">
              Used to confirm you work at this company.
            </span>
          </div>
        </div>
        <button
          type="submit"
          className="btn btn-primary press mt-6 w-full sm:w-auto"
          disabled={coBusy}
        >
          {coBusy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : null}
          Register company <ArrowRight size={16} aria-hidden="true" />
        </button>
      </form>
    );
  }

  if (session && coDone) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2.5">
          <span
            className="pulse-dot inline-block w-2 h-2 rounded-full"
            style={{ background: "var(--warn)" }}
            aria-hidden="true"
          />
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Verification pending
          </p>
        </div>
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Company submitted
        </h2>
        <p className="mt-2 text-[15px] leading-[1.6] text-body">
          An admin will verify {company.trim() || "your company"} shortly. Search unlocks
          once verification completes.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button
            type="button"
            className="btn btn-secondary press"
            onClick={() => signOut()}
            disabled={busy}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

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
          <button
            type="button"
            className="btn btn-secondary press"
            onClick={() => signOut()}
            disabled={busy}
          >
            Sign out
          </button>
        </div>
        <div className="notice mt-6">
          <Info aria-hidden="true" />
          <span>
            The session lives in a signed-in browser tab on this device. Use
            sign out to end it.
          </span>
        </div>
      </div>
    );
  }

  if (stage === "code") {
    return (
      <form onSubmit={(ev) => void verifyCode(ev)} className={cardClass}>
        <div className="grid gap-4">
          <div className="field">
            <label className="field-label" htmlFor="hr-code">
              Sign-in code
              <span className="req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="hr-code"
              className="input"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setErr(null);
              }}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={64}
              aria-invalid={err ? true : undefined}
              required
            />
            {err ? (
              <span className="field-error" role="alert">
                {err}
              </span>
            ) : (
              <span className="field-hint">
                {info ?? `Sent to ${email}. It expires in a few minutes.`}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button
            type="submit"
            className="btn btn-primary press"
            disabled={busy}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : null}
            Verify and continue <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-secondary press"
            disabled={busy}
            onClick={() => void sendCode(email.trim().toLowerCase())}
          >
            Resend code
          </button>
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={() => {
              setStage("email");
              setCode("");
              setErr(null);
              setInfo(null);
            }}
          >
            Use a different email
          </button>
        </div>

        <div className="notice mt-6">
          <CircleAlert aria-hidden="true" />
          <span>
            Only verified employer inboxes can open a session. Codes are
            single-use and expire quickly.
          </span>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(ev) => void requestCode(ev)} className={cardClass}>
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
              We email you a one-time code — no password in this build.
            </span>
          )}
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary press mt-6 w-full sm:w-auto"
        disabled={busy}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : null}
        Email me a code <ArrowRight size={16} aria-hidden="true" />
      </button>

      <div className="notice mt-6">
        <CircleAlert aria-hidden="true" />
        <span>
          Signing in proves control of the inbox. Only verified employer
          inboxes unlock search, shortlists, and contact channels.
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
