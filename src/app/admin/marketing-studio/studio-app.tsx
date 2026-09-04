"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type CampaignDetail } from "./api";
import { LoginScreen } from "./components/login-screen";
import { Dashboard } from "./components/dashboard";
import { CreateCampaign } from "./components/create-campaign";
import { ReviewQueue } from "./components/review-queue";
import { CalendarView } from "./components/calendar";
import { CampaignDetailView } from "./components/campaign-detail";
import { CampaignIntake } from "./components/campaign-intake";
import { SocialAccounts } from "./components/social-accounts";
import { MediaLibrary } from "./components/media-library";
import { SeoPage } from "./components/seo-page";
import { AnalyticsView } from "./components/analytics";
import { Activity } from "./components/activity";
import { BlogAgent } from "./components/blog-agent";
import { BlogPostDetail } from "./components/blog-post-detail";
import type { Campaign } from "@/lib/marketing/domain";

import type { ComponentType } from "react";
import {
  LayoutGrid,
  Plus,
  PenTool,
  ClipboardCheck,
  CalendarDays,
  Send,
  FileText,
  Share2,
  Image as ImageIcon,
  Search,
  BarChart3,
  Activity as ActivityIcon,
} from "lucide-react";

export type SectionId =
  | "dashboard" | "create" | "queue" | "calendar" | "published" | "drafts"
  | "accounts" | "media" | "seo" | "analytics" | "activity" | "campaign" | "intake"
  | "blog" | "blogPost";

const NAV: { id: SectionId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "create", label: "Create Campaign", icon: Plus },
  { id: "blog", label: "AI Blog Agent", icon: PenTool },
  { id: "queue", label: "Review Queue", icon: ClipboardCheck },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "published", label: "Published", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "accounts", label: "Social Accounts", icon: Share2 },
  { id: "media", label: "Media Library", icon: ImageIcon },
  { id: "seo", label: "SEO & Audit", icon: Search },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "activity", label: "Agent Activity", icon: ActivityIcon },
];

