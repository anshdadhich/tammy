import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { readHrSession } from "@/lib/hr-session";
import SearchClient from "./search-client";

export const metadata: Metadata = {
  title: "Search talent",
  description:
    "Describe the target role in plain English — requirements are parsed automatically and matched against verified candidates.",
};

export default async function HireSearchPage() {
  const session = await readHrSession();

  return (
    <PageShell active="/hire">
      <section className="pt-16 lg:pt-24 pb-8">
        <div className="max-w-[860px] mx-auto px-6 text-center">
          <h1
            className="rise text-[clamp(2rem,4.6vw,3.25rem)] font-semibold tracking-[-0.03em] leading-[1.06] text-ink"
            style={{ "--d": "60ms" } as React.CSSProperties}
          >
            Who do you need?
          </h1>
          <p
            className="rise mt-4 text-[17px] leading-[1.6] text-muted max-w-[560px] mx-auto"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            Describe your target role in plain English. Requirements get parsed
            automatically and matched against verified candidates.
          </p>
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-[860px] mx-auto px-6">
          <div
            className="rise"
            style={{ "--d": "280ms" } as React.CSSProperties}
          >
            <SearchClient initialSession={session} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
