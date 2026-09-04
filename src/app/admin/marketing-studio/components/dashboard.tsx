"use client";

import { useMemo, useState } from "react";
import type { Campaign } from "@/lib/marketing/domain";
import { Button, Card, Empty, Pill, SectionTitle, StatusPill } from "../ui";
import {
  Sparkles,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  PenTool,
} from "lucide-react";

export function Dashboard({
  campaigns,
  onOpen,
  onRefresh,
  onFilter,
  onCreate,
  onOpenBlog,
}: {
  campaigns: Campaign[];
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onFilter: (f: string) => void;
  onCreate?: () => void;
  onOpenBlog?: () => void;
}) {
  const [filter, setFilterLocal] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const counts = useMemo(() => {
    const c = {
      total: campaigns.length,
      published: campaigns.filter((x) => x.status === "PUBLISHED" || x.status === "SCHEDULED" || x.status === "APPROVED").length,
      review: campaigns.filter((x) => x.status === "READY_FOR_REVIEW").length,
      generating: campaigns.filter((x) => x.status === "GENERATING").length,
      drafts: campaigns.filter((x) => x.status === "DRAFT" || x.status === "NEEDS_INFORMATION").length,
      attention: campaigns.filter((x) => x.status === "CHANGES_REQUESTED" || x.status === "GENERATION_FAILED" || x.status === "PUBLISH_FAILED").length,
    };
    return c;
  }, [campaigns]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  const visible = useMemo(() => {
    if (!filter) return campaigns;
    if (filter === "review") return campaigns.filter((c) => c.status === "READY_FOR_REVIEW");
    if (filter === "generating") return campaigns.filter((c) => c.status === "GENERATING");
    if (filter === "published") return campaigns.filter((c) => ["PUBLISHED", "SCHEDULED", "APPROVED"].includes(c.status));
    if (filter === "drafts") return campaigns.filter((c) => ["DRAFT", "NEEDS_INFORMATION"].includes(c.status));
    if (filter === "attention") return campaigns.filter((c) => ["CHANGES_REQUESTED", "GENERATION_FAILED", "PUBLISH_FAILED"].includes(c.status));
    return campaigns.filter((c) => c.status === filter);
  }, [campaigns, filter]);

  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [visible]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-gold ring-4 ring-goldLight/50 animate-pulse" />
            <p className="eyebrow text-goldDark font-bold uppercase tracking-[0.14em] text-xs">Autonomous Marketing Agent</p>
          </div>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-navy sm:text-3xl">Marketing Studio Dashboard</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Orchestrate multi-channel institutional campaigns and autonomous content pipelines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void handleRefresh()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-surface-border bg-white px-3.5 py-2 text-xs font-semibold text-ink-soft shadow-xs transition hover:border-gold hover:text-navy hover:shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-goldDark" : ""}`} />
            <span>Refresh</span>
          </button>
          {onOpenBlog && (
            <button
              onClick={onOpenBlog}
              className="inline-flex items-center gap-1.5 rounded-xl border border-surface-border bg-white px-3.5 py-2 text-xs font-bold text-navy shadow-xs transition hover:border-crimson hover:text-crimson hover:shadow-sm"
            >
              <PenTool className="h-3.5 w-3.5 text-crimson" />
              <span>AI Blog Agent</span>
            </button>
          )}
          {onCreate && (
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 font-display text-xs font-bold text-navy shadow-sm transition hover:bg-gold-400 hover:shadow-md"
            >
              <Plus className="h-4 w-4" />
              <span>New Campaign</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <div
          onClick={() => { setFilterLocal(""); onFilter(""); }}
          className={`cursor-pointer rounded-2xl border p-4 shadow-card transition ${filter === "" ? "border-gold bg-goldLight/20 ring-1 ring-gold" : "border-surface-border bg-white hover:border-gold hover:shadow-lift"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Total Campaigns</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-subtle text-navy">
              <Sparkles className="h-4 w-4 text-goldDark" />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-black text-navy">{counts.total}</p>
          <p className="mt-1 text-[11px] font-medium text-ink-soft">All active campaigns</p>
        </div>

        <div
          onClick={() => { const next = filter === "review" ? "" : "review"; setFilterLocal(next); onFilter(next); }}
          className={`cursor-pointer rounded-2xl border p-4 shadow-card transition ${filter === "review" ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-400" : "border-surface-border bg-white hover:border-blue-300 hover:shadow-lift"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Ready for Review</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-black text-blue-900">{counts.review}</p>
          <p className="mt-1 text-[11px] font-medium text-blue-700">Awaiting admin approval</p>
        </div>

        <div
          onClick={() => { const next = filter === "published" ? "" : "published"; setFilterLocal(next); onFilter(next); }}
          className={`cursor-pointer rounded-2xl border p-4 shadow-card transition ${filter === "published" ? "border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-400" : "border-surface-border bg-white hover:border-emerald-300 hover:shadow-lift"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Live / Scheduled</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-black text-emerald-900">{counts.published}</p>
          <p className="mt-1 text-[11px] font-medium text-emerald-700">Approved &amp; scheduled</p>
        </div>

        <div
          onClick={() => { const next = filter === "drafts" ? "" : "drafts"; setFilterLocal(next); onFilter(next); }}
          className={`cursor-pointer rounded-2xl border p-4 shadow-card transition ${filter === "drafts" ? "border-amber-400 bg-amber-50/50 ring-1 ring-amber-400" : "border-surface-border bg-white hover:border-amber-300 hover:shadow-lift"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900">Drafts / In Progress</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <FileText className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-black text-amber-900">{counts.drafts + counts.generating}</p>
          <p className="mt-1 text-[11px] font-medium text-amber-800">
            {counts.generating > 0 ? `${counts.generating} generating right now` : "Wizard drafts"}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "", label: "All Campaigns", count: counts.total },
            { id: "review", label: "Ready for Review", count: counts.review },
            { id: "generating", label: "Generating", count: counts.generating },
            { id: "published", label: "Published", count: counts.published },
            { id: "drafts", label: "Drafts", count: counts.drafts },
            { id: "attention", label: "Needs Attention", count: counts.attention },
          ].map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setFilterLocal(tab.id);
                  onFilter(tab.id);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? "bg-navy text-white shadow-xs"
                    : "text-ink-soft hover:bg-white hover:text-navy"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    active ? "bg-white/20 text-white" : "bg-surface-subtle text-ink-muted"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Campaign List */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-white p-12 text-center shadow-card">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface-subtle text-ink-muted">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="mt-3 font-display text-lg font-bold text-navy">
            {filter ? `No campaigns matching "${filter}"` : "No campaigns created yet"}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            {filter
              ? "Try resetting the filter to see all active campaigns."
              : "Launch your first multi-platform campaign with autonomous AI creative agents."}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {filter ? (
              <button
                onClick={() => { setFilterLocal(""); onFilter(""); }}
                className="rounded-xl border border-surface-border bg-white px-4 py-2 text-xs font-bold text-navy shadow-xs transition hover:border-gold"
              >
                Clear Filter
              </button>
            ) : onCreate ? (
              <button
                onClick={onCreate}
                className="rounded-xl bg-gold px-5 py-2.5 font-display text-xs font-bold text-navy shadow-sm transition hover:bg-gold-400"
              >
                Create First Campaign
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <div
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="group cursor-pointer rounded-2xl border border-surface-border bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lift"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-bold text-navy transition group-hover:text-goldDark">
                      {c.title || "Untitled Campaign"}
                    </h3>
                    <span className="rounded-md border border-surface-border bg-surface-subtle px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      {c.type || "General"}
                    </span>
                  </div>

                  <p className="mt-1.5 text-xs text-ink-muted">
                    <span className="font-mono text-ink-soft">{c.id}</span>
                    <span className="mx-1.5">·</span>
                    <span>Updated {new Date(c.updatedAt || Date.now()).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {c.publishedAt && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span className="text-emerald-700 font-semibold">Published {new Date(c.publishedAt).toLocaleString("en-IN", { day: "2-digit", month: "short" })}</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <StatusPill status={c.status} />
                  <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-subtle px-3 py-1.5 text-xs font-bold text-navy transition group-hover:border-gold group-hover:bg-goldLight/20 group-hover:text-goldDark">
                    <span>{c.status === "READY_FOR_REVIEW" ? "Review" : "Open"}</span>
                    <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}