"use client";

// One generated article: exact layout preview, quality findings, provenance,
// the agent run log, and the publish controls.
//
// The preview renders through the SAME <Markdown> component the public page
// uses, on a white surface. A preview that approximates the real layout is
// worse than none — the admin is being asked "does this look right on the
// site?", so they have to be looking at the site's own rendering.

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { api, fmtDate } from "../api";
import { Button, Card, Empty, ErrorNote, Field, Pill, SectionTitle, inputCls, useBusy } from "../ui";
import Markdown from "@/components/blog/Markdown";
import type { BlogAgentRun, BlogImage, BlogPost, BlogQualityIssue } from "@/lib/marketing/blog/domain";

type Tab = "preview" | "quality" | "seo" | "edit" | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "quality", label: "Quality" },
  { id: "seo", label: "SEO" },
  { id: "edit", label: "Edit" },
  { id: "activity", label: "Agent activity" },
];

function issueTone(severity: BlogQualityIssue["severity"]): "danger" | "info" | "neutral" {
  return severity === "critical" ? "danger" : severity === "warning" ? "info" : "neutral";
}

function QualityPanel({ post }: { post: BlogPost }) {
  const quality = post.quality;
  if (!quality) return <Empty text="This article has not been scored." />;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="font-display text-4xl font-extrabold text-brand-gold">{quality.overall}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40">out of 100</p>
          </div>
          <Pill tone={quality.verdict === "pass" ? "success" : "danger"}>
            {quality.verdict === "pass" ? "Passed the gate" : "Held for review"}
          </Pill>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {Object.entries(quality.breakdown).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-[11px] uppercase tracking-wide text-white/45">{key}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full bg-brand-gold"
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </span>
              <span className="w-9 text-right text-[11px] text-white/55">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      {quality.issues.length ? (
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Findings ({quality.issues.length})
          </p>
          <ul className="mt-3 space-y-3">
            {quality.issues.map((issue, i) => (
              <li key={i} className="flex gap-3">
                <Pill tone={issueTone(issue.severity)}>{issue.severity}</Pill>
                <span className="flex-1 text-[13px] leading-relaxed text-white/70">{issue.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-[13px] text-white/60">No findings — nothing in the article tripped a check.</p>
        </Card>
      )}

      {quality.revisions.length ? (
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
            What the revision pass fixed
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-white/60">
            {quality.revisions.map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Provenance. Every figure the writer was allowed to state about the
          college, so a suspicious number can be traced rather than argued about. */}
      <details className="rounded-2xl border border-white/10 px-5 py-4">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Facts the writer was given ({Object.keys(post.grounding).length})
        </summary>
        <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          {Object.entries(post.grounding).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <dt className="text-[10px] uppercase tracking-widest text-white/35">{k}</dt>
              <dd className="mt-0.5 text-white/65">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function SeoPanel({ post }: { post: BlogPost }) {
  const { seo } = post;
  return (
    <div className="space-y-5">
      <Card>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Google result preview</p>
        <div className="mt-3 rounded-xl bg-white p-4">
          <p className="text-[13px] text-[#4d5156]">bvcits.edu.in › blog › {seo.slug}</p>
          <p className="mt-0.5 text-[19px] leading-snug text-[#1a0dab]">{seo.seoTitle}</p>
          <p className="mt-1 text-[13px] leading-snug text-[#4d5156]">{seo.metaDescription}</p>
        </div>
        <p className="mt-2 text-[11px] text-white/35">
          Title {seo.seoTitle.length} chars · description {seo.metaDescription.length} chars
        </p>
      </Card>

      <Card>
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Target phrase</dt>
            <dd className="mt-1 text-brand-gold">{seo.primaryKeyword || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Supporting phrases</dt>
            <dd className="mt-1 text-white/65">{seo.secondaryKeywords.join(" · ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Internal links</dt>
            <dd className="mt-1 text-white/65">{seo.internalLinks.map((l) => l.href).join(" · ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-white/40">Sections</dt>
            <dd className="mt-1 text-white/65">{seo.h2Structure.length} H2 headings</dd>
          </div>
        </dl>
        {seo.repaired.length ? (
          <p className="mt-4 rounded-lg border border-brand-maroon/40 bg-brand-maroon/10 px-3 py-2 text-[12px] text-red-200">
            The model returned an unusable value for: {seo.repaired.join(", ")}. Those fields fell back to the
            deterministic defaults.
          </p>
        ) : null}
      </Card>

      <details className="rounded-2xl border border-white/10 px-5 py-4">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Structured data (JSON-LD)
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-black/50 p-4 text-[11px] leading-relaxed text-white/60">
          {JSON.stringify(seo.schemaJsonLd, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function BlogPostDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [images, setImages] = useState<BlogImage[]>([]);
  const [runs, setRuns] = useState<BlogAgentRun[]>([]);
  const [tab, setTab] = useState<Tab>("preview");
  const [draft, setDraft] = useState({ title: "", excerpt: "", bodyMd: "" });
  const { busy, error, setError, wrap } = useBusy();

  const load = useCallback(async () => {
    const data = await api.blogPost(id);
    setPost(data.post);
    setImages(data.images);
    setRuns(data.runs);
    setDraft({ title: data.post.title, excerpt: data.post.excerpt, bodyMd: data.post.bodyMd });
  }, [id]);

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, [load, setError]);

  const act = (body: Record<string, unknown>) =>
    wrap(async () => {
      await api.blogPostAction(id, body);
      await load();
    });

  if (!post) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <ErrorNote message={error} />
        {!error ? <Empty text="Loading article…" /> : null}
      </div>
    );
  }

  const hero = images.find((i) => i.placement === "hero");
  const criticalCount = post.quality?.issues.filter((i) => i.severity === "critical").length ?? 0;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        ← Back to Blog Agent
      </Button>

      <SectionTitle
        eyebrow={post.category}
        title={post.title}
        right={
          <div className="flex flex-wrap gap-2">
            {post.status === "PUBLISHED" ? (
              <>
                <a
                  href={`/blog/${post.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/85 hover:border-brand-gold/50 hover:text-brand-gold"
                >
                  View live ↗
                </a>
                <Button variant="danger" onClick={() => void act({ action: "unpublish" })} disabled={busy}>
                  Unpublish
                </Button>
              </>
            ) : (
              <Button onClick={() => void act({ action: "publish" })} disabled={busy}>
                {criticalCount ? `Publish anyway (${criticalCount} critical)` : "Publish"}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/45">
        <Pill tone={post.status === "PUBLISHED" ? "success" : post.status === "FAILED" ? "danger" : "info"}>
          {post.status.replace(/_/g, " ")}
        </Pill>
        <span>/blog/{post.slug}</span>
        <span aria-hidden>·</span>
        <span>{post.wordCount} words · {post.readingMinutes} min read</span>
        {post.publishedAt ? (
          <>
            <span aria-hidden>·</span>
            <span>published {fmtDate(post.publishedAt)}</span>
          </>
        ) : null}
      </div>

      <ErrorNote message={error} />
      {post.publishError ? <ErrorNote message={post.publishError} /> : null}

      {criticalCount ? (
        <div className="rounded-xl border border-brand-maroon/50 bg-brand-maroon/15 px-4 py-3 text-[13px] text-red-200">
          Held back: {criticalCount} critical finding{criticalCount === 1 ? "" : "s"} on the Quality tab. Fix the copy
          on the Edit tab, or publish anyway if you disagree with the check — the override is recorded against your
          name.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? "border-b-2 border-brand-gold text-brand-gold" : "text-white/50 hover:text-white/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "preview" ? (
        <div className="overflow-hidden rounded-2xl bg-white">
          {hero ? (
            <div className="relative aspect-[16/9] w-full">
              <Image src={hero.url} alt={hero.alt} fill sizes="900px" className="object-cover" unoptimized />
            </div>
          ) : null}
          <div className="px-6 py-8 md:px-10 md:py-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-crimson">{post.category}</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight text-navy">{post.title}</h1>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">{post.excerpt}</p>
            <hr className="mt-8 border-surface-border" />
            <Markdown source={post.bodyMd} />
          </div>
        </div>
      ) : null}

      {tab === "quality" ? <QualityPanel post={post} /> : null}
      {tab === "seo" ? <SeoPanel post={post} /> : null}

      {tab === "edit" ? (
        <div className="space-y-4">
          <Field label="Title">
            <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label="Excerpt / meta description">
            <textarea
              className={`${inputCls} min-h-[5rem]`}
              value={draft.excerpt}
              onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
            />
          </Field>
          <Field label="Article body (markdown)">
            <textarea
              className={`${inputCls} min-h-[28rem] font-mono text-[13px] leading-relaxed`}
              value={draft.bodyMd}
              onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })}
            />
          </Field>
          <p className="text-[12px] text-white/40">
            The URL <span className="text-white/60">/blog/{post.slug}</span> is fixed — changing it would break every
            link already shared.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void act({ title: draft.title, excerpt: draft.excerpt, bodyMd: draft.bodyMd })
              }
              disabled={busy}
            >
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setDraft({ title: post.title, excerpt: post.excerpt, bodyMd: post.bodyMd })} disabled={busy}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <Card>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Images</p>
            {images.length ? (
              <ul className="mt-3 space-y-2 text-[12px]">
                {images.map((img) => (
                  <li key={img.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
                    <span className="text-white/70">
                      {img.placement}
                      {img.sectionIndex != null ? ` #${img.sectionIndex}` : ""} · {img.width}×{img.height}
                    </span>
                    <Pill tone={img.photoBacked ? "success" : "neutral"}>
                      {img.photoBacked ? "real photograph" : "brand graphic"}
                    </Pill>
                    <span className="mt-1 block text-white/40">{img.sourceNote}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-white/45">No images were generated for this article.</p>
            )}
          </Card>

          {runs.length ? (
            <div className="overflow-x-auto rounded-2xl border border-brand-gold/15">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-white/45">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Took</th>
                    <th className="px-4 py-3">At</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium text-white/85">{r.agentName}</td>
                      <td className="px-4 py-3">
                        <Pill tone={r.status === "success" ? "success" : r.status === "failed" ? "danger" : "neutral"}>
                          {r.status}
                        </Pill>
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {r.summary}
                        {r.error ? <span className="mt-1 block text-red-300">{r.error}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-white/45">{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="px-4 py-3 text-white/40">{fmtDate(r.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No agent runs recorded." />
          )}
        </div>
      ) : null}
    </div>
  );
}
