"use client";

import { useState } from "react";
import type { CertificateBatch } from "@/lib/certificates/cert-types";
import { Clock, Award, ChevronDown, ChevronRight } from "lucide-react";

const panelCls = "rounded-2xl border border-surface-border bg-white p-5 sm:p-6 shadow-card";

export function BatchHistory({ batches }: { batches: CertificateBatch[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className={panelCls}>
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
        <Clock className="h-4 w-4" />
        Past Batches
      </h2>

      <div className="mt-3 divide-y divide-surface-border rounded-xl border border-surface-border">
        {batches.map((batch) => (
          <div key={batch.id}>
            <button
              type="button"
              onClick={() => setExpanded((prev) => (prev === batch.id ? null : batch.id))}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-subtle"
            >
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 shrink-0 text-crimson" />
                <div>
                  <p className="text-sm font-semibold text-navy">{batch.title}</p>
                  <p className="text-xs text-ink-muted">
                    {batch.totalCount.toLocaleString()} certificates ·{" "}
                    {new Date(batch.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              {expanded === batch.id ? (
                <ChevronDown className="h-4 w-4 text-ink-muted" />
              ) : (
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              )}
            </button>

            {expanded === batch.id && (
              <div className="border-t border-surface-border bg-surface-subtle px-4 py-3">
                <p className="text-xs text-ink-muted">
                  <strong>Template used:</strong>
                </p>
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-ink">
                  {batch.templateText}
                </pre>
                <p className="mt-2 text-xs text-ink-muted">
                  Batch ID: <code className="text-ink">{batch.id}</code>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
