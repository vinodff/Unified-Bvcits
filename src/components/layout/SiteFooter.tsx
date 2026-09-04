import Link from "next/link";
import Image from "next/image";
import { footerColumns, site } from "@/lib/site";
import { MailIcon, PhoneIcon, PinIcon } from "@/components/ui/icons";

export default function SiteFooter() {
  return (
    <footer className="mt-4 bg-navy-900 text-ink-faint">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src="/assets/logos/cropped-logo.png"
              alt="BVCITS crest"
              width={48}
              height={48}
              className="h-12 w-12 rounded-full bg-white object-contain p-0.5"
            />
            <span className="font-display font-extrabold text-white">{site.shortName}</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-faint">
            {site.name}. {site.tagline}. Affiliated to JNTUK &amp; approved by AICTE.
          </p>
          <ul className="mt-5 space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" /> {site.location}
            </li>
            <li className="flex items-center gap-2">
              <PhoneIcon className="h-4 w-4 shrink-0 text-gold-400" />
              <a href={site.phoneHref} className="hover:text-white">{site.phone}</a>
            </li>
            <li className="flex items-center gap-2">
              <MailIcon className="h-4 w-4 shrink-0 text-gold-400" />
              <a href={`mailto:${site.email}`} className="hover:text-white">{site.email}</a>
            </li>
          </ul>
        </div>

        {footerColumns.map((col) => (
          <div key={col.heading}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">{col.heading}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-ink-faint hover:text-gold-300">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-ink-faint hover:text-gold-300">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="h-0.5 bg-gradient-to-r from-transparent via-maroon to-transparent" />
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-ink-faint sm:flex-row">
          <p>© {new Date().getFullYear()} {site.name}. All rights reserved.</p>
          <p>
            <span className="font-serif italic text-gold-300">विश्व विज्ञानं लभ्यते</span>
            {" · "}
            <a href={site.liveUrl} target="_blank" rel="noreferrer" className="hover:text-gold-300">
              bvcits.edu.in
            </a>
            {" · "}
            <Link href="/admin/marketing-studio" className="hover:text-gold-300">
              Marketing Studio Agent
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
