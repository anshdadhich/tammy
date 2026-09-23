import Link from "next/link";
import type { Metadata } from "next";
import PageShell from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Nothing here",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <PageShell>
      <section className="pt-24 lg:pt-32 pb-24">
        <div className="max-w-[1160px] mx-auto px-6">
          <span
            className="rise inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-muted bg-inset border border-line rounded-full px-3 py-1.5"
            style={{ "--d": "60ms" } as React.CSSProperties}
          >
            404
          </span>
          <h1
            className="rise mt-6 text-[clamp(2.5rem,5.6vw,4.25rem)] font-semibold tracking-[-0.03em] leading-[1.05] text-ink"
            style={{ "--d": "60ms" } as React.CSSProperties}
          >
            Nothing filed here.
          </h1>
          <p
            className="rise text-[17px] leading-[1.6] text-muted max-w-[560px] mt-5"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            That page doesn&apos;t exist — or the profile it points to is
            private. The record you&apos;re after might just be off the grid.
          </p>
          <div
            className="rise flex flex-wrap items-center gap-3 mt-8"
            style={{ "--d": "280ms" } as React.CSSProperties}
          >
            <Link href="/" className="btn btn-primary press">
              Back home
            </Link>
            <Link href="/join" className="btn btn-secondary press">
              Build my page
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
