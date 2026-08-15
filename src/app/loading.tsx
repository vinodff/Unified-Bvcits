export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-crimson-100 border-t-crimson" />
        <span className="text-sm font-medium text-ink-muted">Loading…</span>
      </div>
    </div>
  );
}
