"use client";

import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount } from "@/lib/auth/demo";

/**
 * Demo credential picker. Rendered only when the parent page confirms
 * NEXT_PUBLIC_DEMO_LOGINS is on — this component does not decide that itself.
 */
export function DemoAccounts({ onPick }: { onPick: (account: DemoAccount) => void }) {
  return (
    <div className="mt-6 border-t border-surface-border pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-navy">Demo accounts</h2>
        <span className="text-xs text-ink-muted">
          Password: <code className="rounded bg-surface-subtle px-1 py-0.5">{DEMO_PASSWORD}</code>
        </span>
      </div>

      <p className="mb-3 text-xs text-ink-muted">
        Pick a role to fill the form, then sign in. Each one unlocks a different dashboard.
      </p>

      <ul className="space-y-2">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => onPick(account)}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-left transition hover:border-crimson hover:bg-crimson-50"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-navy">{account.label}</span>
                <span className="truncate text-xs text-ink-muted">{account.email}</span>
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">{account.unlocks}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-amber-700">
        These are real accounts with real privileges. Disable{" "}
        <code className="rounded bg-surface-subtle px-1">NEXT_PUBLIC_DEMO_LOGINS</code> before
        going live with real data.
      </p>
    </div>
  );
}
