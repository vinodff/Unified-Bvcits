import Image from "next/image";
import Breadcrumb, { type Crumb } from "@/components/ui/Breadcrumb";
import { Reveal } from "@/components/motion/Reveal";
import { TextReveal } from "@/components/motion/Primitives";

/** Shared interior page header — real campus imagery + choreographed reveal. */
export default function PageBanner({
  title,
  subtitle,
  crumbs,
  image = "/assets/images/h2-scaled.jpg",
}: {
  title: string;
  subtitle?: string;
  crumbs: Crumb[];
  image?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-navy">
      <Image
        src={image}
        alt=""
        fill
        priority
        quality={80}
        sizes="100vw"
        className="object-cover object-center opacity-[0.22]"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-navy via-navy/95 to-navy-800/85" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-crimson/25 blur-[100px] motion-safe:animate-drift"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "26px 26px" }}
      />

      <div className="container-page relative py-14 md:py-20">
        <Reveal>
          <Breadcrumb items={crumbs} />
        </Reveal>
        <TextReveal
          as="h1"
          text={title}
          delay={0.06}
          className="mt-4 max-w-[20ch] font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.02em] text-white md:text-[2.75rem]"
        />
        {subtitle && (
          <Reveal delay={0.2}>
            <p className="mt-4 max-w-2xl leading-relaxed text-white/75">{subtitle}</p>
          </Reveal>
        )}
        <Reveal delay={0.26}>
          <span className="mt-7 block h-1 w-20 rounded-full bg-gradient-to-r from-crimson to-gold-400" />
        </Reveal>
      </div>
    </section>
  );
}
