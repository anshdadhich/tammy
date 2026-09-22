"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
  { label: "New Search", href: "/hire" },
  { label: "Dashboard", href: "/hire/dash" },
  { label: "Match engine", href: "/#engine" },
] as const;

const DASH_NAV = [
  { label: "Search", href: "/hire" },
  { label: "Dashboard", href: "/hire/dash" },
] as const;

const START_NAV = [
  { label: "How it works", href: "/#engine" },
  { label: "FAQ", href: "/#faq" },
  { label: "For Employers", href: "/hire" },
] as const;

const DEFAULT_NAV = [
  { label: "Home", href: "/" },
  { label: "For Employers", href: "/hire" },
  { label: "FAQ", href: "/#faq" },
] as const;

type NavItem = { label: string; href: string };

const EMPTY_SESSION: SessionInfo = { kind: null, label: "" };

function navForPath(pathname: string | null): NavItem[] {
  if (pathname === "/") return [...LANDING_NAV];
  if (pathname === "/hire") return [...HIRE_NAV];
  if (pathname?.startsWith("/hire/dash")) return [...DASH_NAV];
  if (pathname?.startsWith("/start")) return [...START_NAV];
  return [...DEFAULT_NAV];
}

function hrefKey(href: string) {
  return href;
}

export default function AppNav({ rightContent }: { rightContent?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    () => EMPTY_SESSION,
  );
  const NAV_ITEMS = useMemo(() => navForPath(pathname), [pathname]);
  const [active, setActive] = useState<string>(NAV_ITEMS[0]?.href ?? "/");
  const [mobileOpen, setMobileOpen] = useState(false);

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
      if (pathname === "/hire/dash" || pathname === "/hire") {
        const dash = NAV_ITEMS.find((n) => n.href === "/hire/dash" || n.href === "/hire");
        if (dash) setActive(dash.href);
        return;
      }
      if (pathname === "/start") {
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
    router.push("/");
    router.refresh();
  }

  const loggedIn = session.kind !== null;

  return (
    <motion.header
      className="site-navbar-wrap"
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
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
                      layoutId="site-nav-pill"
                      className="site-nav-pill"
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
              <span className="site-user-pill" title={session.label}>
                {session.label}
              </span>
              <Link
                href="/hire/dash"
                className="site-login hidden lg:inline-flex"
                onClick={() => setMobileOpen(false)}
              >
                Dashboard
              </Link>
              <motion.button
                onClick={handleLogout}
                className="site-nav-cta site-nav-cta-dark press"
                aria-label="Logout"
                whileTap={{ scale: 0.96 }}
              >
                Logout
              </motion.button>
            </>
          ) : (
            <>
              <Link
                href="/start"
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
                    <button
                      onClick={handleLogout}
                      className="site-nav-cta site-nav-cta-dark press"
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/start"
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
