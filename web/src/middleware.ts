import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Session gates, enforced BEFORE any page renders — so there is never a
 * mount-check-redirect flash on the client.
 *
 * Employers (tammy_hr cookie):
 *   /hire          → /hire/search
 *   /hire/login    → /hire/search (already in)
 *   /hire/search   → ok
 *   /hire/dashboard → ok
 *   /join          → /hire/search (build-my-page is not for employers)
 * Logged out:
 *   /hire          → /hire/login
 *   /hire/search|dashboard → /hire/login
 * Candidates (tammy_owner cookie):
 *   /              → /talent/<id> (stay on your page until you log out)
 *   /hire/*        → /talent/<id> (employer tools are not for candidates)
 */
function readOwnerId(req: NextRequest): string | null {
  try {
    const raw = req.cookies.get("tammy_owner")?.value ?? "";
    if (!raw) return null;
    const o = JSON.parse(decodeURIComponent(raw)) as { id?: unknown };
    return typeof o?.id === "string" && o.id ? o.id : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasHr = (req.cookies.get("tammy_hr")?.value ?? "").length > 0;
  const ownerId = readOwnerId(req);
  const login = new URL("/hire/login", req.url);
  const search = new URL("/hire/search", req.url);

  // Candidates stay on their page until logout.
  if (pathname === "/" && ownerId) {
    return NextResponse.redirect(new URL(`/talent/${ownerId}`, req.url));
  }

  // Employer tools are not for candidates.
  if (ownerId && pathname.startsWith("/hire")) {
    return NextResponse.redirect(new URL(`/talent/${ownerId}`, req.url));
  }

  // Build-my-page is not for employers.
  if (hasHr && (pathname === "/join" || pathname === "/start")) {
    return NextResponse.redirect(search);
  }

  // Employer tools live under /hire/* only — never gate / or /join here.
  if (pathname.startsWith("/hire")) {
    if (pathname === "/hire") {
      return NextResponse.redirect(hasHr ? search : login);
    }
    if (pathname === "/hire/login") {
      return hasHr ? NextResponse.redirect(search) : NextResponse.next();
    }
    if (!hasHr) {
      return NextResponse.redirect(login);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/start", "/join", "/hire/:path*"],
};
