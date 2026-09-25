import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import SettingsClient from "./settings-client";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your session, sign out, and switch the color theme.",
};

export default function SettingsPage() {
  return (
    <PageShell>
      <h1 className="sr-only">Settings</h1>
      <section className="pt-12 lg:pt-16 pb-24">
        <div className="max-w-[1160px] mx-auto px-6">
          <SettingsClient />
        </div>
      </section>
    </PageShell>
  );
}
