"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";

const LANDING_NAV = [
  { label: "Candidates", href: "/#candidates" },
  { label: "Employers", href: "/hire" },
  { label: "Match engine", href: "/#engine" },
  { label: "FAQ", href: "/#faq" },
] as const;

const NAV_ITEMS: { label: string; href: string }[] = LANDING_NAV.map((n) => ({ ...n }));

export default function AppNav() {
  const [active, setActive] = useState<string>(NAV_ITEMS[0]?.href ?? "/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hideNav, setHideNav] = useState(false);

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

  // Keep the sliding pill in sync with the current in-page hash.
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash;
      if (hash && NAV_ITEMS.some((n) => n.href === `/${hash}`)) {
        setActive(`/${hash}`);
        return;
      }
      if (!hash) setActive(NAV_ITEMS[0]?.href ?? "/");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <motion.header
      className={`site-navbar-wrap${scrolled ? " is-scrolled" : ""}`}
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

        {/* Center pill — in-page anchors, animated sliding indicator */}
        <nav aria-label="Main navigation" className="site-navigation hidden md:flex">
          <motion.div
            className="site-nav-links"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
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
          </motion.div>
        </nav>

        <motion.div
          className="site-nav-actions"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
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