export default function StudioApp() {
  const searchParams = useSearchParams();
  const [auth, setAuth] = useState<{ ok: boolean; dev: boolean } | null>(null);
  const [section, setSection] = useState<SectionId>(() => {
    const s = searchParams?.get("section") as SectionId | null;
    return s && NAV.some((n) => n.id === s) ? s : "dashboard";
  });
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [activePost, setActivePost] = useState<string | null>(() => searchParams?.get("postId") ?? null);

  useEffect(() => {
    const s = searchParams?.get("section") as SectionId | null;
    if (s && NAV.some((n) => n.id === s)) {
      setSection(s);
    }
    const p = searchParams?.get("postId");
    if (p) {
      setActivePost(p);
      setSection("blogPost");
    }
  }, [searchParams]);

  const refresh = useCallback(async () => {
    const c = await api.campaigns();
    setCampaigns(c.campaigns);
  }, []);

  useEffect(() => {
    api.me().then(setAuth);
  }, []);

  useEffect(() => {
    if (auth?.ok) void refresh();
  }, [auth, refresh]);

  const openCampaign = useCallback(async (id: string) => {
    setActiveCampaign(id);
    setDetail(await api.detail(id));
    setSection("campaign");
  }, []);

  /**
   * A campaign that has not been through the interview opens *in* the
   * interview. Sending a DRAFT straight to the detail view is what let an
   * admin hit "Run Agent Pipeline" on a campaign whose only fact was its title.
   */
  const openCampaignSmart = useCallback(async (id: string) => {
    setActiveCampaign(id);
    try {
      const intake = await api.intake(id);
      if (intake.phase !== "confirm" || !intake.canGenerate) {
        setSection("intake");
        return;
      }
    } catch {
      // Intake state is an optimisation, not a gate — if it cannot be read,
      // fall through to the normal detail view rather than blocking the admin.
    }
    setDetail(await api.detail(id));
    setSection("campaign");
  }, []);

  const reloadCampaign = useCallback(async (id: string) => {
    setDetail(await api.detail(id));
    void refresh();
  }, [refresh]);

  /**
   * Leave the interview and start the pipeline. Navigation happens first so the
   * admin lands on the campaign and watches the agents work, rather than
   * staring at a frozen wizard for the length of the run.
   */
  const runPipeline = useCallback(async (id: string) => {
    setActiveCampaign(id);
    setDetail(await api.detail(id));
    setSection("campaign");
    try {
      await api.generate(id);
    } catch {
      // The failure is recorded as an agent run and reflected in the campaign
      // status; the detail view surfaces it. Nothing useful to do here.
    }
    setDetail(await api.detail(id));
    void refresh();
  }, [refresh]);

  if (!auth) return <div className="min-h-screen bg-surface-subtle" />;
  if (!auth.ok) return <LoginScreen onLogin={setAuth} />;

  const filtered = filter
    ? campaigns.filter((c) => c.status === filter)
    : campaigns.filter((c) => !c.deletedAt);

  return (
    <div className="min-h-screen bg-surface-subtle text-navy">
      <div className="border-b border-surface-border bg-white shadow-xs">
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold font-display text-sm font-extrabold text-navy shadow-sm">B</span>
            <div>
              <p className="font-display text-sm font-bold leading-tight text-navy">Marketing Studio Agent</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-crimson font-semibold">BVCITS · AI Agent Suite</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${auth.dev ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
              {auth.dev ? "DEV / MOCK MODE" : "PRODUCTION"}
            </span>
            <button
              onClick={() => void api.logout().then(() => setAuth({ ok: false, dev: false }))}
              className="text-xs font-semibold text-ink-muted hover:text-crimson"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="container-page flex gap-6 py-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = section === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setSection(n.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs transition ${
                    active
                      ? "border border-gold/40 bg-gold font-bold text-navy shadow-xs"
                      : "border border-transparent font-medium text-ink-soft hover:border-surface-border hover:bg-white hover:text-navy"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-navy" : "text-ink-muted"}`} />
                  <span>{n.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {section === "dashboard" && (
            <Dashboard
              campaigns={filtered}
              onOpen={openCampaignSmart}
              onRefresh={refresh}
              onFilter={setFilter}
              onCreate={() => setSection("create")}
              onOpenBlog={() => setSection("blog")}
            />
          )}
          {section === "create" && <CreateCampaign onCreated={(id) => { setActiveCampaign(id); setSection("intake"); }} />}
          {section === "intake" && activeCampaign && (
            <CampaignIntake
              id={activeCampaign}
              onGenerate={() => void runPipeline(activeCampaign)}
              onOpenCampaign={() => void openCampaign(activeCampaign)}
            />
          )}
          {section === "queue" && <ReviewQueue campaigns={campaigns} onOpen={openCampaign} onRefresh={refresh} />}
          {section === "calendar" && <CalendarView campaigns={campaigns} onOpen={openCampaign} />}
          {section === "published" && <Dashboard campaigns={campaigns.filter((c) => c.status === "PUBLISHED")} onOpen={openCampaign} onRefresh={refresh} onFilter={(f) => setFilter(f)} />}
          {section === "drafts" && <Dashboard campaigns={campaigns.filter((c) => ["DRAFT", "NEEDS_INFORMATION", "GENERATING", "CHANGES_REQUESTED", "GENERATION_FAILED"].includes(c.status))} onOpen={openCampaignSmart} onRefresh={refresh} onFilter={(f) => setFilter(f)} />}
          {section === "blog" && (
            <BlogAgent
              onOpenPost={(id) => {
                setActivePost(id);
                setSection("blogPost");
              }}
            />
          )}
          {section === "blogPost" && activePost && (
            <BlogPostDetail id={activePost} onBack={() => setSection("blog")} />
          )}
          {section === "accounts" && <SocialAccounts />}
          {section === "media" && <MediaLibrary campaigns={campaigns} />}
          {section === "seo" && <SeoPage campaigns={campaigns} onOpen={openCampaign} />}
          {section === "analytics" && <AnalyticsView campaigns={campaigns} onOpen={openCampaign} />}
          {section === "activity" && <Activity />}
          {section === "campaign" && activeCampaign && (
            <CampaignDetailView
              id={activeCampaign}
              detail={detail}
              onBack={() => setSection("dashboard")}
              onReload={() => reloadCampaign(activeCampaign)}
              onOpenIntake={() => setSection("intake")}
            />
          )}
        </main>
      </div>
    </div>
  );
}