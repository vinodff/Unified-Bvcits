"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "@/components/ui/icons";

interface RunResult {
  rechecked?: number;
  retired?: number;
  reused?: boolean;
  error?: string;
}

/**
 * Triggers the agent by hand.
 *
 * Sends `force=1` because the point of pressing the button is to run *now* —
 * the per-day uniqueness that stops a cron retry from sweeping twice would
 * otherwise silently return this morning's run and look like nothing happened.
 */
export function RunNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const running = busy || pending;

  async function handleRun() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/opportunities/agent/run?force=1", { method: "POST" });
      const json = (await response.json().catch(() => ({}))) as RunResult;
      setResult(response.ok ? json : { error: json.error ?? `HTTP ${response.status}` });
      if (response.ok) startTransition(() => router.refresh());
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={running}
        className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
      >
        {running ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking every listing…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Run now
          </>
        )}
      </button>

      {result && (
        <p
          role="status"
          className={`mt-2 max-w-xs text-xs ${result.error ? "text-red-700" : "text-ink-muted"}`}
        >
          {result.error
            ? result.error
            : `Re-checked ${result.rechecked ?? 0} · retired ${result.retired ?? 0}.`}
        </p>
      )}
    </div>
  );
}
