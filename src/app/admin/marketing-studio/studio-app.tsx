"use client";

import { useCallback, useEffect, useState } from "react";
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

export type SectionId =
  | "dashboard" | "create" | "queue" | "calendar" | "published" | "drafts"
  | "accounts" | "media" | "seo" | "analytics" | "activity" | "campaign" | "intake"
  | "blog" | "blogPost";

const NAV: { id: SectionId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "create", label: "Create Campaign", icon: "＋" },
  { id: "blog", label: "Blog Agent", icon: "✒" },
  { id: "queue", label: "Review Queue", icon: "✓" },
  { id: "calendar", label: "Calendar", icon: "▤" },
  { id: "published", label: "Published", icon: "●" },
  { id: "drafts", label: "Drafts", icon: "✎" },
  { id: "accounts", label: "Social Accounts", icon: "⬢" },
  { id: "media", label: "Media Library", icon: "▧" },
  { id: "seo", label: "SEO", icon: "⌕" },
  { id: "analytics", label: "Analytics", icon: "▥" },
  { id: "activity", label: "Agent Activity", icon: "✦" },
];

export default function StudioApp() {
  const [auth, setAuth] = useState<{ ok: boolean; dev: boolean } | null>(null);
  const [section, setSection] = useState<SectionId>("dashboard");
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [activePost, setActivePost] = useState<string | null>(null);

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

  if (!auth) return <div className="min-h-screen bg-brand-black" />;
  if (!auth.ok) return <LoginScreen onLogin={setAuth} />;

  const filtered = filter
    ? campaigns.filter((c) => c.status === filter)
    : campaigns.filter((c) => !c.deletedAt);

  return (
    <div className="min-h-screen bg-brand-black text-white">
      <div className="border-b border-brand-gold/15 bg-brand-black/90 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gold font-display text-sm font-extrabold text-brand-black">B</span>
            <div>
              <p className="font-display text-sm font-bold leading-tight text-brand-white">Marketing Studio</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-gold">BVCITS · AI Agent Suite</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${auth.dev ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300"}`}>
              {auth.dev ? "DEV / MOCK MODE" : "PRODUCTION"}
            </span>
            <button
              onClick={() => void api.logout().then(() => setAuth({ ok: false, dev: false }))}
              className="text-xs text-white/50 hover:text-brand-gold"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="container-page flex gap-6 py-8">
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-0.5">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setSection(n.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${section === n.id ? "bg-brand-gold text-brand-black font-semibold" : "text-white/60 hover:bg-white/5 hover:text-brand-gold"}`}
              >
                <span aria-hidden className="text-xs">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {section === "dashboard" && <Dashboard campaigns={filtered} onOpen={openCampaignSmart} onRefresh={refresh} onFilter={setFilter} />}
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