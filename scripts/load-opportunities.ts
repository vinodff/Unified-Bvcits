#!/usr/bin/env node
// Load a discovery snapshot into Supabase.
//
//   npx tsx scripts/load-opportunities.ts [path]
//
// Exists so a discovery run is not wasted when the table is not ready yet:
// discover-opportunities.ts always writes its snapshot to disk first, and this
// replays it once 0006_opportunities.sql has been applied. Upserting on
// url_fingerprint makes replaying safe — running it twice is a no-op, not a
// duplicate feed.

import { readFileSync } from "node:fs";

function loadEnv(path = ".env.local"): void {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // optional
  }
}

loadEnv();

// Wrapped in main() rather than using top-level await: tsx transpiles this to
// CommonJS, where a top-level await fails outright with ERR_REQUIRE_ASYNC_MODULE.
async function main(): Promise<void> {
  const snapshotPath = process.argv[2] ?? "scripts/opportunities-latest.json";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
    process.exit(1);
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as { rows?: unknown[] };
  const rows = snapshot.rows ?? [];

  if (rows.length === 0) {
    console.log(`${snapshotPath} contains no rows.`);
    return;
  }

  const response = await fetch(`${url}/rest/v1/opportunities?on_conflict=url_fingerprint`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    console.error(`Upsert failed: HTTP ${response.status}`);
    console.error((await response.text()).slice(0, 600));
    process.exit(1);
  }

  console.log(`Upserted ${rows.length} rows from ${snapshotPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
