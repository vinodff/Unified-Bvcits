import Link from "next/link";
import { getSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const PIPELINE = [
  {
    step: "1 · Research",
    title: "Web Search Agent",
    text: "Scans the real internet for the exam's latest pattern, syllabus, marking scheme and previous-year questions — official sites, forums and student discussions.",
  },
  {
    step: "2 · Extract & Process",
    title: "Data Agents",
    text: "Extracts questions from pages and PDFs, removes duplicates, and categorises everything by topic and difficulty into a structured bank.",
  },
  {
    step: "3 · AI Exam Reviewer",
    title: "30 years of experience",
    text: "Analyses weightage, trends and frequently-tested concepts to predict what the next paper will actually look like.",
  },
  {
    step: "4 · Faculty Review",
    title: "Human gate",
    text: "A faculty reviewer edits, removes or adds questions, then approves the paper. AI predicts — people decide.",
  },
  {
    step: "5 · Secure Exam",
    title: "Real-exam environment",
    text: "Full-screen lock, tab-switch detection, copy-paste blocking, webcam monitoring and an auto-submitting timer.",
  },
  {
    step: "6 · Results & Analytics",
    title: "Data-driven insight",
    text: "Score, percentile, section-wise and topic-wise performance, and time analysis — every attempt feeds the next prediction.",
  },
] as const;

export default async function PlacementPortalLanding() {
  const user = await getSessionUser();
  const cta = user
    ? { href: "/placement-portal/exams", label: "Open your exam dashboard" }
    : { href: "/login?next=/placement-portal/exams", label: "Sign in to get started" };

  return (
    <div>
      {/* Hero */}
      <section className="rounded-3xl border border-surface-border bg-gradient-to-br from-white via-surface-subtle to-surface-form p-6 shadow-card sm:p-12 sm:py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-goldLight/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-goldDark">
          Placement Preparation Portal Agent
        </div>
        <h1 className="mt-4 max-w-3xl font-display text-3xl font-extrabold leading-tight text-navy sm:text-5xl">
          AI-powered predicted exam papers, reviewed by faculty, attempted like the real thing.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-base">
          Enter an exam name — TCS NQT, Wipro NLTH, Infosys SP. The system researches real
          patterns and previous-year questions, a senior AI reviewer builds a predicted paper,
          faculty approve it, and you practise in a fully proctored exam environment.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={cta.href}
            className="rounded-xl bg-gold px-6 py-3 font-display text-sm font-bold text-navy shadow-sm transition hover:-translate-y-0.5 hover:bg-gold-400"
          >
            {cta.label}
          </Link>
          {!user && (
            <Link
              href="/signup"
              className="rounded-xl border border-surface-border bg-white px-6 py-3 font-display text-sm font-bold text-navy shadow-xs transition hover:border-gold hover:bg-surface-subtle"
            >
              Create a student account
            </Link>
          )}
        </div>
        <div className="mt-10 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["5", "AI agents in the pipeline"],
            ["Real", "internet research"],
            ["0", "leaked answers to students"],
            ["100%", "faculty-approved before publish"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-surface-border bg-white p-4 shadow-xs">
              <p className="font-display text-xl font-extrabold text-goldDark">{value}</p>
              <p className="mt-1 text-xs text-ink-soft">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-extrabold text-navy">How a predicted paper is born</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((item) => (
            <div key={item.title} className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <p className="text-xs font-bold uppercase tracking-wider text-crimson">{item.step}</p>
              <h3 className="mt-2 font-display text-lg font-bold text-navy">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            role: "Admin",
            text: "Enter the exam name. The pipeline researches, extracts, processes, reviews and generates — with a live progress ledger.",
            link: "/placement-portal/admin",
          },
          {
            role: "Faculty",
            text: "See the pattern summary and collected previous-year questions. Edit, remove or add questions. Approve and publish.",
            link: "/placement-portal/review",
          },
          {
            role: "Student",
            text: "Take published papers in a locked, proctored environment with a timer. Review your score, percentile and weak topics.",
            link: "/placement-portal/exams",
          },
        ].map((item) => (
          <div key={item.role} className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
            <h3 className="font-display text-lg font-bold text-navy">{item.role}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}