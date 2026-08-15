# Agent Research & Architecture Decisions — AI Marketing Studio

> Required by the build spec (Sections 18, 19, 20, 49, 61): every major subsystem was
> researched on GitHub and verified against official platform documentation **before**
> implementation. This file records what was inspected, what was reused, what was not,
> and why. Claims below reflect official docs checked **Aug 2026**.

---

## 1. Social platform API verification (Section 18 — official docs first)

### Instagram — Meta Graph API (Content Publishing API)

| Question | Verified answer | Source |
|---|---|---|
| Publishing supported? | **Yes** — single image/video posts, carousels, Reels, Stories via media containers | developers.facebook.com/docs/instagram-api/guides/content-publishing |
| Scheduling supported? | **Yes** — `POST /{ig-user-id}/media` with `publish=false` + `scheduled_publish_time` (10 min–75 days ahead) | sociahive.com/dev guide (2026-03), wersm.com (2026-07) |
| Account requirements | Instagram **Business or Creator** account linked to a **Facebook Page**; personal accounts not supported (Basic Display API retired Dec 2024) | storrito.com/resources/instagram-api-2026 |
| Permissions | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` — **all require Meta app review** | zernio.com/blog/instagram-graph-api (v21.0, May 2026) |
| Rate limits | 25 API-published posts / 24h per account; ~200 calls/hr per-user platform limit | zernio.com (2026-05) |
| Media | JPEG/PNG images, MP4 video; dimensions validated by API | meta docs |
| Token | OAuth 2.0 via Facebook Login; long-lived token refresh | meta docs |

**Capability result:** Publish ✓ · Schedule ✓ (10min–75d) · Media ✓ · Analytics ✓ (insights API) ·
Requires app review — never claim production-ready without it.

### Facebook — Pages API

| Question | Verified answer | Source |
|---|---|---|
| Publishing supported? | **Yes** — `POST /{page_id}/feed` (text/link), `POST /{page_id}/photos` (photo) | developers.facebook.com/documentation/pages-api/posts (updated Apr 2026) |
| Scheduling supported? | **Yes** — `published=false` + `scheduled_publish_time` (**10 min–30 days** ahead) | same, official Pages API docs |
| Permissions | `pages_manage_posts`, `pages_read_engagement`, `pages_manage_engagement`, `pages_read_user_engagement`, `publish_video` (video only); Page access token; user must hold `CREATE_CONTENT`/`MANAGE`/`MODERATE` tasks on the Page | official docs |
| Error semantics | Code 190 = invalid token (**do not retry**) · Code 506 = duplicate content · 5xx/network = retryable | zernio.com/blog/schedule-facebook-posts-via-api |

**Capability result:** Publish ✓ · Schedule ✓ (10min–30d) · Media ✓ · Analytics ✓ ·
App review required for the above permissions.

### LinkedIn — Posts API (`/rest/posts`)

| Question | Verified answer | Source |
|---|---|---|
| Publishing supported? | **Yes** — text, images, video, documents; replaces deprecated `ugcPosts` | learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api (2026-05) |
| Scheduling supported? | **NO** — `lifecycleState` accepts `PUBLISHED` only at creation; no scheduling parameter. "Any scheduling logic lives in your own app." | blotato.com (2026-08), zernio.com (2026-02) |
| Permissions | `w_member_social` (personal profile, self-serve "Share on LinkedIn", **no app review**) · `w_organization_social` (company page, **partner approval required**) | learn.microsoft.com (2026-07) |
| Headers | `Linkedin-Version: YYYYMM` (mandatory, monthly cadence) + `X-Restli-Protocol-Version: 2.0.0` | learn.microsoft.com |
| Token | OAuth 2.0 authorization code; access token expires **~60 days** | zernio.com (2026-02) |
| Limits | 3,000 chars per post (422 on exceed); 9 images | zernio.com, bundle.social |

**Capability result:** Publish ✓ · **Schedule ✗ (unsupported — our scheduler fires the API at the chosen time)** · Media ✓ · Analytics ✓ (needs extra scopes) ·
Personal profile = no review; company page = partner approval required.

### WhatsApp — Business Platform Cloud API

| Question | Verified answer | Source |
|---|---|---|
| Which product? | **Cloud API only** — on-premise API deprecated (as of Oct 23, 2025) | messagecentral.com (2026-05) |
| Publishing | Template messages (pre-approved, business-initiated) + free-form messages inside the 24h customer-service window | cloud-api docs |
| **Status publishing via API?** | **NO** — WhatsApp Status cannot be published through the Cloud API | cloud-api capability docs |
| Requirements | Meta Business Manager verification, WABA, dedicated phone number, system user token (`whatsapp_business_messaging`) | tsu.edu guide (2026-07) |
| Pricing | Per-message since July 2025; India marketing ≈ ₹0.88/msg | messagecentral.com |

**Capability result:** Messaging via templates ✓ · **Status ✗ (not supported — UI must say so)** ·
Broadcasts limited to approved templates + opt-in lists. No session-cookie automation (Section 57/58).

---

## 2. GitHub research (Section 19/49 — evaluate before building)

### LangGraph.js — `langchain-ai/langgraphjs`
- **URL:** https://github.com/langchain-ai/langgraphjs · **License:** MIT
- **Maintenance:** very active (3.2M weekly downloads on npm, v1.4.x, last publish 6 days ago)
- **What it offers:** durable execution, human-in-the-loop interrupts, checkpointing
- **Decision: NOT adopted.** Our agent pipeline is a deterministic, sequential pipeline with
  one mandatory human gate. The spec's architecture (Section 60) is a fixed DAG with no
  branching loops. LangGraph would add a dependency chain and a second persistence layer
  (its checkpointer) to a project that has no database at all. The approval gate is
  implemented directly in the state machine + server-side guards, which is auditable and
  testable without a framework.
- **Reused:** the *concept* of an explicit, enforced human-in-the-loop gate at a defined
  graph position (mirrors LangGraph interrupts, implemented natively).

### Postiz — `gitroomhq/postiz-app`
- **URL:** https://github.com/gitroomhq/postiz-app · **License:** AGPL-3.0
- **Maintenance:** very active; 35+ social providers; Postgres + Redis + Temporal stack
- **Decision: NOT adopted as a dependency.** Full NestJS/Prisma/Temporal/Redis stack is
  incompatible with this static Next.js clone (no Redis/Postgres infrastructure, would
  introduce 4 new services — spec Section 48 explicitly warns against this).
- **Reused:** its **`SocialProvider` interface pattern** (each platform = a class
  implementing one interface with publish/schedule/validate/etc.) — the design inspiration
  for `SocialPublisher` adapters in `src/lib/marketing/social/`. AGPL-3.0 code was not
  copied; only the interface shape (interfaces are not copyrightable expression in this
  minimal form) and the general architecture were adapted.

### sharp — `lovell/sharp`
- **URL:** https://github.com/lovell/sharp · **License:** Apache-2.0
- **Maintenance:** healthy (84M weekly downloads, 32k stars, releases monthly)
- **Decision: ADOPTED.** Used for the Creative Agent's real image processing:
  resize/crop/rotate/composite uploaded photographs into platform-specific
  dimensions (1080×1350, 1080×1080, 1080×1920), and rasterize brand SVG overlays.
  Pure Node native module, no infra.

### Also evaluated (not needed / rejected)
| Repo | Verdict | Why |
|---|---|---|
| BullMQ / Redis queue | Rejected | No Redis infra in project; file-backed persistent queue is honest and sufficient for a single-node deploy |
| Temporal (Postiz's engine) | Rejected | Heavy service; overkill for cron-style publishing jobs |
| `instagram-private-api` / `baileys` (unofficial) | **Rejected — forbidden** | Unofficial session/cookie automation violates spec Section 58 |
| `all-social-media-api` (npm) | Rejected | Third-party OAuth proxy layer; official APIs called directly instead |

---

## 3. Architecture decisions for this project

| Concern | Decision | Rationale |
|---|---|---|
| Orchestration | Custom **Supervisor** + explicit **state machine** (`src/lib/marketing/state-machine.ts`) | Deterministic pipeline; auditable; no framework tax (see LangGraph above) |
| Persistence | `StorageProvider` interface + JSON-file repository under `.data/marketing/` (gitignored) | Project has no DB; zero-infra; interface allows Postgres/SQLite swap later |
| Job queue | File-backed persistent queue + `tick` worker route (serverless-friendly) + dev interval | Spec Section 48: don't add infra the stack doesn't have |
| LLM | `LLMProvider` interface; `MockLLM` (offline, deterministic) default; env-gated OpenAI-compatible chat-completions provider | Model routing configurable per agent; no hard-coded vendor (Sections 43–44) |
| Vision | `VisionProvider` interface; heuristic + admin-tagged analysis offline; env-gated vision-capable provider hook | Never invent identities (Section 7) |
| Images | sharp for real photo composition; brand SVG overlays; optional AI image-gen provider hook | Real photos are the source assets (Section 12/59) |
| Social | `SocialPublisher` adapters per platform; **MOCK_SOCIAL_MODE** default; real adapters gated behind env config | Section 54; official APIs only (Section 18) |
| Auth | Env-gated admin PIN session + server-side guard on every route | No auth exists; RBAC-lite, honest for a clone |
| Publish safety | Server-side pre-flight: approval record exists, version+hash match, token valid, media valid, not already published, idempotency key | Sections 26–29 |

## 4. Platform capability matrix (rendered in the UI)

| Platform  | Connect | Publish | Schedule (API) | Media | Analytics | App review |
|---|---|---|---|---|---|---|
| Instagram  | OAuth (FB Login) | ✓ | ✓ 10min–75d | ✓ | ✓ | Required |
| Facebook   | OAuth (FB Login) | ✓ | ✓ 10min–30d | ✓ | ✓ | Required |
| LinkedIn   | OAuth | ✓ | ✗ (caller-side) | ✓ | ⚠ scopes | Personal: none; Org page: partner approval |
| WhatsApp   | API token | Template msgs only | Caller-side | ✓ | delivery receipts | Business verification |

## 5. Honest limitations surfaced in the UI

- LinkedIn has **no official scheduling API** — the scheduler fires the API at the chosen
  time; UI explains this.
- WhatsApp **Status publishing is not available** through the official Cloud API — UI shows
  "Not supported by the official API" and offers template-message broadcast as the
  legitimate alternative.
- Instagram/Facebook publishing permissions require **Meta app review**; the UI marks
  accounts as "Requires app approval" until real tokens exist.
- Mock mode is the default and is visually labeled `DEVELOPMENT / MOCK MODE` everywhere.
## 6. Implementation state (Aug 2026) � verified end-to-end

The stack is implemented in `src/lib/marketing/` and verified:

- **Pipeline**: context-agent ? image-analysis ? strategy ? writing ? seo ? creative ? quality,
  orchestrated by `supervisor.ts` + `pipeline.ts`; state machine enforces
  READY_FOR_REVIEW ? (approval) ? APPROVED ? SCHEDULED ? PUBLISHED; direct publish is impossible.
- **Approval gate**: `campaigns/[id]/approve` re-verifies content exists, quality verdict == pass,
  a connected account exists per chosen platform (pre-validated BEFORE the approval is recorded),
  and captures sha256 hashes of every AI creative asset.
- **Scheduler/queue**: `queue.ts` � Instagram/Facebook hand off to the Graph API scheduler;
  LinkedIn/WhatsApp/website publish at due time via the worker; retry only on transport/rate-limit
  errors (30s�2^n backoff, cap 1h, max 5), crash lock 45s, idempotency keys.
- **Website is a first-class platform**: no external API exists for the site's own pages, so
  `social/website.ts` records the publish marker locally (`.data/marketing/website-published.json`);
  PLATFORM_CAPABILITIES includes `website` (scheduling "caller").
- **Errors surface**: API routes return the real error message (+stack) on 500 so prod failures
  are debuggable.
- **Tests**: `npx vitest run` � 33 tests (state machine incl. illegal transitions, fact extraction
  incl. all winners patterns, quality verdicts, classifyError, backoff/idempotency, creative engine).
  `npx tsc --noEmit` clean; `npm run build` succeeds; `e2e-marketing.cjs` (root) is the
  end-to-end proof: auth ? create ? ask ? upload ? pipeline ? connect ? approve ? worker tick ?
  audit, all green against `next start`.
