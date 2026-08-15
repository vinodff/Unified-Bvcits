import Link from "next/link";
import PageBanner from "@/components/ui/PageBanner";
import { ArrowRight } from "@/components/ui/icons";
import { site } from "@/lib/site";

const ACRONYMS: Record<string, string> = {
  iqac: "IQAC", naac: "NAAC", nba: "NBA", nirf: "NIRF", coe: "COE",
  jntuk: "JNTUK", csr: "CSR", aqar: "AQAR", ssr: "SSR", mou: "MoU",
  mous: "MoUs", ieee: "IEEE", esar: "E-SAR", peo: "PEO", po: "PO", pso: "PSO",
};

function prettify(seg: string): string {
  return seg
    .split("-")
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Routes that reach this stub are archive sections, so the way out is the
// archive index first, then the audience portals — not a flat list of the five
// pages that happened to exist when this file was written.
const related = [
  ["Full Site Index", "/others"],
  ["Students", "/students"],
  ["Parents", "/parents"],
  ["Recruiters", "/recruiters"],
  ["Regulatory", "/regulatory"],
  ["Departments", "/departments"],
  ["Contact Us", "/contact-us"],
];

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];
  const title = prettify(segments[segments.length - 1] ?? "Page");
  const crumbs = [{ label: "Others", href: "/others" }, ...segments.map((s) => ({ label: prettify(s) }))];
  const liveHref = `${site.liveUrl}/${segments.join("/")}/`;

  return (
    <>
      <PageBanner title={title} crumbs={crumbs} />
      <div className="section">
        <div className="container-page max-w-3xl">
          <p className="leading-relaxed text-ink">
            This is the <strong>{title}</strong> section of {site.shortName}. The full content for this page is part
            of the institute&rsquo;s information architecture and is being migrated into this modern portal.
          </p>
          <div className="mt-6 rounded-xl border border-dashed border-surface-border bg-surface-grey p-6">
            <p className="text-sm text-ink-soft">
              Looking for the currently published version? View it on the live site:
            </p>
            <a
              href={liveHref}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-crimson hover:text-navy"
            >
              {liveHref} <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-10">
            <h2 className="text-lg font-bold text-navy">Explore other sections</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {related.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-white px-4 py-2 text-sm font-medium text-navy hover:border-crimson-300 hover:bg-crimson-50"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
