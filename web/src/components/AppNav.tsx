"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import {
  clearSession,
  getSessionSnapshot,
  subscribeSession,
  type SessionInfo,
} from "@/lib/session";

const LANDING_NAV = [
  { label: "Candidates", href: "/#candidates" },
  { label: "Employers", href: "/hire" },
  { label: "Match engine", href: "/#engine" },
  { label: "FAQ", href: "/#faq" },
] as const;

const HIRE_NAV = [
  { label: "Search", href: "/hire/search" },
  { label: "Dashboard", href: "/hire/dashboard" },
] as const;

const DASH_NAV = [
  { label: "Search", href: "/hire/search" },
  { label: "Dashboard", href: "/hire/dashboard" },
] as const;

const START_NAV = [
  { label: "Home", href: "/" },
  { label: "Build my page", href: "/join" },
] as const;

const LOGIN_NAV = [
  { label: "Home", href: "/" },
  { label: "Login", href: "/hire/login" },
] as const;

const DEFAULT_NAV = [
  { label: "Home", href: "/" },
  { label: "For Employers", href: "/hire" },
  { label: "FAQ", href: "/#faq" },
] as const;

const CANDIDATE_EXTRA = [
  { label: "FAQ", href: "/#faq" },
] as const;

type NavItem = { label: string; href: string };

const EMPTY_SESSION: SessionInfo = { kind: null, label: "" };

function navForPath(pathname: string | null): NavItem[] {
  if (pathname === "/") return [...LANDING_NAV];
  if (pathname === "/hire" || pathname === "/hire/search") return [...HIRE_NAV];
  if (pathname === "/hire/login") return [...LOGIN_NAV];
  if (pathname?.startsWith("/hire/dashboard")) return [...DASH_NAV];
  if (pathname?.startsWith("/join")) return [...START_NAV];
  if (pathname?.startsWith("/talent/")) return [...LANDING_NAV];
  return [...DEFAULT_NAV];
}

function hrefKey(href: string) {
  return href;
}

/** Role-aware items: candidates never see employer options and vice versa. */
function itemsForSession(pathname: string | null, session: SessionInfo): NavItem[] {
  if (session.kind === "owner") {
    const mine = session.ownerId ? `/talent/${session.ownerId}` : "/join";
    return [
      { label: "My page", href: mine },
      ...CANDIDATE_EXTRA.map((n) => ({ ...n })),
    ];
  }
  if (session.kind === "hr") {
    if (pathname === "/hire" || pathname === "/hire/search" || pathname?.startsWith("/hire/dashboard")) {
      return [...HIRE_NAV];
    }
    if (pathname === "/hire/login") return [...LOGIN_NAV];
    return [...LANDING_NAV];
  }
  return navForPath(pathname);
}

