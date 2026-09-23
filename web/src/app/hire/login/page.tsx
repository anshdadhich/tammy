import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { readHrSession } from "@/lib/hr-session";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Employer login",
  description:
    "Open an employer session on this device — then search the pool, shortlist matches, and see contact channels.",
};

export default async function HireLoginPage() {
  const session = await readHrSession();

  return (
    <PageShell active="/hire">
      <section className="pt-20 lg:pt-28 pb-14">
        <div className="max-w-[1160px] mx-auto px-6">
          <h1
            className="rise text-[clamp(2.5rem,5.6vw,4.25rem)] font-semibold tracking-[-0.03em] leading-[1.05] text-ink max-w-[17ch]"
            style={{ "--d": "60ms" } as React.CSSProperties}
          >
            Open an employer session.
          </h1>
          <p
            className="rise mt-6 text-[17px] leading-[1.6] text-muted max-w-[560px]"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            Sessions are per-device in this build: the email you enter becomes a
            cookie, and search, shortlists, and contact channels read it. No
            password yet.
          </p>
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-[1160px] mx-auto px-6">
          <div
            className="rise max-w-xl mx-auto"
            style={{ "--d": "280ms" } as React.CSSProperties}
          >
            <LoginForm initialSession={session} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
