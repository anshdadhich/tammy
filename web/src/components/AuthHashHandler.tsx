"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { SESSION_EVENT } from "@/lib/session-client";

/**
 * Handles legacy implicit-flow magiclinks that land on "/" with
 * #access_token=...&refresh_token=...&type=magiclink.
 *
 * Hash fragments never reach the server, so without this the user sits on the
 * home page logged out. We exchange the hash into a browser session (which
 * createBrowserClient persists to cookies), ensure the users row server-side,
 * clear the hash, and refresh server components.
 */
export default function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;
    // Avoid double-processing (StrictMode / re-mounts).
    if (sessionStorage.getItem("tammy_auth_hash_seen") === hash) return;
    sessionStorage.setItem("tammy_auth_hash_seen", hash);

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const err = params.get("error");
    const errDesc = params.get("error_description");

    // Strip tokens from the URL immediately so they don't linger in history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    (async () => {
      try {
        if (err) {
          router.push(`/hire/login?error=${encodeURIComponent(errDesc || err)}`);
          return;
        }
        if (!accessToken || !refreshToken) return;
        const supabase = supabaseBrowser();
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessErr) throw sessErr;
        // Ensure public.users row (mirrors OTP verify linking).
        try {
          await fetch("/api/auth/link", { method: "POST" });
        } catch {
          // Non-fatal: session cookie is set; pages degrade to anon until next login.
        }
        window.dispatchEvent(new Event(SESSION_EVENT));
        router.refresh();
      } catch {
        router.push("/hire/login?error=expired_link");
      }
    })();
  }, [router]);

  return null;
}
