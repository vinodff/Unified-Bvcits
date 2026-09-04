"use client";

import { useState } from "react";
import { api } from "../api";
import { Button, ErrorNote, Field, inputCls } from "../ui";

export function LoginScreen({ onLogin }: { onLogin: (a: { ok: boolean; dev: boolean }) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(pin);
      onLogin(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-white p-8 shadow-card">
        <p className="eyebrow text-goldDark font-bold uppercase tracking-[0.14em] text-xs">Restricted</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-navy">Marketing Studio Agent</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Admin access only. No ADMIN_PIN is configured on this server, so any PIN unlocks the studio in DEV/MOCK mode.
        </p>
        <div className="mt-6 space-y-3">
          <Field label="Admin PIN">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="••••••"
              className={inputCls}
            />
          </Field>
          <ErrorNote message={error} />
          <Button onClick={() => void submit()} disabled={busy} className="w-full">
            {busy ? "Checking…" : "Enter Studio"}
          </Button>
        </div>
      </div>
    </div>
  );
}