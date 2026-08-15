# Supabase — data layer

Project ref: `sdnvwkpvkowryaqqzcer` · <https://sdnvwkpvkowryaqqzcer.supabase.co>

**Status: applied and verified live** — 18 tables, 3 views, 6 functions.
Enquiry submission, assistant logging, rate limiting, RLS lockdown and the
Marketing Studio round-trip were all exercised against the real project.

> ⚠ **Running the E2E suite now writes to production.** `e2e-marketing.cjs`
> creates ~11 campaigns with assets, approvals and audit entries. Start its
> server with `MARKETING_STORE=file` or that test data lands in the live
> database — and the audit rows **cannot be removed**, because `audit_log` is
> append-only by rule.

## Why a database at all

Three places were losing data:

| Surface | Before | After |
|---|---|---|
| `EnquiryForm.tsx` | `onSubmit` set local state and discarded the enquiry entirely | `POST /api/enquiries` → `admission_enquiries` |
| Campus assistant | Answered and forgot; no record of what it *failed* to answer | `assistant_queries` + `assistant_gap_report` view |
| Marketing Studio | 14 entities in `.data/marketing/*.json` — gitignored, process-local, wiped on every serverless deploy | 15 Postgres tables behind the same `StorageProvider` interface |

## Schema

Migrations live in [`supabase/migrations/`](../supabase/migrations/) and are
numbered in apply order.

**`0001_core.sql`** — public capture
`admission_enquiries`, `assistant_sessions`, `assistant_queries`, plus the
shared `set_updated_at()` trigger function.

**`0002_marketing.sql`** — a 1:1 port of `src/lib/marketing/domain.ts`
`campaigns`, `campaign_facts`, `campaign_assets`, `content_versions`,
`approvals`, `seo_metadata`, `quality_scores`, `agent_runs`, `social_accounts`,
`publish_jobs`, `publish_attempts`, `audit_log`, `campaign_messages`,
`campaign_pending_questions`, `brand_settings`.

Enum values are copied verbatim from the TypeScript union types. **If a union in
`domain.ts` gains a member, the enum needs `alter type … add value` or inserts
will start failing.** That is the one place the two models can still drift.

### A bug this surfaced

The create-campaign form offered three types — `competition`, `tieup`,
`admission` — that are **not** valid `CampaignType` values. The JSON store
accepted them silently, but `REQUIRED_FIELDS[type]` in
`agents/context-agent.ts` returns `undefined` for them, so those campaigns were
already broken further down the pipeline. Postgres turned the silent corruption
into a hard enum error.

Fixed at the root: `CAMPAIGN_TYPES` in `domain.ts` is now a runtime array with
the union *derived* from it (`(typeof CAMPAIGN_TYPES)[number]`). The API route
validates with `isCampaignType()` and the form renders from the same list, so
the three cannot disagree again. Invalid types now return `400`, not `500`.

**`0003_functions.sql`** — functions and views (below).

### Primary keys stay `text`

Campaign and job ids keep the app's `newId()` format (`cmp_lx3f_a91b`) rather
than becoming `uuid`. The domain layer, idempotency keys and audit entries
already pass these around as opaque strings, so switching would have meant
rewriting the domain layer for no gain. `admission_enquiries` and the assistant
tables are new, so those use `uuid`.

## Security model

RLS is enabled **and forced** on every table, with **zero policies**. That is
deliberate: no policy means no access. Concretely —

- The **publishable key** (`anon`) can read nothing and write nothing directly.
  Its entire surface is two `SECURITY DEFINER` RPCs.
- The **secret key** bypasses RLS and is used only by server-side route
  handlers, which already gate on `requireAdmin()`.

Verified against a local Postgres 17 by running as the `anon` role: reads of
`admission_enquiries`, `campaigns` and `enquiry_inbox`, a direct insert, and a
call to `claim_due_publish_jobs()` all failed with `insufficient_privilege`,
while both granted RPCs succeeded and their rows landed.

Two further deliberate choices:

- **`social_accounts` holds no access tokens.** Only which accounts exist and
  what they can do. A database leak is not a leak of the college's social
  presence.
- **Submitter IPs are never stored**, only a salted SHA-256 (`ENQUIRY_IP_SALT`).
  Unsalted, a hashed IPv4 is effectively plaintext — the keyspace is 2³².

## Functions

### Anon-callable

| Function | Purpose |
|---|---|
| `submit_admission_enquiry(...)` | Validates, rate limits (**5 per IP hash per hour**), inserts. Raises `53400` when throttled. |
| `log_assistant_query(...)` | Upserts the session and records one turn. Returns `void` — telemetry must not double as a read channel. |

Both pin `search_path = public, pg_temp`. Without that, a caller who can create
objects in an earlier schema could shadow a table name and have it resolved with
the definer's privileges.

### Service-role

