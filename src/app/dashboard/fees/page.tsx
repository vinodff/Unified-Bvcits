import type { Metadata } from "next";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { IndianRupee, Wallet, AlertTriangle } from "@/components/ui/icons";
import { SectionCard, StatTile, Chip, EmptyState, type Tone } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fees | BVCITS",
  robots: { index: false, follow: false },
};

interface InvoiceRow {
  id: string;
  academic_year: string;
  term: string;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: "due" | "paid" | "overdue" | "waived" | "partial";
}

function statusTone(status: InvoiceRow["status"]): Tone {
  if (status === "paid" || status === "waived") return "success";
  if (status === "overdue") return "danger";
  if (status === "partial") return "warning";
  return "neutral";
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default async function FeesPage() {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.role !== "student") {
    return <EmptyState icon={<IndianRupee className="h-8 w-8" />} text="Fee status is shown for student accounts." />;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_invoices")
    .select("id, academic_year, term, description, amount, paid_amount, due_date, status")
    .eq("student_id", user.id)
    .order("due_date", { ascending: false });

  const rows = (data ?? []) as InvoiceRow[];
  const outstanding = rows
    .filter((r) => r.status === "due" || r.status === "overdue" || r.status === "partial")
    .reduce((sum, r) => sum + (r.amount - r.paid_amount), 0);
  const overdueCount = rows.filter((r) => r.status === "overdue").length;
  const totalPaid = rows.reduce((sum, r) => sum + r.paid_amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Fees</h1>
        <p className="mt-1 text-sm text-ink-muted">Invoices raised by the accounts office and their payment status.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load fee records: {error.message}
        </p>
      )}

      {!error && rows.length === 0 ? (
        <EmptyState icon={<IndianRupee className="h-8 w-8" />} text="No fee invoices have been raised yet." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              icon={<AlertTriangle className="h-5 w-5" />}
              label="Outstanding"
              value={formatINR(outstanding)}
              tone={outstanding > 0 ? (overdueCount ? "danger" : "warning") : "success"}
              hint={overdueCount ? `${overdueCount} overdue` : undefined}
            />
            <StatTile icon={<Wallet className="h-5 w-5" />} label="Paid to date" value={formatINR(totalPaid)} tone="success" delayMs={60} />
            <StatTile icon={<IndianRupee className="h-5 w-5" />} label="Invoices" value={String(rows.length)} delayMs={120} />
          </div>

          <SectionCard title="Invoice history" icon={<IndianRupee className="h-4 w-4" />}>
            <ul className="divide-y divide-surface-border">
              {rows.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-navy">{invoice.description}</p>
                    <p className="text-xs text-ink-muted">
                      {invoice.term} · {invoice.academic_year} · Due{" "}
                      {new Date(invoice.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-navy">{formatINR(invoice.amount)}</span>
                    <Chip tone={statusTone(invoice.status)}>{invoice.status}</Chip>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
