"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

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
    // /auth/confirm has its own hash consumer so it can honor the `next`
    // destination. Processing there twice races two setSession() calls.
    if (window.location.pathname === "/auth/confirm") return;
    const hash = window.location.hash;
    // Pure error hashes (#error=access_denied&error_code=otp_expired) carry
    // no access_token — they must still be surfaced, not swallowed.
    if (!hash || (!hash.includes("access_token") && !hash.includes("error="))) return;
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const err = params.get("error");
    const errDesc = params.get("error_description");

    // Remove both the secret fragment and stale auth error query immediately.
    // Some legacy provider links include error=invalid_link alongside a valid
    // implicit session; a successful session must clear that stale error.
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = "";
    cleanUrl.searchParams.delete("error");
    cleanUrl.searchParams.delete("error_description");
    cleanUrl.searchParams.delete("error_code");
    window.history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);

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
          const linkResponse = await fetch("/api/auth/link", { method: "POST" });
          if (!linkResponse.ok) {
            // The auth session remains valid even if app-profile linking needs
            // attention; server-rendered pages can still identify the session.
            console.warn(`[auth-hash] profile link failed status=${linkResponse.status}`);
          }
        } catch {
          // A network failure while creating the app row does not invalidate
          // the Supabase session that was just established.
        }
        router.refresh();
      } catch {
        router.push("/hire/login?error=expired_link");
      }
    })();
  }, [router]);

  return null;
}
