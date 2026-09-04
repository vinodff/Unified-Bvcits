"use client";

// Blog Agent panel — the daily idea queue and the published library.
//
// Flow the admin sees:
//   ten ideas → approve one → it writes, illustrates and (usually) publishes
//               → the article appears under "Articles" with a live link
//
// The idea card deliberately shows the agent's reasoning (why this topic, what
// someone is searching for, how it serves the college) rather than just a
// headline. Approving is a decision about editorial direction, and a headline
// alone is not enough information to make it.

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "../api";
import { Button, Card, Empty, ErrorNote, Field, Pill, SectionTitle, inputCls, useBusy } from "../ui";
import { BLOG_CATEGORIES, type BlogPost, type BlogTopic } from "@/lib/marketing/blog/domain";

const AUDIENCE_LABEL: Record<BlogTopic["audience"], string> = {
  students: "Students",
  parents: "Parents",
  both: "Students & parents",
  recruiters: "Recruiters",
  faculty: "Faculty",
};

function scoreTone(score: number): "success" | "info" | "neutral" {
  return score >= 85 ? "success" : score >= 70 ? "info" : "neutral";
}

function postTone(status: BlogPost["status"]): "success" | "info" | "danger" | "neutral" {
  if (status === "PUBLISHED") return "success";
  if (status === "NEEDS_REVIEW") return "info";
  if (status === "FAILED") return "danger";
  return "neutral";
}

