import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import JoinWizard from "./join-wizard";

export const metadata: Metadata = {
  title: "Build your page",
  description:
    "Seven steps — basics, profile, experience, projects, background, private, review. Drafts autosave, and you review everything before your profile enters employer searches.",
};

export default function JoinPage() {
  return (
    <PageShell>
      <h1 className="sr-only">Build your page</h1>
      <section className="pt-12 lg:pt-16 pb-24">
        <div className="max-w-[1160px] mx-auto px-6">
          <div
            className="rise max-w-4xl mx-auto"
            style={{ "--d": "60ms" } as React.CSSProperties}
          >
            <JoinWizard />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
