import { Reveal } from "@/components/motion/Reveal";
import { TextReveal } from "@/components/motion/Primitives";

export default function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && (
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
        </Reveal>
      )}
      <TextReveal
        text={title}
        delay={0.06}
        className="mt-2 font-display text-2xl font-extrabold tracking-[-0.01em] text-navy md:text-3xl"
      />
      {description && (
        <Reveal delay={0.16}>
          <p className="mt-3 text-ink-soft">{description}</p>
        </Reveal>
      )}
    </div>
  );
}