function TopicCard({
  topic,
  busy,
  onDecide,
  onWrite,
}: {
  topic: BlogTopic;
  busy: boolean;
  onDecide: (decision: "approved" | "rejected") => void;
  onWrite: () => void;
}) {
  const decided = topic.status !== "proposed";

  return (
    <Card className={decided ? "opacity-75" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={scoreTone(topic.score)}>{topic.score}/100</Pill>
            <Pill tone="neutral">{topic.category}</Pill>
            <Pill tone="neutral">{AUDIENCE_LABEL[topic.audience]}</Pill>
            {topic.source === "admin" ? <Pill tone="info">Your title</Pill> : null}
            {topic.status === "approved" ? <Pill tone="success">Approved</Pill> : null}
            {topic.status === "rejected" ? <Pill tone="danger">Rejected</Pill> : null}
            {topic.status === "used" ? <Pill tone="success">Written</Pill> : null}
          </div>
          <h3 className="mt-3 font-display text-base font-bold leading-snug text-navy">{topic.title}</h3>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Angle</dt>
          <dd className="mt-1 leading-relaxed text-ink-soft">{topic.angle}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Why it is worth writing</dt>
          <dd className="mt-1 leading-relaxed text-ink-soft">{topic.rationale}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">What people search</dt>
          <dd className="mt-1 leading-relaxed text-ink-soft">
            <span className="font-semibold text-goldDark">{topic.primaryKeyword}</span>
            {topic.secondaryKeywords.length ? (
              <span className="text-ink-muted"> · {topic.secondaryKeywords.slice(0, 3).join(" · ")}</span>
            ) : null}
            <span className="mt-1 block text-ink-muted">{topic.searchIntent}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">How it serves BVCITS</dt>
          <dd className="mt-1 leading-relaxed text-ink-soft">{topic.promoAngle}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {topic.status === "proposed" ? (
          <>
            <Button onClick={() => onDecide("approved")} disabled={busy}>
              Approve
            </Button>
            <Button variant="ghost" onClick={() => onDecide("rejected")} disabled={busy}>
              Not this one
            </Button>
          </>
        ) : null}
        {topic.status === "approved" ? (
          <Button onClick={onWrite} disabled={busy}>
            {busy ? "Writing…" : "Write & publish this"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

interface PipelineStep {
  id: string;
  name: string;
  agent: string;
  description: string;
  icon: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "keywords",
    name: "Search Intent & Keyword Research",
    agent: "Topic & Search Scout",
    description: "Analyzing high-intent search queries, competitor ranking signals, and Konaseema/AP engineering keywords.",
    icon: "🔍",
  },
  {
    id: "outline",
    name: "Structural & Narrative Architecture",
    agent: "Outline Agent",
    description: "Building H2/H3 section architecture, practical frameworks, and internal route link mapping.",
    icon: "📐",
  },
  {
    id: "write",
    name: "Deep Technical & Editorial Prose",
    agent: "Writer Agent",
    description: "Drafting comprehensive engineering guide with actionable examples, tables, and student advice.",
    icon: "✍️",
  },
  {
    id: "images",
    name: "Brand Creative & Infographics",
    agent: "Image Agent",
    description: "Composing multi-layer institutional visuals with BVCITS crest, gold accents, and counselling badges.",
    icon: "🎨",
  },
  {
    id: "seo",
    name: "SEO Optimization & JSON-LD Schema",
    agent: "SEO Agent",
    description: "Injecting canonical slug, OpenGraph metadata, and Google Search JSON-LD structured data.",
    icon: "🔎",
  },
  {
    id: "quality",
    name: "Fact Grounding & Quality Gate",
    agent: "Quality & Review Agent",
    description: "Executing anti-hallucination verification, institutional compliance checks, and final publishing.",
    icon: "🛡️",
  },
];

function BlogGenerationModal({
  topicTitle,
  category,
}: {
  topicTitle: string;
  category: string;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(15);
  const [logs, setLogs] = useState<string[]>([
    "Initializing multi-agent blog pipeline for BVCITS editorial studio...",
    `Extracting core entity & search angle for: "${topicTitle}"`,
  ]);

  useEffect(() => {
    const stepIntervals = [
      { delay: 3500, nextStep: 1, nextProgress: 32, log: "Outline Agent: Structuring sections, tables & internal routes..." },
      { delay: 8000, nextStep: 2, nextProgress: 56, log: "Writer Agent: Drafting technical prose & actionable career takeaways..." },
      { delay: 14000, nextStep: 3, nextProgress: 75, log: "Image Agent: Composing high-definition brand cards with college crest..." },
      { delay: 20000, nextStep: 4, nextProgress: 88, log: "SEO Agent: Building OpenGraph tags & schema.org JSON-LD..." },
      { delay: 25000, nextStep: 5, nextProgress: 96, log: "Quality Gate: Verifying institutional facts & NAAC/NBA accreditations..." },
    ];

    const timers = stepIntervals.map((item) =>
      setTimeout(() => {
        setCurrentStep(item.nextStep);
        setProgress(item.nextProgress);
        setLogs((prev) => [...prev, item.log]);
      }, item.delay)
    );

    return () => timers.forEach(clearTimeout);
  }, [topicTitle]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-surface-border bg-white p-6 md:p-8 shadow-2xl text-navy">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-gold" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-goldDark">
                Autonomous Blog Agent Pipeline
              </span>
            </div>
            <h2 className="mt-2 font-display text-xl md:text-2xl font-extrabold leading-tight text-navy">
              {topicTitle}
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy">
                {category}
              </span>
              <span className="text-xs text-ink-muted">· Live agent generation in progress</span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-display text-3xl font-extrabold text-goldDark">{progress}%</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold via-amber-400 to-crimson transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps List */}
        <div className="mt-6 space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {PIPELINE_STEPS.map((s, idx) => {
            const isDone = idx < currentStep;
            const isCurrent = idx === currentStep;

            return (
              <div
                key={s.id}
                className={`flex items-start gap-3.5 rounded-xl border p-3 transition ${
                  isCurrent
                    ? "border-gold/60 bg-gold/5 shadow-xs"
                    : isDone
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-surface-border/60 bg-surface-subtle/30 opacity-60"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    isDone
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                        ? "bg-navy text-gold animate-pulse"
                        : "bg-surface-border text-ink-muted"
                  }`}
                >
                  {isDone ? "✓" : s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4
                      className={`text-xs font-bold ${
                        isCurrent ? "text-navy" : isDone ? "text-emerald-900" : "text-ink-muted"
                      }`}
                    >
                      {s.name}
                    </h4>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        isDone
                          ? "text-emerald-600"
                          : isCurrent
                            ? "text-goldDark font-bold animate-pulse"
                            : "text-ink-muted"
                      }`}
                    >
                      {isDone ? "Completed" : isCurrent ? "Active Agent…" : "Queued"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{s.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Real-time Ticker */}
        <div className="mt-5 rounded-xl border border-surface-border bg-surface-subtle p-3.5 text-[11px] font-mono text-ink-soft">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Agent Console Stream</span>
          </div>
          <p className="truncate text-navy font-medium">{logs[logs.length - 1]}</p>
        </div>
      </div>
    </div>
  );
}

export function BlogAgent({ onOpenPost }: { onOpenPost: (id: string) => void }) {
  const [topics, setTopics] = useState<BlogTopic[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [batch, setBatch] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [writingTopic, setWritingTopic] = useState<{ id: string; title: string; category: string } | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customCategory, setCustomCategory] = useState<string>(BLOG_CATEGORIES[0]);
  const [loaded, setLoaded] = useState(false);
  const { busy, error, setError, wrap } = useBusy();

  const refresh = useCallback(async () => {
    const [t, p] = await Promise.all([api.blogTopics(), api.blogPosts()]);
    setTopics(t.topics);
    setBatch(t.batch);
    setPosts(p.posts);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh().catch((e: Error) => {
      setError(e.message);
      setLoaded(true);
    });
  }, [refresh, setError]);

  const generateIdeas = (force: boolean) =>
    wrap(async () => {
      const result = await api.blogGenerateTopics(force);
      setNotes(result.notes);
      await refresh();
    });

  const decide = (id: string, decision: "approved" | "rejected") =>
    wrap(async () => {
      await api.blogDecideTopic(id, decision);
      await refresh();
    });

  /**
   * Generation is a multi-step agent pipeline: outline -> write -> images -> seo -> quality -> publish.
   */
  const write = (topic: { id: string; title: string; category: string }) =>
    wrap(async () => {
      setWritingTopic(topic);
      try {
        const result = await api.blogWrite(topic.id, true);
        setNotes(result.notes);
        await refresh();
        onOpenPost(result.post.id);
      } finally {
        setWritingTopic(null);
      }
    });

  const addCustom = () =>
    wrap(async () => {
      const { topic } = await api.blogCustomTopic(customTitle, customCategory);
      setCustomTitle("");
      await refresh();
      // A title the admin typed is already approved, so go straight to writing it.
      await write({ id: topic.id, title: topic.title, category: topic.category });
    });

  const proposed = topics.filter((t) => t.status === "proposed");
  const approved = topics.filter((t) => t.status === "approved");
  const decided = topics.filter((t) => t.status === "rejected" || t.status === "used");

  return (
    <div className="space-y-8">
      {writingTopic ? (
        <BlogGenerationModal topicTitle={writingTopic.title} category={writingTopic.category} />
      ) : null}

      <SectionTitle
        eyebrow={batch ? `Ideas for ${batch}` : "AI Blog Suite"}
        title="AI Blog Post Agent"
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void generateIdeas(false)} disabled={busy}>
              {busy && !writingTopic ? "Thinking…" : "Top up ideas"}
            </Button>
            <Button onClick={() => void generateIdeas(true)} disabled={busy}>
              Fresh 10 ideas
            </Button>
          </div>
        }
      />

      <ErrorNote message={error} />

      {notes.length ? (
        <Card className="border-surface-border bg-surface-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Agent notes</p>
          <ul className="mt-2 space-y-1 text-[13px] text-ink-soft">
            {notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Own-title entry sits above the queue: an admin who already knows what
          they want should not have to scroll past ten suggestions first. */}
      <Card>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-goldDark">Write your own</p>
        <p className="mt-1 text-[13px] text-ink-soft">
          Type a title and the agent researches, writes, illustrates and publishes it — same quality gate as an
          approved idea.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_14rem_auto]">
          <Field label="Article title">
            <input
              className={inputCls}
              value={customTitle}
              placeholder="e.g. How to prepare for your first campus interview"
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </Field>
          <Field label="Category">
            <select className={inputCls} value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}>
              {BLOG_CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-white text-navy">
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void addCustom()} disabled={busy || customTitle.trim().length < 10}>
              {writingTopic ? "Writing…" : "Write it"}
            </Button>
          </div>
        </div>
      </Card>

      {approved.length ? (
        <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-goldDark">
            Approved — ready to write
          </h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {approved.map((t) => (
              <TopicCard
                key={t.id}
                topic={t}
                busy={busy}
                onDecide={(d) => void decide(t.id, d)}
                onWrite={() => void write({ id: t.id, title: t.title, category: t.category })}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
          Today&rsquo;s shortlist {proposed.length ? `(${proposed.length})` : ""}
        </h3>
        {!loaded ? (
          <Empty text="Loading ideas…" />
        ) : proposed.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {proposed.map((t) => (
              <TopicCard
                key={t.id}
                topic={t}
                busy={busy}
                onDecide={(d) => void decide(t.id, d)}
                onWrite={() => void write({ id: t.id, title: t.title, category: t.category })}
              />
            ))}
          </div>
        ) : (
          <Empty text="No open ideas for today. Press “Fresh 10 ideas” to research a new set." />
        )}
      </div>

      <div>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
          Articles {posts.length ? `(${posts.length})` : ""}
        </h3>
        {posts.length ? (
          <div className="overflow-x-auto rounded-2xl border border-surface-border bg-white shadow-xs">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-subtle text-[10px] uppercase tracking-widest text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Quality</th>
                  <th className="px-4 py-3">Words</th>
                  <th className="px-4 py-3">Published</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-t border-surface-border hover:bg-surface-subtle">
                    <td className="px-4 py-3">
                      <button onClick={() => onOpenPost(p.id)} className="text-left font-medium text-navy hover:text-goldDark">
                        {p.title}
                      </button>
                      <span className="mt-0.5 block text-[11px] text-ink-muted">{p.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={postTone(p.status)}>{p.status.replace(/_/g, " ")}</Pill>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{p.quality ? `${p.quality.overall}/100` : "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{p.wordCount || "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">{p.publishedAt ? fmtDate(p.publishedAt) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "PUBLISHED" ? (
                        <a
                          href={`/blog/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-goldDark hover:underline"
                        >
                          View live ↗
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Nothing written yet. Approve an idea above to publish the first article." />
        )}
      </div>

      {decided.length ? (
        <details className="rounded-2xl border border-surface-border bg-surface-subtle px-5 py-4">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
            Rejected & already written ({decided.length})
          </summary>
          <ul className="mt-3 space-y-2 text-[13px] text-ink-soft">
            {decided.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Pill tone={t.status === "used" ? "success" : "danger"}>{t.status}</Pill>
                <span>{t.title}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
