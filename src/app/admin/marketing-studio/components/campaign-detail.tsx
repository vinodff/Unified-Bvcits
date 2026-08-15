"use client";

// Campaign detail — the heart of the Studio: facts, assistant chat, content
// previews, media upload, quality/SEO, agent runs, approval & scheduling.

import { useCallback, useMemo, useRef, useState } from "react";
import { api, fmtDate, type CampaignDetail } from "../api";
import { Button, Card, Empty, ErrorNote, Field, inputCls, Pill, SectionTitle, StatusPill, Modal, useBusy } from "../ui";

type Tab = "overview" | "facts" | "content" | "media" | "seo" | "agents";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "facts", label: "Facts & Assistant" },
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "seo", label: "SEO & Quality" },
  { id: "agents", label: "Agent Runs" },
];

const PLATFORMS = ["website", "instagram", "facebook", "linkedin", "whatsapp"] as const;

export function mediaUrl(originalFile: string): string {
  const rel = originalFile.replace(/^.*marketing[\\/]/, "").replace(/\\/g, "/");
  return `/api/marketing/media?path=${encodeURIComponent(rel)}`;
}

export function CampaignDetailView({ id, detail, onBack, onReload }: { id: string; detail: CampaignDetail | null; onBack: () => void; onReload: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [approveOpen, setApproveOpen] = useState(false);
  const { busy: genBusy, error: genError, setError: setGenError, wrap: wrapGen } = useBusy();
  const { busy: askBusy, error: askError, wrap: wrapAsk } = useBusy();
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);
  const [factTexts, setFactTexts] = useState<Record<string, string>>({});
  const [dirtyFacts, setDirtyFacts] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const run = useCallback(() => {
    void wrapGen(async () => {
      await api.generate(id);
      onReload();
      setChat([]);
    });
  }, [id, wrapGen, onReload]);

  if (!detail) return <Empty text="Loading…" />;
  const { campaign, facts, content, assets, approvals, seo, quality, runs, supervisor, jobs, audit } = detail;
  const latestApproval = approvals.find((a) => a.status === "approved");
  const isReviewable = campaign.status === "READY_FOR_REVIEW" || campaign.status === "APPROVED";
  const platformJobs = jobs.filter((j) => j.status !== "canceled");

  const ask = () => {
    if (!msg.trim()) return;
    const text = msg;
    setMsg("");
    setChat((c) => [...c, { role: "admin", text }]);
    void wrapAsk(async () => {
      const res = await api.ask(id, text);
      setChat((c) => [...c, { role: "assistant", text: res.reply }]);
      onReload();
    });
  };

  const saveFacts = () => {
    const updated = facts.map((f) => ({ ...f, value: factTexts[f.field] ?? String(f.value) }));
    void wrapGen(async () => {
      await api.patch(id, { facts: updated });
      setDirtyFacts(false);
      onReload();
    });
  };

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);
    void (async () => {
      try {
        await api.uploadAssets(id, Array.from(files));
        onReload();
      } catch (e) {
        setUploadError((e as Error).message);
      }
    })();
  };

  const approve = (platforms: string[], scheduledAt: string) => {
    void wrapGen(async () => {
      await api.approve(id, platforms as never, scheduledAt);
      setApproveOpen(false);
      onReload();
    });
  };

  const deleteCampaign = () => {
    if (!confirm(`Delete campaign "${campaign.title}"?`)) return;
    void api.del(id).then(onBack);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={onBack} className="mb-1 text-xs text-white/40 hover:text-brand-gold">← Back to campaigns</button>
          <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-brand-white">{campaign.title}</h2>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusPill status={campaign.status} />
            <span className="text-xs text-white/40">{campaign.type} · {campaign.id}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void onReload()}>Refresh</Button>
          <Button variant="danger" onClick={deleteCampaign}>Delete</Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-white/10 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3.5 py-2 text-sm transition ${tab === t.id ? "border-b-2 border-brand-gold font-semibold text-brand-gold" : "text-white/50 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorNote message={genError ?? askError} />

      {tab === "overview" && (
        <div className="space-y-5">
          <Card>
            <SectionTitle eyebrow="Supervisor" title="Pipeline status" />
            {supervisor ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(supervisor.steps).map(([step, st]) => (
                  <div key={step} className="rounded-lg bg-white/[0.03] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest text-white/45">{step.replace(/_/g, " ")}</p>
                    <Pill tone={st === "done" || st === "approved" || st === "published" ? "success" : st === "failed" ? "danger" : "neutral"}>{st}</Pill>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="No pipeline state yet." />
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {isReviewable ? (
                <Button onClick={() => setApproveOpen(true)}>Approve & Schedule</Button>
              ) : (
                <Button onClick={() => void run()} disabled={genBusy || campaign.status === "GENERATING"}>
                  {genBusy ? "Running pipeline…" : "Run Agent Pipeline"}
                </Button>
              )}
              <Button variant="ghost" onClick={() => void api.tick()}>Run worker tick</Button>
            </div>
          </Card>

          {platformJobs.length > 0 && (
            <Card>
              <SectionTitle eyebrow="Queue" title="Publish jobs" />
              <div className="space-y-2">
                {platformJobs.map((j) => (
                  <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-brand-white">{j.platform}</p>
                      <p className="text-xs text-white/40">v{j.contentVersion} · {fmtDate(j.scheduledFor)}{j.platformPostId ? ` · post ${j.platformPostId}` : ""}</p>
                      {j.error && <p className="mt-0.5 text-xs text-red-300">{j.error}</p>}
                    </div>
                    <StatusPill status={j.status} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {audit.length > 0 && (
            <Card>
              <SectionTitle eyebrow="Audit" title="Recent activity" />
              <div className="max-h-56 space-y-1.5 overflow-y-auto text-xs">
                {audit.slice(0, 12).map((a) => (
                  <div key={a.id} className="flex justify-between gap-3 rounded bg-white/[0.02] px-2.5 py-1.5">
                    <span className="text-white/60">{a.actor} · <span className="text-brand-gold">{a.action}</span></span>
                    <span className="shrink-0 text-white/35">{fmtDate(a.at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "facts" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <SectionTitle eyebrow="Assistant" title="AI Content Assistant" />
            <p className="mb-3 text-xs text-white/45">
              Answer the assistant's questions in natural language — it extracts facts deterministically. Admin answers override AI observations.
            </p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {chat.length === 0 && (
                <p className="text-sm text-white/40">Start the conversation — e.g. paste the event description from your email.</p>
              )}
              {chat.map((c, i) => (
                <div key={i} className={`rounded-xl px-3 py-2 text-sm ${c.role === "admin" ? "ml-8 bg-brand-gold/10 text-brand-gold" : "mr-8 bg-white/5 text-white/80"}`}>
                  {c.text}
                </div>
              ))}
              {askBusy && <p className="text-xs text-white/40">Assistant is thinking…</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Reply to the assistant…" className={inputCls} />
              <Button onClick={ask} disabled={!msg.trim()}>Send</Button>
            </div>
          </Card>

          <Card>
            <SectionTitle eyebrow="Fact base" title={`${facts.length} facts`} right={<Button variant="ghost" onClick={saveFacts} disabled={!dirtyFacts}>Save facts</Button>} />
            {facts.length === 0 ? (
              <Empty text="No facts extracted yet — ask the assistant or type the event details." />
            ) : (
              <div className="space-y-2">
                {facts.map((f) => (
                  <div key={f.field} className="rounded-lg bg-white/[0.03] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">{f.field}</p>
                      <span className="text-[9px] text-white/35">{f.source}{f.verified ? " · verified" : ""}</span>
                    </div>
                    <input
                      defaultValue={factTexts[f.field] ?? String(f.value)}
                      onChange={(e) => {
                        setFactTexts((x) => ({ ...x, [f.field]: e.target.value }));
                        setDirtyFacts(true);
                      }}
                      className="mt-1 w-full rounded bg-transparent text-sm text-white/85 outline-none focus:text-brand-gold"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "content" && (
        <div className="space-y-4">
          {content.length === 0 && <Empty text="No content generated yet — run the pipeline." />}
          {content.map((cv) => (
            <Card key={cv.id}>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-display text-sm font-bold text-brand-white">{cv.platform} <span className="ml-1 text-white/35">v{cv.version}</span></p>
                <StatusPill status={cv.status} />
              </div>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/[0.03] p-3 text-sm text-white/75">{cv.body}</pre>
            </Card>
          ))}
        </div>
      )}

      {tab === "media" && (
        <div className="space-y-5">
          <Card>
            <SectionTitle eyebrow="Uploads" title="Source photographs" right={
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
                <Button onClick={() => fileRef.current?.click()}>Upload photos</Button>
              </div>
            } />
            <ErrorNote message={uploadError} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {assets.filter((a) => !a.aiGenerated).map((a) => (
                <div key={a.id} className="group overflow-hidden rounded-xl border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(a.originalFile)} alt={a.metadata?.originalName as string ?? "photo"} className="h-36 w-full object-cover" />
                  <div className="px-2 py-1.5 text-[10px] text-white/45">
                    {(a.observations ?? []).slice(0, 1).join(" ") || "No observations yet — run pipeline to analyze."}
                  </div>
                </div>
              ))}
              {assets.filter((a) => !a.aiGenerated).length === 0 && <div className="col-span-full"><Empty text="Upload real event photographs — AI never fabricates people or winners." /></div>}
            </div>
          </Card>
          <Card>
            <SectionTitle eyebrow="Creatives" title="AI-composed brand graphics" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {assets.filter((a) => a.aiGenerated).map((a) => (
                <div key={a.id} className="overflow-hidden rounded-xl border border-brand-gold/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(a.originalFile)} alt={`${a.metadata?.platform as string} creative`} className="h-44 w-full object-cover" />
                  <div className="px-2 py-1.5 text-[10px] text-white/45">{(a.metadata?.platform as string) ?? "creative"} · {(a.metadata?.variant as string) ?? ""}</div>
                </div>
              ))}
              {assets.filter((a) => a.aiGenerated).length === 0 && <div className="col-span-full"><Empty text="Run the pipeline to compose platform graphics from your photos." /></div>}
            </div>
          </Card>
        </div>
      )}

      {tab === "seo" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <SectionTitle eyebrow="SEO Agent" title="Metadata" />
            {seo ? (
              <div className="space-y-2 text-sm">
                <p><span className="text-white/40">Title:</span> <span className="text-brand-white">{seo.seoTitle}</span></p>
                <p><span className="text-white/40">Description:</span> <span className="text-white/75">{seo.metaDescription}</span></p>
                <p><span className="text-white/40">Intent:</span> <span className="text-white/75">{(seo as { primaryIntent?: string }).primaryIntent ?? "—"}</span></p>
                <p><span className="text-white/40">Internal links:</span> <span className="text-white/75">{(seo as { internalLinks?: { href: string }[] }).internalLinks?.map((l) => l.href).join(", ") ?? "—"}</span></p>
              </div>
            ) : (
              <Empty text="Run the pipeline to generate SEO metadata." />
            )}
          </Card>
          <Card>
            <SectionTitle eyebrow="Quality Control" title="AI Content Quality Assessment" />
            {quality ? (
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <span className={`font-display text-4xl font-extrabold ${quality.verdict === "pass" ? "text-brand-gold" : "text-red-400"}`}>{quality.overall}</span>
                  <div>
                    <Pill tone={quality.verdict === "pass" ? "success" : "danger"}>{quality.verdict === "pass" ? "PASS" : "NEEDS CORRECTION"}</Pill>
                    <p className="mt-1 text-xs text-white/40">Transparent rule-based score — not a Google ranking.</p>
                  </div>
                </div>
                {quality.issues.length > 0 && (
                  <ul className="space-y-1 text-xs text-white/60">
                    {quality.issues.slice(0, 8).map((i, idx) => (
                      <li key={idx} className="flex gap-2"><span className={i.severity === "critical" ? "text-red-400" : "text-amber-300"}>{i.severity === "critical" ? "●" : "○"}</span>{i.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <Empty text="Run the pipeline to run the quality gate." />
            )}
          </Card>
        </div>
      )}

      {tab === "agents" && (
        <Card>
          <SectionTitle eyebrow="Supervisor" title="Agent runs" />
          {runs.length === 0 ? (
            <Empty text="No agent runs yet — run the pipeline." />
          ) : (
            <div className="space-y-2">
              {runs.slice().reverse().map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-white">{r.agentName}</p>
                    <p className="truncate text-xs text-white/45">{r.summary}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={r.status === "success" ? "success" : r.status === "failed" ? "danger" : "neutral"}>{r.status}</Pill>
                    <span className="text-[10px] text-white/35">{r.durationMs != null ? `${r.durationMs}ms` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <ApproveModal
        open={approveOpen}
        campaignId={id}
        campaignStatus={campaign.status}
        contentPlatforms={content.map((c) => c.platform)}
        defaultScheduledAt={latestApproval?.scheduledAt ?? undefined}
        onClose={() => setApproveOpen(false)}
        onApprove={approve}
        busy={genBusy}
        error={genError}
      />
    </div>
  );
}

function ApproveModal({
  open,
  campaignStatus,
  contentPlatforms,
  defaultScheduledAt,
  onClose,
  onApprove,
  busy,
  error,
}: {
  open: boolean;
  campaignId: string;
  campaignStatus: string;
  contentPlatforms: string[];
  defaultScheduledAt?: string | null;
  onClose: () => void;
  onApprove: (platforms: string[], scheduledAt: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS.filter((p) => contentPlatforms.includes(p)));
  const [when, setWhen] = useState(() => {
    const d = new Date(defaultScheduledAt ?? Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  if (!open) return null;
  const usable = PLATFORMS.filter((p) => contentPlatforms.includes(p));
  const toggle = (p: string) => setPlatforms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));

  return (
    <Modal open={open} onClose={onClose} title="Approve & schedule">
      <p className="mb-4 text-sm text-white/60">
        Approving sends the campaign to the platform schedulers (Instagram/Facebook) or queues it for due-time publishing (LinkedIn/WhatsApp/website). Post-approval edits invalidate this approval automatically.
      </p>
      {campaignStatus === "APPROVED" && <p className="mb-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">Already approved — this re-approves with the new schedule.</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        {usable.map((p) => (
          <button
            key={p}
            onClick={() => toggle(p)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${platforms.includes(p) ? "border-brand-gold bg-brand-gold/15 text-brand-gold" : "border-white/15 text-white/50 hover:border-white/30"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <Field label="Publish at (all selected platforms)">
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
      </Field>
      <ErrorNote message={error} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onApprove(platforms, new Date(when).toISOString())} disabled={busy || platforms.length === 0 || !when}>
          {busy ? "Approving…" : "Approve & Schedule"}
        </Button>
      </div>
    </Modal>
  );
}