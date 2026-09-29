"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { SESSION_EVENT } from "@/lib/session-client";

/**
 * Client half of /auth/confirm: converts implicit-flow links
 * (#access_token=...&refresh_token=...) that the server can never see.
 * Clears the fragment immediately, stores the session, ensures the users
 * row, then lands on `next`. Direct visits (no hash) go to login.
 */
export default function ConfirmHashClient({ next }: { next: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

    const err = params.get("error");
    if (err) {
      const desc = params.get("error_description") || err;
      router.replace(`/hire/login?error=${encodeURIComponent(desc)}`);
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      router.replace("/hire/login?error=invalid_link");
      return;
    }

    // Strip tokens from the URL before any network work.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessErr) throw sessErr;
        try {
          await fetch("/api/auth/link", { method: "POST" });
        } catch {
          // Non-fatal: session cookie is set; pages degrade until next login.
        }
        window.dispatchEvent(new Event(SESSION_EVENT));
        router.replace(next);
      } catch {
        setMessage("That link expired — taking you back to login…");
        router.replace("/hire/login?error=expired_link");
      }
    })();
  }, [router, next]);

  return (
    <main
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <p style={{ fontSize: 15 }}>{message}</p>
    </main>
  );
}
