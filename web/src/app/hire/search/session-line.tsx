import Link from "next/link";
import type { Session } from "./search-ui";

export default function SessionLine({ session }: { session: Session }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 mb-5 text-[13px] text-muted">
      <span
        className="pulse-dot inline-block w-2 h-2 rounded-full"
        style={{ background: "var(--success)" }}
        aria-hidden="true"
      />
      <span className="font-mono text-[11.5px] uppercase tracking-[0.14em]">
        {session.name ? `${session.name} · ` : ""}
        {session.email}
      </span>
      <span aria-hidden="true">·</span>
      <Link
        href="/hire/login"
        className="text-muted underline hover:text-brand-text transition-colors"
      >
        Switch session
      </Link>
    </div>
  );
}
