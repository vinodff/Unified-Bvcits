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
    <Card className={decided ? "opacity-70" : ""}>
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
          <h3 className="mt-3 font-display text-base font-bold leading-snug text-brand-white">{topic.title}</h3>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Angle</dt>
          <dd className="mt-1 leading-relaxed text-white/70">{topic.angle}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Why it is worth writing</dt>
          <dd className="mt-1 leading-relaxed text-white/70">{topic.rationale}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-white/40">What people search</dt>
          <dd className="mt-1 leading-relaxed text-white/70">
            <span className="font-medium text-brand-gold">{topic.primaryKeyword}</span>
            {topic.secondaryKeywords.length ? (
              <span className="text-white/45"> · {topic.secondaryKeywords.slice(0, 3).join(" · ")}</span>
            ) : null}
            <span className="mt-1 block text-white/45">{topic.searchIntent}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-white/40">How it serves BVCITS</dt>
          <dd className="mt-1 leading-relaxed text-white/70">{topic.promoAngle}</dd>
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

export function BlogAgent({ onOpenPost }: { onOpenPost: (id: string) => void }) {
  const [topics, setTopics] = useState<BlogTopic[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [batch, setBatch] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [writingId, setWritingId] = useState<string | null>(null);
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
   * Generation is a long request — four model calls plus image compositing.
   * The per-topic `writingId` is what stops the admin from firing a second run
   * while the first is in flight, which would burn quota and race on the slug.
   */
  const write = (topicId: string) =>
    wrap(async () => {
      setWritingId(topicId);
      try {
        const result = await api.blogWrite(topicId, true);
        setNotes(result.notes);
        await refresh();
        onOpenPost(result.post.id);
      } finally {
        setWritingId(null);
      }
    });

  const addCustom = () =>
    wrap(async () => {
      const { topic } = await api.blogCustomTopic(customTitle, customCategory);
      setCustomTitle("");
      await refresh();
      // A title the admin typed is already approved, so go straight to writing it.
      await write(topic.id);
    });

  const proposed = topics.filter((t) => t.status === "proposed");
  const approved = topics.filter((t) => t.status === "approved");
  const decided = topics.filter((t) => t.status === "rejected" || t.status === "used");

  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow={batch ? `Ideas for ${batch}` : "Blog Agent"}
        title="Blog Agent"
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void generateIdeas(false)} disabled={busy}>
              {busy && !writingId ? "Thinking…" : "Top up ideas"}
            </Button>
            <Button onClick={() => void generateIdeas(true)} disabled={busy}>
              Fresh 10 ideas
            </Button>
          </div>
        }
      />

      <ErrorNote message={error} />

      {notes.length ? (
        <Card className="border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Agent notes</p>
          <ul className="mt-2 space-y-1 text-[13px] text-white/60">
            {notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Own-title entry sits above the queue: an admin who already knows what
          they want should not have to scroll past ten suggestions first. */}
      <Card>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-gold">Write your own</p>
        <p className="mt-1 text-[13px] text-white/55">
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
                <option key={c} value={c} className="bg-brand-black">
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void addCustom()} disabled={busy || customTitle.trim().length < 10}>
              {writingId ? "Writing…" : "Write it"}
            </Button>
          </div>
        </div>
      </Card>

      {approved.length ? (
        <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Approved — ready to write
          </h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {approved.map((t) => (
              <TopicCard
                key={t.id}
                topic={t}
                busy={busy}
                onDecide={(d) => void decide(t.id, d)}
                onWrite={() => void write(t.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/45">
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
                onWrite={() => void write(t.id)}
              />
            ))}
          </div>
        ) : (
          <Empty text="No open ideas for today. Press “Fresh 10 ideas” to research a new set." />
        )}
      </div>

      <div>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/45">
          Articles {posts.length ? `(${posts.length})` : ""}
        </h3>
        {posts.length ? (
          <div className="overflow-x-auto rounded-2xl border border-brand-gold/15">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-white/45">
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
                  <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <button onClick={() => onOpenPost(p.id)} className="text-left font-medium text-white hover:text-brand-gold">
                        {p.title}
                      </button>
                      <span className="mt-0.5 block text-[11px] text-white/35">{p.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={postTone(p.status)}>{p.status.replace(/_/g, " ")}</Pill>
                    </td>
                    <td className="px-4 py-3 text-white/70">{p.quality ? `${p.quality.overall}/100` : "—"}</td>
                    <td className="px-4 py-3 text-white/70">{p.wordCount || "—"}</td>
                    <td className="px-4 py-3 text-white/50">{p.publishedAt ? fmtDate(p.publishedAt) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "PUBLISHED" ? (
                        <a
                          href={`/blog/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-brand-gold hover:underline"
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
        <details className="rounded-2xl border border-white/10 px-5 py-4">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Rejected & already written ({decided.length})
          </summary>
          <ul className="mt-3 space-y-2 text-[13px] text-white/50">
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
