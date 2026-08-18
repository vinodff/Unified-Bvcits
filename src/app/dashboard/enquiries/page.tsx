import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admission Enquiries | BVCITS",
  robots: { index: false, follow: false },
};

interface InboxRow {
  id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  program: string | null;
  message: string | null;
  source_path: string | null;
  status: string;
  created_at: string;
  hours_waiting: number | null;
}

export default async function EnquiriesPage() {
  const user = await getSessionUser();
  if (!user) return null;

  // `admission_enquiries` has RLS with no policies, so it is unreachable with a
  // user session by design. Reading it needs the service client — which means
  // this capability check IS the authorization boundary, not a convenience.
  // notFound() rather than a 403 so the page's existence isn't advertised.
  if (!can(user.role, "enquiries.read")) notFound();

  const { data, error } = await getServiceClient()
    .from("enquiry_inbox")
    .select("*")
    .limit(200);

  const rows = (data ?? []) as InboxRow[];
  const waiting = rows.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Admission enquiries</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {waiting > 0
            ? `${waiting} enquir${waiting === 1 ? "y" : "ies"} awaiting a first response.`
            : "Every enquiry has been picked up."}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load enquiries: {error.message}
        </p>
      )}

      {rows.length === 0 && !error ? (
        <p className="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
          No enquiries yet. Submissions from the website form appear here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-subtle text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Contact</th>
                <th scope="col" className="px-4 py-3">Program</th>
                <th scope="col" className="px-4 py-3">Message</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{row.full_name}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    <a href={`tel:${row.mobile}`} className="hover:text-crimson">{row.mobile}</a>
                    {row.email && (
                      <>
                        <br />
                        <a href={`mailto:${row.email}`} className="hover:text-crimson">{row.email}</a>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{row.program ?? "—"}</td>
                  <td className="max-w-xs px-4 py-3 text-ink-muted">
                    <span className="line-clamp-2">{row.message ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.status === "new"
                          ? "rounded-full bg-crimson-100 px-2 py-0.5 text-xs font-semibold text-crimson"
                          : "rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-ink-muted"
                      }
                    >
                      {row.status}
                    </span>
                    {row.hours_waiting !== null && row.hours_waiting > 24 && (
                      <span className="mt-1 block text-xs text-red-600">
                        {Math.floor(row.hours_waiting / 24)}d waiting
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {new Date(row.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
