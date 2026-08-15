import Link from "next/link";
import PageBanner from "@/components/ui/PageBanner";
import AudienceSwitcher from "@/components/portal/AudienceSwitcher";
import { ArrowRight, ExternalLink } from "@/components/ui/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { CountUp, SpotlightCard } from "@/components/motion/Primitives";
import type { Portal, PortalLink } from "@/data/portals";

/** Renders an internal Link or an external anchor with the right rel/target. */
function GroupLink({ link }: { link: PortalLink }) {
  const className =
    "group/link flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-white hover:text-navy";

  const body = (
    <>
      <span>{link.label}</span>
      {link.external ? (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-muted transition-colors group-hover/link:text-crimson" />
      ) : (
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-muted opacity-0 transition-all group-hover/link:translate-x-0.5 group-hover/link:opacity-100 group-hover/link:text-crimson" />
      )}
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

export default function PortalPage({ portal }: { portal: Portal }) {
  const [lead, ...rest] = portal.actions;

  return (
    <>
      <PageBanner
        title={portal.title}
        subtitle={portal.subtitle}
        crumbs={[{ label: portal.navLabel }]}
        image={portal.image}
      />

      <AudienceSwitcher current={portal.slug} />

      {/* Quick actions. The first tile is deliberately larger and gold — a
          portal's job is to answer "what did you come here to do" before it
          offers a directory, so one action leads rather than four tying. */}
      <section className="section bg-white">
        <div className="container-page">
          <Reveal>
            <p className="eyebrow">{portal.eyebrow}</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.01em] text-navy md:text-3xl">
              Start here
            </h2>
          </Reveal>

          <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" gap={0.07}>
            <StaggerItem className="sm:col-span-2">
              <Link href={lead.href} className="block h-full">
                <SpotlightCard className="group flex h-full flex-col justify-between rounded-2xl border border-gold/30 bg-gradient-to-br from-gold-50 to-white p-7 shadow-card transition-colors hover:border-gold">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-black">
                    <lead.icon className="h-6 w-6" />
                  </span>
                  <div className="mt-8">
                    <h3 className="font-display text-xl font-extrabold text-navy md:text-2xl">{lead.label}</h3>
                    <p className="mt-2 max-w-sm text-sm text-ink-soft">{lead.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-crimson">
                      Go <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </SpotlightCard>
              </Link>
            </StaggerItem>

            {rest.map((action) => (
              <StaggerItem key={action.href + action.label}>
                <Link href={action.href} className="block h-full">
                  <SpotlightCard className="group flex h-full flex-col rounded-2xl border border-surface-border bg-surface-grey p-6 transition-colors hover:border-crimson/25 hover:bg-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-crimson-50 text-crimson">
                      <action.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-bold leading-snug text-navy">{action.label}</h3>
                    <p className="mt-1.5 flex-1 text-sm text-ink-muted">{action.description}</p>
                    <ArrowRight className="mt-4 h-4 w-4 text-crimson transition-transform group-hover:translate-x-1" />
                  </SpotlightCard>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {portal.stats && (
        <section className="relative isolate overflow-hidden bg-navy py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-crimson/20 blur-[100px]"
          />
          <Stagger className="container-page grid grid-cols-2 gap-8 md:grid-cols-4" gap={0.08}>
            {portal.stats.map((stat) => (
              <StaggerItem key={stat.label}>
                <CountUp
                  value={stat.value}
                  className="block font-display text-3xl font-extrabold leading-none text-white md:text-4xl"
                />
                <div className="mt-2 text-sm text-white/65">{stat.label}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* Link groups as numbered editorial rows rather than a uniform card grid:
          the heading column carries the hierarchy, the links stay scannable. */}
      <section className="section bg-surface-grey">
        <div className="container-page">
          {portal.groups.map((group, i) => (
            <div
              key={group.id}
              id={group.id}
              className={`scroll-mt-40 py-10 ${i > 0 ? "border-t border-surface-border" : "pt-0"}`}
            >
              <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
                <Reveal>
                  <div className="lg:sticky lg:top-40">
                    <span className="font-display text-sm font-extrabold tracking-[0.18em] text-gold-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.01em] text-navy">
                      {group.heading}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-ink-muted">{group.description}</p>
                  </div>
                </Reveal>

                <Reveal delay={0.1}>
                  <ul className="grid gap-1 rounded-2xl border border-surface-border bg-white/60 p-3 sm:grid-cols-2">
                    {group.links.map((link) => (
                      <li key={link.href + link.label}>
                        <GroupLink link={link} />
                      </li>
                    ))}
                  </ul>
                </Reveal>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-surface-border bg-white py-14">
        <Reveal className="container-page flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div>
            <h2 className="text-2xl font-extrabold text-navy">{portal.contact.heading}</h2>
            <p className="mt-1.5 text-ink-soft">{portal.contact.body}</p>
          </div>
          <Link href={portal.contact.ctaHref} className="btn-primary group shrink-0">
            {portal.contact.ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