function initialsFor(label: string): string {
  const head = label.split("·")[0]?.trim() ?? "";
  if (head.includes("@")) return head.slice(0, 2).toUpperCase();
  const parts = head.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function AppNav({ rightContent }: { rightContent?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    () => EMPTY_SESSION,
  );
  const NAV_ITEMS = useMemo(() => itemsForSession(pathname, session), [pathname, session]);
  const [active, setActive] = useState<string>(NAV_ITEMS[0]?.href ?? "/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hideNav, setHideNav] = useState(false);
  // Theme toggle intentionally hidden for now: dark mode still applies via
  // the OS-preference pre-paint script in layout.tsx, users just can't
  // switch manually. Re-add a toggle button here to restore control.

  // Opaque blur bar once scrolled; hide on scroll down, reveal on scroll up.
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (y > 140 && y > lastY.current + 2) setHideNav(true);
      else if (y < lastY.current - 2) setHideNav(false);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keep the sliding pill in sync with route + hash (reset when nav set changes).
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash;
      if (hash && NAV_ITEMS.some((n) => n.href === `/${hash}`)) {
        setActive(`/${hash}`);
        return;
      }
      const exact = NAV_ITEMS.find((n) => n.href === pathname);
      if (exact) {
        setActive(exact.href);
        return;
      }
      if (pathname === "/hire/dashboard" || pathname === "/hire" || pathname === "/hire/search") {
        const dash = NAV_ITEMS.find((n) => n.href === "/hire/dashboard" || n.href === "/hire/search");
        if (dash) setActive(dash.href);
        return;
      }
      if (pathname === "/join") {
        const fb = NAV_ITEMS.find((n) => n.href === "/#candidates") ?? NAV_ITEMS[0];
        if (fb) setActive(fb.href);
        return;
      }
      setActive(NAV_ITEMS[0]?.href ?? "/");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname, NAV_ITEMS]);

  function handleLogout() {
    clearSession();
    setMobileOpen(false);
    setMenuOpen(false);
    // NOTE: no router.refresh() here — refresh() right after push() can
    // supersede the pending navigation and strand the user on this page.
    // Replace, not push: back button must not resurrect the gated page.
    if (pathname?.startsWith("/hire") || pathname?.startsWith("/talent/")) {
      router.replace("/");
    } else {
      router.push("/");
    }
  }

  function closeMenu() {
    setMenuOpen(false);
    setMobileOpen(false);
  }

  const loggedIn = session.kind !== null;
  // App pages paint the navbar edge-to-edge; only the landing keeps it
  // inside the centered content guides.
  const fullBleed = pathname !== "/";
  // The top-bar Dashboard shortcut only renders for employers, and only where
  // the center pill doesn't already link Dashboard.
  const showDashLink = session.kind === "hr" && loggedIn && !NAV_ITEMS.some((n) => n.label === "Dashboard");
  // Remount the sliding pill when the nav SET changes so it never morphs
  // across differently-shaped menus (that cross-set morph reads as a glitch).
  const setKey = NAV_ITEMS.map((n) => n.href).join("|");

  return (
    <motion.header
      className={`site-navbar-wrap${scrolled ? " is-scrolled" : ""}${fullBleed ? " full-bleed" : ""}`}
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: hideNav ? "-110%" : 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="site-navbar">
        <Link
          href="/"
          className="site-brand site-brand-text"
          onClick={() => {
            setActive(NAV_ITEMS[0]?.href ?? "/");
            setMobileOpen(false);
          }}
        >
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            Tammy
          </motion.span>
        </Link>

        {/* Center pill — options change per page, animated sliding indicator */}
        <nav aria-label="Main navigation" className="site-navigation hidden md:flex">
          <motion.div
            className="site-nav-links"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = active === hrefKey(item.href);
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setActive(item.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={`site-nav-link press${isActive ? " is-active" : ""}`}
                  style={{ position: "relative" }}
                >
                  {isActive ? (
                    <motion.span
                      key={setKey}
                      layoutId="site-nav-pill"
                      className="site-nav-pill"
                      initial={false}
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  ) : null}
                  <span style={{ position: "relative" }}>{item.label}</span>
                </Link>
              );
            })}
          </motion.div>
        </nav>

        <motion.div
          className="site-nav-actions"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          {/* Page-specific extras (e.g. Dashboard / Search) */}
          {rightContent ? <span className="site-nav-extra">{rightContent}</span> : null}
          {loggedIn ? (
            <>
              <div
                className="site-actor"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  className="site-avatar"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account"
                  title={session.label}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  {initialsFor(session.label)}
                </button>
                <AnimatePresence>
                  {menuOpen ? (
                    <motion.div
                      key="site-menu"
                      role="menu"
                      aria-label="Account"
                      className="site-menu"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                    >
                      {session.kind === "owner" ? (
                        <>
                          <Link role="menuitem" className="site-menu-link" href={session.ownerId ? `/talent/${session.ownerId}` : "/join"} onClick={closeMenu}>
                            My page
                          </Link>
                          <Link role="menuitem" className="site-menu-link" href={session.ownerId ? `/talent/${session.ownerId}/edit` : "/join"} onClick={closeMenu}>
                            Edit profile
                          </Link>
                        </>
                      ) : (
                        <Link role="menuitem" className="site-menu-link" href="/hire/dashboard" onClick={closeMenu}>
                          Dashboard
                        </Link>
                      )}
                      <button role="menuitem" type="button" className="site-menu-link site-menu-danger" onClick={handleLogout}>
                        Logout
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              {menuOpen ? (
                <button aria-hidden="true" tabIndex={-1} className="site-menu-veil" onClick={() => setMenuOpen(false)} />
              ) : null}
              {showDashLink ? (
                <Link
                  href="/hire/dashboard"
                  className="site-login site-nav-dashlink press"
                  onClick={() => setMobileOpen(false)}
                >
                  Dashboard
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <Link
                href="/join"
                className="site-login press"
                onClick={() => setMobileOpen(false)}
              >
                Signup
              </Link>
              <motion.span whileTap={{ scale: 0.96 }} className="inline-flex">
                <Link
                  href="/hire"
                  className="site-nav-cta site-nav-cta-dark press"
                  onClick={() => setMobileOpen(false)}
                >
                  Book a demo
                </Link>
              </motion.span>
            </>
          )}
          {/* Mobile toggle */}
          <button
            type="button"
            className="site-nav-burger md:hidden press"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </motion.div>
      </div>

      {/* Animated mobile menu — same options as desktop */}
      <AnimatePresence initial={false}>
        {mobileOpen ? (
          <motion.nav
            key="mobile-nav"
            aria-label="Mobile navigation"
            className="site-mobile-nav md:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="site-mobile-links">
              {NAV_ITEMS.map((item, i) => (
                <motion.div
                  key={item.href + item.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.05 + i * 0.05 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => {
                      setActive(item.href);
                      setMobileOpen(false);
                    }}
                    className={`site-mobile-link${active === item.href ? " is-active" : ""}`}
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.28 }}
                className="site-mobile-actions"
              >
                {loggedIn ? (
                  <>
                    <span className="site-mobile-user">{session.label}</span>
                    {session.kind === "owner" ? (
                      <Link
                        href={session.ownerId ? `/talent/${session.ownerId}/edit` : "/join"}
                        className="site-login press"
                        style={{ justifyContent: "center" }}
                        onClick={() => setMobileOpen(false)}
                      >
                        Edit profile
                      </Link>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Link
                      href="/join"
                      className="site-login press"
                      style={{ justifyContent: "center" }}
                      onClick={() => setMobileOpen(false)}
                    >
                      Signup
                    </Link>
                    <Link
                      href="/hire"
                      className="site-nav-cta site-nav-cta-dark press"
                      style={{ justifyContent: "center" }}
                      onClick={() => setMobileOpen(false)}
                    >
                      Book a demo
                    </Link>
                  </>
                )}
              </motion.div>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