| Function | Replaces |
|---|---|
| `invalidate_campaign_approvals(id)` | `JsonFileStore.invalidateApprovals()` — read-modify-write, lost updates under concurrency. Now flips approvals *and* the campaign flag in one transaction. |
| `claim_due_publish_jobs(limit, lock_seconds)` | The `lockedUntil` crash lock in `queue.ts`. `FOR UPDATE SKIP LOCKED` gives concurrent workers disjoint job sets. |
| `release_stale_publish_locks()` | Returns jobs abandoned by a crashed worker to the queue. |
| `get_campaign_bundle(id)` | Eight round trips for the campaign detail screen, collapsed into one. |

### Views (service-role only)

- `enquiry_inbox` — new enquiries first, with `hours_waiting`.
- `assistant_gap_report` — questions asked often and answered rarely, ranked by
  miss count, with up to three real phrasings each. This is the content backlog
  for `src/lib/campus-agent/answers.ts`.
- `campaign_dashboard` — pipeline state, asset/content counts, failure counts.

## Three constraints the file store could not enforce

1. `content_versions` is unique on `(campaign_id, version, platform)` — a
   retried generation can no longer append a silent duplicate.
2. `publish_jobs.idempotency_key` is unique — two racing workers get a
   constraint error instead of double-posting to Instagram.
3. `audit_log` has `do instead nothing` rules on UPDATE and DELETE — append-only
   in the literal sense. Corrections are new entries, not edits.

## Application wiring

```
src/lib/supabase/client.ts          getPublicClient() | getAdminClient()
src/lib/marketing/supabase/store.ts SupabaseStore implements StorageProvider
src/lib/marketing/supabase/mappers.ts   snake_case row <-> camelCase domain
src/lib/marketing/storage.ts        selectStore() picks the backend
src/app/api/enquiries/route.ts      enquiry submission
src/components/forms/EnquiryForm.tsx    now actually submits
```

`store` is still imported from `@/lib/marketing/storage` by all 13 call sites —
none of them changed. Backend selection:

| `MARKETING_STORE` | Behaviour |
|---|---|
| `supabase` | Require Postgres; **throw** if keys are missing |
| `file` | Force `JsonFileStore` |
| unset | Supabase when configured, files otherwise |

The explicit `supabase` value exists so a production deploy fails fast on a
typo'd key instead of quietly writing to a filesystem that gets discarded.

## The existing `.data/marketing/` files

Switching to Postgres leaves the old JSON files in place but unread. Their
contents are **E2E fixtures** — 11 campaigns all titled "E2E National
Hackathon", generated by `e2e-marketing.cjs` — so there is nothing worth
importing. They are safe to delete, and `MARKETING_STORE=file` still reads them
if you want the old state back.

If a future session accumulates *real* campaigns on the file store, migrating
them means reading each JSON array and pushing it through the matching
`SupabaseStore` method — the mappers already handle the shape conversion.

## Keys

`SUPABASE_SECRET_KEY` is set in `.env.local` and working. The remaining
optional one:

**Personal Access Token** — [account tokens](https://supabase.com/dashboard/account/tokens)
→ generate one (`sbp_…`). This is account-level, *not* a project key. Only
needed for the MCP server in `.mcp.json`, which lets agent tooling run
migrations and inspect the schema directly.

`.mcp.json` reads it as `${SUPABASE_ACCESS_TOKEN}`, which expands from the
**shell environment**, not from `.env.local` — the MCP server starts before
Next.js loads any env file. Keeping it out of the JSON also means the config
stays safe to commit. Set it in PowerShell before launching:

```powershell
[Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'sbp_...', 'User')
```

MCP servers are loaded at startup, so Claude Code needs a restart afterwards.
Confirm with `/mcp` — `supabase` should list as connected.

## Applying future migrations

`0001`–`0003` are already applied. For anything new, add a numbered file to
`supabase/migrations/` and use one of:

- **SQL editor** — paste it into the
  [SQL editor](https://supabase.com/dashboard/project/sdnvwkpvkowryaqqzcer/sql/new).
  No extra keys needed.
- **CLI** — `npx supabase link --project-ref sdnvwkpvkowryaqqzcer && npx supabase db push`.
- **MCP** — set `SUPABASE_ACCESS_TOKEN`, restart Claude Code, ask the agent.

The secret key **cannot** run DDL: PostgREST exposes tables and functions, not
arbitrary SQL. It is for reading and writing rows only.

## Verifying locally

The migrations were validated against a scratch Postgres 17 database, not just
eyeballed. To repeat that:

```bash
psql -U postgres -c "create database bvcits_schema_check;"
psql -U postgres -d bvcits_schema_check -c \
  "create role anon nologin; create role authenticated nologin;"
for f in supabase/migrations/*.sql; do
  psql -U postgres -d bvcits_schema_check -v ON_ERROR_STOP=1 -f "$f"
done
```

Supabase provides `anon` and `authenticated` automatically; vanilla Postgres
does not, which is why the scratch database creates them by hand.
