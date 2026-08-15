import Link from "next/link";
import { portals } from "@/data/portals";

/**
 * Horizontal strip of the other audience portals. The stakeholder model only
 * works if a visitor who lands in the wrong portal can cross to the right one
 * without going back to the header — this is that escape hatch, and it repeats
 * on every portal page plus the archive index.
 */
export default function AudienceSwitcher({ current }: { current?: string }) {
  return (
    <section className="border-b border-surface-border bg-white">
      <div className="container-page flex flex-wrap items-center gap-x-3 gap-y-2 py-4">
        <span className="mr-1 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted">
          I am a
        </span>
        {portals.map((p) => {
          const isCurrent = p.slug === current;
          return (
            <Link
              key={p.slug}
              href={`/${p.slug}`}
              aria-current={isCurrent ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isCurrent
                  ? "border-navy bg-navy text-white"
                  : "border-surface-border bg-white text-ink-soft hover:border-crimson-300 hover:bg-crimson-50 hover:text-navy"
              }`}
            >
              {p.navLabel}
            </Link>
          );
        })}
        <Link
          href="/others"
          className="rounded-full border border-dashed border-surface-border px-3.5 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-navy hover:text-navy"
        >
          Everything else
        </Link>
      </div>
    </section>
  );
}
