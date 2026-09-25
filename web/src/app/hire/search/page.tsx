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
      <SearchClient initialSession={session} />
    </PageShell>
  );
}
