"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DitherEffect from "@/components/DitherEffect";
import { setHrSession } from "@/lib/session";

export default function HireLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loginAs(h: { name: string; email: string }) {
    setHrSession(h);
    router.replace("/hire/search");
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const h = { name: name.trim(), email: email.trim() };
    if (!h.name || !h.email) {
      setError("Enter your name and work email to continue.");
      return;
    }
    loginAs(h);
  }

  return (
    <div className="hire-login-page">
      <div className="hire-login-bg" aria-hidden="true">
        <DitherEffect colorFront="#1F2DE6" colorBack="#ffffff" scale={0.8} className="dither-soft" />
      </div>
      <main className="hire-login-main">
        <div className="hire-login-card">
          <span className="panel-eyebrow">Employer access</span>
          <h1>Welcome back.</h1>
          <p className="hire-login-sub">Log in to search evidence-backed profiles.</p>
          <form onSubmit={join} noValidate>
            <div className="field">
              <label htmlFor="hire-login-name">Your name</label>
              <input
                id="hire-login-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Priya Sharma"
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label htmlFor="hire-login-email">Work email</label>
              <input
                id="hire-login-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="priya@company.com"
                autoComplete="email"
              />
            </div>
            {error ? <p className="err" role="alert">{error}</p> : null}
            <button className="btn-frame solid hire-login-go" type="submit">
              Start hiring →
            </button>
            <button
              className="btn-plain hire-login-test"
              type="button"
              onClick={() => loginAs({ name: "Test Recruiter", email: "test@tammy.sh" })}
            >
              Use test login →
            </button>
          </form>
          <p className="hire-login-note">No password needed · your identity travels with every message</p>
        </div>
      </main>
    </div>
  );
}
