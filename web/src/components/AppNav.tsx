"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { toggleTheme } from "@/lib/theme";
import {
  SESSION_EVENT,
  clearHrSession,
  clearOwnerSession,
  fetchHrSession,
  fetchOwnerSession,
  readHrSession,
  viewerInitials,
  type ViewerSession,
} from "@/lib/session-client";

const LANDING_NAV = [
  { label: "Candidates", href: "/#candidates" },
  { label: "Employers", href: "/hire" },
  { label: "Match engine", href: "/#engine" },
  { label: "FAQ", href: "/#faq" },
] as const;

const JOIN_NAV = [
  { label: "Home", href: "/" },
  { label: "Build my page", href: "/join" },
] as const;

const HIRE_NAV = [
  { label: "Home", href: "/" },
  { label: "Hiring", href: "/hire" },
] as const;

const SIGNUP_OPTIONS = [
  { label: "Get hired", href: "/join" },
  { label: "Hiring someone", href: "/hire/login" },
] as const;

type NavItem = { label: string; href: string };

export default function AppNav({ active: activeProp }: { active?: string } = {}) {
  const pathname = usePathname();
  const isJoin = pathname.startsWith("/join");
  const isHire = pathname.startsWith("/hire");
  const items: readonly NavItem[] = isJoin ? JOIN_NAV : isHire ? HIRE_NAV : LANDING_NAV;
  const sectionActive = isJoin ? "/join" : isHire ? "/hire" : null;
  const showAuth = !isJoin;

  const [landingActive, setLandingActive] = useState<string>(
    activeProp ?? LANDING_NAV[0]?.href ?? "/",
  );
  const active = sectionActive ?? landingActive;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerSession | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hideNav, setHideNav] = useState(false);
  const reduceMotion = useReducedMotion();
  const actionsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash;
      if (hash && LANDING_NAV.some((n) => n.href === `/${hash}`)) {
        setLandingActive(`/${hash}`);
        return;
      }
      if (!hash) setLandingActive(activeProp ?? LANDING_NAV[0]?.href ?? "/");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [activeProp]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const hr = readHrSession();
      const pending = hr
        ? Promise.resolve(hr)
        : Promise.all([fetchHrSession(), fetchOwnerSession()]).then(
            ([h, o]) => h ?? o,
          );
      pending.then((v) => {
        if (alive) setViewer(v);
      });
    };
    load();
    window.addEventListener(SESSION_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(SESSION_EVENT, load);
    };
  }, []);

  useEffect(() => {
    if (!authOpen && !profileOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setAuthOpen(false);
        setProfileOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAuthOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [authOpen, profileOpen]);

  const signOut = async () => {
    clearHrSession();
    await clearOwnerSession();
    setViewer(null);
    setProfileOpen(false);
    setMobileOpen(false);
  };

  return (
    <motion.header
      className={`site-navbar-wrap${scrolled ? " is-scrolled" : ""}`}
      initial={false}
      animate={{ y: hideNav ? "-110%" : 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="site-navbar !px-[max(24px,calc((100%_-_1160px)/2))]">
        <Link
          href="/"
          className="site-brand site-brand-text"
          onClick={() => {
            setLandingActive(LANDING_NAV[0]?.href ?? "/");
            setMobileOpen(false);
          }}
        >
          Tammy
        </Link>

        <nav aria-label="Main navigation" className="site-navigation hidden lg:flex">
          <div className="site-nav-links">
            {items.map((item) => {
              const isActive = active === item.href;
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => {
                    setLandingActive(item.href);
                    setMobileOpen(false);
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={`site-nav-link press${isActive ? " is-active" : ""}`}
                  style={{ position: "relative" }}
                >
                  {isActive ? (
                    <motion.span
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
          </div>
        </nav>

        <div className="site-nav-actions" ref={actionsRef}>
          {viewer ? (
            <div className="nav-menu-wrap">
              <button
                type="button"
                className="nav-avatar press"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-label="Account menu"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setAuthOpen(false);
                }}
              >
                {viewerInitials(viewer)}
              </button>
              {profileOpen ? (
                <div className="nav-menu" role="menu">
                  <Link
                    href="/settings"
                    role="menuitem"
                    className="nav-menu-item"
                    onClick={() => setProfileOpen(false)}
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="nav-menu-item"
                    onClick={() => void signOut()}
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {showAuth && !viewer ? (
            <div className="nav-menu-wrap">
              <button
                type="button"
                className="site-login press h-10"
                aria-haspopup="menu"
                aria-expanded={authOpen}
                onClick={() => {
                  setAuthOpen((v) => !v);
                  setProfileOpen(false);
                }}
              >
                Login or Sign up
              </button>
              {authOpen ? (
                <div className="nav-menu" role="menu">
                  {SIGNUP_OPTIONS.map((option) => (
                    <Link
                      key={option.href}
                      href={option.href}
                      role="menuitem"
                      className="nav-menu-item"
                      onClick={() => {
                        setAuthOpen(false);
                        setMobileOpen(false);
                      }}
                    >
                      {option.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {showAuth && (!viewer || viewer.kind === "owner") ? (
            <motion.span whileTap={{ scale: 0.96 }} className="inline-flex">
              <Link
                href="/join"
                className="site-nav-cta site-nav-cta-dark press h-10"
                onClick={() => setMobileOpen(false)}
              >
                Build my page
              </Link>
            </motion.span>
          ) : null}
          {viewer?.kind === "hr" ? (
            <Link
              href="/hire/search"
              className="site-login press h-10"
              onClick={() => setMobileOpen(false)}
            >
              Search
            </Link>
          ) : null}
          <button
            type="button"
            className="theme-toggle press"
            aria-label="Toggle color theme"
            title="Toggle light / dark theme"
            onClick={toggleTheme}
          >
            <Sun className="theme-icon-sun" aria-hidden="true" />
            <Moon className="theme-icon-moon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="site-nav-burger lg:hidden press"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {mobileOpen ? (
          <motion.nav
            key="mobile-nav"
            aria-label="Mobile navigation"
            className="site-mobile-nav lg:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }
            }
            style={{ overflow: "hidden" }}
          >
            <div className="site-mobile-links">
              {items.map((item, i) => (
                <motion.div
                  key={item.href + item.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: reduceMotion ? 0 : 0.05 + i * 0.05,
                  }}
                >
                  <Link
                    href={item.href}
                    onClick={() => {
                      setLandingActive(item.href);
                      setMobileOpen(false);
                    }}
                    className={`site-mobile-link${active === item.href ? " is-active" : ""}`}
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              {showAuth ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: reduceMotion ? 0 : 0.28,
                  }}
                  className="site-mobile-actions"
                >
                  {!viewer ? (
                    <button
                      type="button"
                      className="site-login"
                      style={{ justifyContent: "center" }}
                      aria-expanded={authOpen}
                      onClick={() => setAuthOpen((v) => !v)}
                    >
                      Login or Sign up
                    </button>
                  ) : null}
                  {!viewer && authOpen ? (
                    <div className="nav-menu nav-menu--inline" role="menu">
                      {SIGNUP_OPTIONS.map((option) => (
                        <Link
                          key={option.href}
                          href={option.href}
                          role="menuitem"
                          className="nav-menu-item"
                          onClick={() => {
                            setAuthOpen(false);
                            setMobileOpen(false);
                          }}
                        >
                          {option.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {!viewer || viewer.kind === "owner" ? (
                    <Link
                      href="/join"
                      className="site-nav-cta"
                      style={{ justifyContent: "center" }}
                      onClick={() => setMobileOpen(false)}
                    >
                      Build my page
                    </Link>
                  ) : null}
                  {viewer?.kind === "hr" ? (
                    <Link
                      href="/hire/search"
                      className="site-login"
                      style={{ justifyContent: "center" }}
                      onClick={() => setMobileOpen(false)}
                    >
                      Search
                    </Link>
                  ) : null}
                  {viewer ? (
                    <>
                      <Link
                        href="/settings"
                        className="site-login"
                        style={{ justifyContent: "center" }}
                        onClick={() => setMobileOpen(false)}
                      >
                        Settings
                      </Link>
                      <button
                        type="button"
                        className="site-login"
                        style={{ justifyContent: "center" }}
                        onClick={() => void signOut()}
                      >
                        Log out
                      </button>
                    </>
                  ) : null}
                </motion.div>
              ) : null}
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
