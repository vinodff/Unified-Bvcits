"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { ChevronDown } from "@/components/ui/icons";
import { site } from "@/lib/site";

const SPRING = { type: "spring", stiffness: 100, damping: 20 } as const;

const QUESTIONS = [
  {
    id: "admission",
    question: "How do I apply for 2026–27?",
    answer:
      `Admissions are open. Enter counselling code ${site.counsellingCode}, or submit the enquiry form on the admissions page and the office will call you back with the procedure, intake and fee structure for your branch.`,
  },
  {
    id: "autonomy",
    question: "What does 'autonomous' actually change for me?",
    answer:
      "BVCITS sets its own curriculum and runs its own examinations under JNTUK affiliation. In practice that means syllabus updates land faster, internal assessment is handled on campus, and results are published by the institute's own examination cell.",
  },
  {
    id: "branches",
    question: "Which branches are available?",
    answer:
      "Seven B.Tech branches — CSE, CSE (AI & ML), IT, ECE, EEE, Civil and Mechanical — alongside MBA, MCA, M.Tech, BBA, BCA and diploma programmes. Ten departments in total.",
  },
  {
    id: "placements",
    question: "How strong are placements, honestly?",
    answer:
      "1,256+ students were placed in 2026 across 58+ recruiting MNCs. The average package is around ₹4 lakhs per annum; the highest offer that year was ₹38 lakhs from ServiceNow. Training, mock interviews and recruiter engagement run through all four years.",
  },
  {
    id: "campus",
    question: "What is campus life like?",
    answer:
      "A 40-acre green campus with hostels, labs, a library, sports grounds and an active calendar of festivals, workshops and FDPs. It is residential and quiet — most students describe it as easy to focus in.",
  },
] as const;

export default function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>(QUESTIONS[0].id);

  const handleToggle = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <section className="px-6 py-24 md:px-8 md:py-32" style={{ background: "var(--exp-bg)" }}>
      <div className="mx-auto grid w-full max-w-[1400px] gap-12 lg:grid-cols-[2fr_3fr]">
        <Reveal direction="right">
          <p className="eyebrow">Questions</p>
          <h2 className="mt-3 max-w-[16ch] font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-navy md:text-5xl">
            The things people actually ask.
          </h2>
          <p className="mt-5 max-w-[45ch] leading-relaxed text-ink-soft">
            Still stuck? Call {site.phone} or email{" "}
            <a href={`mailto:${site.email}`} className="font-semibold text-crimson hover:underline">
              {site.email}
            </a>
            .
          </p>
        </Reveal>

        <div className="space-y-4">
          {QUESTIONS.map((item) => {
            const isOpen = openId === item.id;
            return (
              <div key={item.id} className="card-surface overflow-hidden">
                <h3>
                  <button
                    type="button"
                    onClick={() => handleToggle(item.id)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${item.id}`}
                    className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors hover:text-crimson md:p-7"
                  >
                    <span className="font-display text-base font-bold text-navy md:text-lg">
                      {item.question}
                    </span>
                    <span
                      className={`inset-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-crimson transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-panel-${item.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={SPRING}
                      style={{ overflow: "hidden" }}
                    >
                      <p className="px-6 pb-6 text-sm leading-relaxed text-ink-soft md:px-7 md:pb-7 md:text-base">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
