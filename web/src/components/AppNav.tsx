"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, Moon, Sun, X } from "lucide-react";

type ViewTransitionDoc = Document & {
  startViewTransition?: (updateCallback: () => void) => { finished: Promise<void> };
};

const toggleTheme = () => {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  const apply = () => {
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("tammy_theme", next);
    } catch {
    }
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = (document as ViewTransitionDoc).startViewTransition;
  if (!reduce && typeof start === "function") {
    start.call(document, apply);
  } else {
    apply();
  }
};

const LANDING_NAV = [
  { label: "Candidates", href: "/#candidates" },
  { label: "Employers", href: "/hire" },
  { label: "Match engine", href: "/#engine" },
  { label: "FAQ", href: "/#faq" },
] as const;

const NAV_ITEMS: { label: string; href: string }[] = LANDING_NAV.map((n) => ({ ...n }));

export default function AppNav({ active: activeProp }: { active?: string } = {}) {
  const [active, setActive] = useState<string>(activeProp ?? NAV_ITEMS[0]?.href ?? "/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hideNav, setHideNav] = useState(false);
  const reduceMotion = useReducedMotion();

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
      if (hash && NAV_ITEMS.some((n) => n.href === `/${hash}`)) {
        setActive(`/${hash}`);
        return;
      }
      if (!hash) setActive(activeProp ?? NAV_ITEMS[0]?.href ?? "/");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [activeProp]);

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
            setActive(NAV_ITEMS[0]?.href ?? "/");
            setMobileOpen(false);
          }}
        >
          Tammy
        </Link>

        <nav aria-label="Main navigation" className="site-navigation hidden md:flex">
          <div className="site-nav-links">
            {NAV_ITEMS.map((item) => {
              const isActive = active === item.href;
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

        <div className="site-nav-actions">
          <Link
            href="/join"
            className="site-login press h-10"
            onClick={() => setMobileOpen(false)}
          >
            Signup
          </Link>
          <motion.span whileTap={{ scale: 0.96 }} className="inline-flex">
            <Link
              href="/hire"
              className="site-nav-cta site-nav-cta-dark press h-10"
              onClick={() => setMobileOpen(false)}
            >
              Book a demo
            </Link>
          </motion.span>
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
            className="site-nav-burger md:hidden press"
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
            className="site-mobile-nav md:hidden"
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
              {NAV_ITEMS.map((item, i) => (
                <motion.div
                  key={item.href + item.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: reduceMotion ? 0 : 0.05 + i * 0.05 }}
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
                transition={{ duration: 0.25, delay: reduceMotion ? 0 : 0.28 }}
                className="site-mobile-actions"
              >
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
              </motion.div>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
