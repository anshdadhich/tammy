"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

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

    // Strip tokens and any stale provider error from the URL before network
    // work. Old redirect configurations can include both a hash session and
    // error=invalid_link even though the hash session itself is valid.
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = "";
    cleanUrl.searchParams.delete("error");
    cleanUrl.searchParams.delete("error_description");
    cleanUrl.searchParams.delete("error_code");
    window.history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);

    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessErr) throw sessErr;
        try {
          const response = await fetch("/api/auth/link", { method: "POST" });
          if (!response.ok) {
            console.warn(`[auth-confirm] profile link failed status=${response.status}`);
          }
        } catch {
          // A profile-link request failure does not invalidate the session.
        }
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
