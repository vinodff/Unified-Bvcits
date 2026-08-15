import type { Metadata } from "next";
import PageBanner from "@/components/ui/PageBanner";
import EnquiryForm from "@/components/forms/EnquiryForm";
import { site } from "@/lib/site";
import { MailIcon, PhoneIcon, PinIcon } from "@/components/ui/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { SpotlightCard } from "@/components/motion/Primitives";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with BVCITS, Amalapuram — address, phone, email and enquiry form.",
};

export default function ContactPage() {
  const cards = [
    { icon: <PinIcon className="h-5 w-5" />, label: "Address", value: site.location, href: undefined },
    { icon: <PhoneIcon className="h-5 w-5" />, label: "Phone", value: site.phone, href: site.phoneHref },
    { icon: <MailIcon className="h-5 w-5" />, label: "Email", value: site.email, href: `mailto:${site.email}` },
  ];

  return (
    <>
      <PageBanner
        title="Contact Us"
        subtitle="We would love to hear from you."
        crumbs={[{ label: "Contact Us" }]}
        image="/assets/images/h2-scaled.jpg"
      />

      <div className="section">
        <div className="container-page grid gap-10 lg:grid-cols-2">
          <div>
            <Stagger className="grid gap-4 sm:grid-cols-1" gap={0.08}>
              {cards.map((c) => (
                <StaggerItem key={c.label}>
                  <SpotlightCard className="flex items-start gap-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-crimson-50 text-crimson">{c.icon}</span>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-gold-500">{c.label}</p>
                      {c.href ? (
                        <a href={c.href} className="mt-1 block font-medium text-navy hover:text-crimson">{c.value}</a>
                      ) : (
                        <p className="mt-1 font-medium text-navy">{c.value}</p>
                      )}
                    </div>
                  </SpotlightCard>
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.15}>
              <div className="relative mt-6 flex h-56 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-crimson to-navy-900 text-center text-white shadow-lift">
                <div aria-hidden className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
                <div className="relative">
                  <PinIcon className="mx-auto h-8 w-8 text-gold-300" />
                  <p className="mt-2 font-display font-semibold">BVCITS Campus</p>
                  <p className="text-sm text-white/75">{site.location}</p>
                </div>
              </div>
            </Reveal>
          </div>
          <Reveal direction="left">
            <EnquiryForm title="Send us a message" compact />
          </Reveal>
        </div>
      </div>
    </>
  );
}
