import type { Metadata } from "next";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { ROLE_LABELS, can, isUserRole } from "@/lib/auth/roles";
import { ComposeForm } from "./compose-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Announcements | BVCITS",
  robots: { index: false, follow: false },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AnnouncementsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();

  // No role filter in this query — the RLS policies decide which rows exist for
  // this user. Authors additionally see their own unpublished drafts.
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, audience, department, published, pinned, publish_at, expires_at, author_id")
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(50);

  const canWrite = can(user.role, "announcements.write");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Announcements</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Notices visible to you as <strong>{ROLE_LABELS[user.role]}</strong>.
        </p>
      </div>

      {canWrite && <ComposeForm />}

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load announcements: {error.message}
        </p>
      )}

      {!error && (!data || data.length === 0) ? (
        <p className="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
          Nothing here yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {data?.map((a) => {
            const audience = Array.isArray(a.audience) ? a.audience.filter(isUserRole) : [];
            return (
              <li key={a.id} className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-bold text-navy">{a.title}</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {a.pinned && (
                      <span className="rounded-full bg-crimson-100 px-2 py-0.5 text-xs font-semibold text-crimson">
                        Pinned
                      </span>
                    )}
                    {!a.published && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        Draft
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-2 whitespace-pre-line text-sm text-ink">{a.body}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span>{formatDate(a.publish_at)}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {audience.length === 0
                      ? "Everyone"
                      : audience.map((r) => ROLE_LABELS[r]).join(", ")}
                  </span>
                  {a.department && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{a.department}</span>
                    </>
                  )}
                  {a.expires_at && (
                    <>
                      <span aria-hidden>·</span>
                      <span>Expires {formatDate(a.expires_at)}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
