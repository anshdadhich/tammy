"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  getSessionSnapshot,
  subscribeSession,
} from "@/lib/session";

// Restores the old client page's guard: if the OWNER logs out (any tab)
// while viewing their dossier, leave — no stale owner dashboard or edit
// affordances for a signed-out visitor. Public/HR viewers are untouched:
// only an initial owner who transitions to signed-out is redirected.
export default function OwnerSessionGuard({ wasOwner }: { wasOwner: boolean }) {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    () => ({ kind: null, label: "" }),
  );
  const prevKind = useRef<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!wasOwner || done.current) return;
    const prev = prevKind.current;
    prevKind.current = session.kind;
    // Only an actual transition (was signed in, now isn't) redirects —
    // never the initial mount (prev === null on first run).
    if (prev !== null && session.kind === null) {
      done.current = true;
      router.replace("/");
    }
  }, [session.kind, router, wasOwner]);

  return null;
}
