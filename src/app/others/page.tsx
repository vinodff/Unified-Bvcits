import type { Metadata } from "next";
import Link from "next/link";
import PageBanner from "@/components/ui/PageBanner";
import AudienceSwitcher from "@/components/portal/AudienceSwitcher";
import { ArrowRight, ExternalLink, Search } from "@/components/ui/icons";
import { Reveal } from "@/components/motion/Reveal";
import { legacySections, legacyLinkCount, type LegacyLink } from "@/data/legacy-index";

export const metadata: Metadata = {
  title: "Others — Full Site Index",
  description:
    "Complete index of every BVCITS section: examinations, IQAC, library, placements, campus resources, feedback and news.",
};

const liveCount = legacySections.reduce(
  (n, s) => n + s.links.filter((l) => l.live).length,
  0,
);

function IndexLink({ link }: { link: LegacyLink }) {
  const className =
    "group/link flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-surface-grey";

  const body = (
    <>
      <span className="font-medium text-ink-soft group-hover/link:text-navy">{link.label}</span>
      <span className="mt-0.5 flex shrink-0 items-center gap-2">
        {link.live && (
          <span className="rounded-full bg-gold-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-600">
            Live
          </span>
        )}
        {link.external ? (
          <ExternalLink className="h-3.5 w-3.5 text-ink-muted" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5 text-ink-muted opacity-0 transition-all group-hover/link:translate-x-0.5 group-hover/link:opacity-100 group-hover/link:text-crimson" />
        )}
      </span>
    </>
  );

  return link.external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {body}
    </Link>
  );
}

export default function OthersPage() {
  return (
    <>
      <PageBanner
        title="Everything Else"
        subtitle="The complete section index. Every page on the site is reachable from here, grouped by function rather than by audience."
        crumbs={[{ label: "Others" }]}
        image="/assets/images/h1-scaled.jpg"
      />

      <AudienceSwitcher />

      <section className="border-b border-surface-border bg-white py-10">
        <div className="container-page">
          <Reveal>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="eyebrow">Full Index</p>
                <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.01em] text-navy">
                  {legacyLinkCount} sections, {legacySections.length} groups
                </h2>
                <p className="mt-3 leading-relaxed text-ink-soft">
                  The main navigation is organised by who you are. This page is organised by what
                  the section <em>is</em> — useful when you know the name of the page you want.
                  Entries marked <strong className="text-gold-600">Live</strong> are fully built
                  here; the rest currently open a migration notice with a link to the published
                  version on the live institute site.
                </p>
                <p className="mt-2 text-sm text-ink-muted">
                  {liveCount} of {legacyLinkCount} entries are fully built in this portal.
                </p>
              </div>

              <nav aria-label="Jump to section" className="shrink-0 lg:max-w-sm">
                <p className="mb-3 flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  <Search className="h-3.5 w-3.5" /> Jump to
                </p>
                <ul className="flex flex-wrap gap-2">
                  {legacySections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="inline-block rounded-full border border-surface-border px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-crimson-300 hover:bg-crimson-50 hover:text-navy"
                      >
                        {s.heading}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section bg-surface-grey">
        <div className="container-page grid gap-6 lg:grid-cols-2">
          {legacySections.map((section) => (
            <Reveal key={section.id}>
              <div
                id={section.id}
                className="flex h-full scroll-mt-40 flex-col rounded-2xl border border-surface-border bg-white p-6 shadow-card"
              >
                <h2 className="font-display text-lg font-extrabold text-navy">{section.heading}</h2>
                <p className="mt-1.5 text-sm text-ink-muted">{section.description}</p>
                <ul className="mt-4 grid flex-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {section.links.map((link) => (
                    <li key={link.href + link.label}>
                      <IndexLink link={link} />
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-surface-border bg-white py-14">
        <Reveal className="container-page flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div>
            <h2 className="text-2xl font-extrabold text-navy">Can&rsquo;t find what you need?</h2>
            <p className="mt-1.5 text-ink-soft">
              Tell us what you were looking for and we&rsquo;ll point you to the right office.
            </p>
          </div>
          <Link href="/contact-us" className="btn-primary group shrink-0">
            Contact Us <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
