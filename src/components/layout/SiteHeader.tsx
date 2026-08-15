"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { primaryNav, site, type NavItem } from "@/lib/site";
import { ChevronDown, CloseIcon, MenuIcon, PhoneIcon } from "@/components/ui/icons";

function BrandMark() {
  return (
    <Link
      href="/"
      className="group flex shrink-0 items-center gap-3"
      aria-label={`${site.shortName} home`}
    >
      {/* Real institute crest downloaded from the live site */}
      <Image
        src="/assets/logos/cropped-logo.png"
        alt="BVC Institute of Technology & Science crest"
        width={52}
        height={52}
        className="h-11 w-11 shrink-0 object-contain transition-transform duration-500 group-hover:scale-105 md:h-12 md:w-12"
        priority
      />
      {/* Constrained so the wordmark can never collide with the nav */}
      <span className="hidden min-w-0 leading-tight sm:block">
        <span className="block font-display text-[13px] font-extrabold uppercase tracking-tight text-navy lg:text-[15px]">
          <span className="text-crimson">BVC</span> Institute of Technology
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted lg:text-[11px]">
          &amp; Science · Amalapuram
        </span>
      </span>
    </Link>
  );
}

function DesktopItem({ item, alignRight = false }: { item: NavItem; alignRight?: boolean }) {
  // Open state is real React state rather than a pure `group-hover` CSS trick so
  // the panel opens on keyboard focus too, and so `aria-expanded` can report the
  // truth. Hover-only dropdowns left ~60 sub-page links unreachable by keyboard
  // (WCAG 2.1.1) — every nav destination must be operable without a pointer.
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);

  if (!item.columns) {
    return (
      <Link
        href={item.href}
        className="nav-underline relative inline-flex items-center whitespace-nowrap px-1.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:text-crimson"
      >
        {item.label}
      </Link>
    );
  }
  const wide = item.columns.length > 1 || (item.columns[0]?.links.length ?? 0) > 6;
  return (
    <div
      className="group relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      // focus/blur bubble from the trigger and every link inside the panel, so
      // tabbing through the panel keeps it open and tabbing out of it closes.
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        setOpen(false);
        triggerRef.current?.focus(); // return focus to the trigger, not to the void
      }}
    >
      <Link
        ref={triggerRef}
        href={item.href}
        aria-haspopup="true"
        aria-expanded={open}
        className={`nav-underline relative inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-2 text-[13px] font-semibold transition-colors ${
          open ? "text-crimson" : "text-ink"
        }`}
      >
        {item.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Link>
      {/* Right-edge items anchor their panel to the right so a 34rem mega-menu
          can't push past the viewport and create a horizontal scrollbar. */}
      <div
        className={`absolute top-full z-40 transition-all duration-150 ${
          alignRight ? "right-0" : "left-0"
        } ${
          open ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0"
        } ${wide ? "w-[34rem]" : "w-72"}`}
      >
        <div className="mt-1 rounded-lg border border-surface-border bg-white p-4 shadow-card">
          <div className={wide ? "grid grid-cols-2 gap-x-6 gap-y-1" : ""}>
            {item.columns.map((col, i) => (
              <div key={i}>
                {col.heading && (
                  <p className="mb-1 px-2 text-xs font-bold uppercase tracking-wide text-crimson">
                    {col.heading}
                  </p>
                )}
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      {l.external ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-crimson-50 hover:text-navy"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link
                          href={l.href}
                          className="block rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-crimson-50 hover:text-navy"
                        >
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobilePanel({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-navy/60" onClick={onClose} aria-hidden />
      <nav className="absolute right-0 top-0 h-full w-[86%] max-w-sm overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <span className="font-bold text-navy">Menu</span>
          <button onClick={onClose} aria-label="Close menu" className="rounded p-1 text-ink-soft hover:bg-surface-grey">
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>
        <ul className="p-2">
          {primaryNav.map((item) => (
            <li key={item.label} className="border-b border-surface-border">
              {!item.columns ? (
                <Link href={item.href} onClick={onClose} className="block px-3 py-3 font-semibold text-ink">
                  {item.label}
                </Link>
              ) : (
                <>
                  <button
                    onClick={() => setOpen(open === item.label ? null : item.label)}
                    className="flex w-full items-center justify-between px-3 py-3 text-left font-semibold text-ink"
                    aria-expanded={open === item.label}
                  >
                    {item.label}
                    <ChevronDown className={`h-4 w-4 transition-transform ${open === item.label ? "rotate-180" : ""}`} />
                  </button>
                  {open === item.label && (
                    <div className="pb-2">
                      {item.columns.map((col, i) => (
                        <div key={i} className="mb-1">
                          {col.heading && (
                            <p className="px-5 py-1 text-xs font-bold uppercase tracking-wide text-crimson">
                              {col.heading}
                            </p>
                          )}
                          <ul>
                            {col.links.map((l) => (
                              <li key={l.href + l.label}>
                                {l.external ? (
                                  <a href={l.href} target="_blank" rel="noreferrer" onClick={onClose} className="block px-5 py-2 text-sm text-ink-soft">
                                    {l.label}
                                  </a>
                                ) : (
                                  <Link href={l.href} onClick={onClose} className="block px-5 py-2 text-sm text-ink-soft">
                                    {l.label}
                                  </Link>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="p-4">
          <Link href={site.applyUrl} onClick={onClose} className="btn-primary w-full">
            Apply for Admissions
          </Link>
        </div>
      </nav>
    </div>
  );
}

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();

  // Premium hide-on-scroll-down / reveal-on-scroll-up. Works with Lenis
  // because Lenis animates native window scroll. Skipped for reduced motion;
  // never hides while the mobile menu is open.
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    if (reduce || mobileOpen) return;
    setHidden(y > 140 && y > prev);
  });

  return (
    <motion.header
      animate={{ y: hidden ? "-100%" : "0%" }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-40"
    >
      {/* Utility bar — collapses once scrolled so the two-row header costs no
          more sticky height mid-page than the old single-row one did (120px).
          `scroll-padding-top` in globals.css is calibrated to that 120px. */}
      <div
        className={`overflow-hidden bg-navy text-white transition-[height] duration-300 motion-reduce:transition-none ${
          scrolled ? "h-0" : "h-11"
        }`}
        aria-hidden={scrolled}
      >
        <div className="container-page flex h-11 items-center justify-between text-xs sm:text-[13px]">
          <a href={site.phoneHref} className="flex items-center gap-2 font-medium hover:text-gold-200">
            <PhoneIcon className="h-4 w-4" /> {site.phone}
          </a>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-white/80">
              Counselling Code: <strong className="text-gold-300">{site.counsellingCode}</strong>
            </span>
            <Link href={site.applyUrl} className="font-semibold text-gold-300 hover:text-gold-200">
              Apply for Admissions →
            </Link>
          </div>
        </div>
      </div>

      {/* Brand row — carries the scrolled shadow only below xl, where the nav
          row below it is hidden and would otherwise leave the header edgeless. */}
      <div
        className={`border-b border-surface-border bg-white/85 backdrop-blur-md transition-shadow duration-300 supports-[backdrop-filter]:bg-white/70 xl:shadow-none ${
          scrolled ? "shadow-md shadow-navy/5" : "shadow-sm"
        }`}
      >
        <div className="container-page flex h-[76px] items-center justify-between gap-3">
          <BrandMark />
          <div className="flex shrink-0 items-center gap-2">
            <a href={site.phoneHref} className="btn-outline hidden md:inline-flex">
              <PhoneIcon className="h-4 w-4" /> Call
            </a>
            <Link href={site.applyUrl} className="btn-primary hidden sm:inline-flex">
              Apply
            </Link>
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-navy hover:bg-crimson-50 xl:hidden"
              aria-label="Open menu"
            >
              <MenuIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Nav row — the full container width belongs to the nav alone. All 12
          documented items fit here; sharing a row with the brand and the
          Call/Apply pair left only 646px for 1195px of items, so five of them
          rendered on top of the buttons or off-screen entirely. */}
      <div
        className={`hidden border-b border-surface-border bg-white/85 backdrop-blur-md transition-shadow duration-300 supports-[backdrop-filter]:bg-white/70 xl:block ${
          scrolled ? "shadow-md shadow-navy/5" : "shadow-sm"
        }`}
      >
        <nav className="container-page flex h-11 items-center justify-between" aria-label="Primary">
          {primaryNav.map((item, i) => (
            <DesktopItem key={item.label} item={item} alignRight={i >= primaryNav.length - 4} />
          ))}
        </nav>
      </div>

      {mobileOpen && <MobilePanel onClose={() => setMobileOpen(false)} />}
    </motion.header>
  );
}
