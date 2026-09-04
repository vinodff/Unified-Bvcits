# BVCITS 2.0 — an AI-operated campus platform

A production Next.js platform for [BVCITS](https://bvcits.edu.in) (Bonam Venkata Chalamayya
Institute of Technology & Science, Amalapuram) in which **five autonomous AI subsystems do
real institutional work** — finding and vetting opportunities for students, writing and
publishing the college blog, answering campus questions in English and Telugu, rewriting
resumes against job descriptions, and running the marketing console.

Two of them run unattended on production cron schedules. Nothing here is a chat wrapper.

```
597 tests · 36 test files · 17 agent modules · 52 page routes · 36 API routes · 13 migrations
```

---

## The engineering stance

Three decisions shape almost every file, and they are the ones worth arguing about.

**1. Models are never asked to check their own work.**
Asking a model whether its own article contains invented statistics gets a confident "no."
So the blog quality gate verifies prose by matching it against a grounded fact set
([`blog/agents/quality-agent.ts`](src/lib/marketing/blog/agents/quality-agent.ts)), not by a
second opinion from the same class of system. Fabricated figures about a real institution
are treated as correctness bugs, not style problems.

**2. LLM output is fenced structurally, not by prompting.**
The resume optimizer scores the model's rewrite against a deterministic rewrite *and*
against doing nothing, then keeps the best of the three
([`resume/pipeline.ts`](src/lib/resume/pipeline.ts)). An optimizer must never hand back
something worse than it was given — a prompt cannot guarantee that; scoring both candidates
against the same function can.

**3. Every gate is a pure function, so every gate is testable.**
The opportunity trust filter does no network I/O
([`opportunities/verify.ts`](src/lib/opportunities/verify.ts)) — reachability is injected.
That is what lets scam-detection rules be tested without hitting the internet.

---

## The five subsystems

### 1. Opportunities Agent — trust & safety for a student job feed

`src/lib/opportunities` · 3,646 lines · runs daily at 03:00 UTC

Finds internships, hackathons and scholarships across an allowlist of ATS and career
domains, then decides which are safe to show a student. **The filter is deliberately biased
toward rejecting**: a student who misses one real opportunity loses one opportunity; a
student who pays ₹2,000 to a fake "placement drive" loses money and trust in the portal.

Three independent gates, because they answer three different questions:

| Gate | Question it asks | Module |
|---|---|---|
| Trust | Is the source legitimate? | `sources.ts` — domain tiers |
| Seniority | Is this actually student-level? | `verify.ts` |
| Region | Can *this* student physically apply? | `region.ts` |

The third gate exists because the first live runs published perfectly trustworthy,
perfectly student-level listings that were useless — NVIDIA Santa Clara, Meta Menlo Park,
SpaceX Hawthorne. Trustworthy, student-level and *reachable* are separate questions, and
nothing was asking the third one.

Operationally it is an accountable agent, not a script:

- **Liveness re-verification** — re-checks published rows and interprets what a response
  *means*. It does **not** retire on 403: corporate career sites answer an unknown
  User-Agent with 403 while serving browsers perfectly, so retiring on 403 would delete
  precisely the official sources the feed exists to carry.
- **Run ledger** — every sweep opens a row *before* doing any work, so a run that dies
  halfway is legible as a failure rather than vanishing as though the agent never woke up.
- **Soft retirement** — `retired_at` + `retired_reason`, never a delete. The row still
  matters for deduplication and for a student who already applied, so every removal stays
  auditable.
- **Closed-by-default cron** — an unset `CRON_SECRET` closes the route rather than opening
  it. The route fires dozens of outbound requests per call; unauthenticated it would be a
  denial-of-wallet hole.

Ranking is computed at read time from the student's profile, and returns its breakdown
alongside the total so the UI can *explain* a ranking instead of presenting a magic number.

### 2. Blog Agent — idea queue to published article

`src/lib/marketing/blog` · runs daily at 01:30 UTC

`topic-scout → outline → writer → seo → image → quality gate → publish`, fully unattended.

The quality gate is the load-bearing part: deterministic checks for fabricated figures,
slop phrases and grounding violations. A `critical` issue blocks auto-publish and stops the
post in `NEEDS_REVIEW` with the issue shown to an admin, who can publish anyway — with
their name on the override.

Every post gets an image carrying the college crest, via a photo-then-brand-card fallback
chain. **Nothing generates a synthetic photograph**: an AI-imagined "students in a lab"
picture on a real college's blog is a fabricated depiction of a real place. A collage
detector keeps tiled "activity report" sheets out of the photo pool — one got through once
and rendered as a document scan with three GPS stamps showing.

### 3. Marketing Studio — multi-agent orchestration behind a hard approval gate

`src/lib/marketing` · 11,046 lines · 17 agent modules

A supervisor runs a nine-step pipeline (context → images → strategy → writing → seo →
creative → quality → approval → publishing), records every agent run, and enforces a
[state machine](src/lib/marketing/state-machine.ts) in which **`READY_FOR_REVIEW →
PUBLISHED` is deliberately absent**. The approval gate is enforced in the state machine
*and* re-enforced server-side at publish time, so the natural-language assistant cannot talk
its way past it. Any content edit after approval invalidates the approval.

### 4. Campus Assistant — grounded bilingual retrieval

`src/lib/campus-agent` · 2,071 lines

`normalise → resolve department → score topics → compose answer → carry context`.

Answers are composed from a grounded knowledge base rather than generated, because a college
assistant inventing a fee amount or an HOD's name is a factual claim about real people.
Handles Telugu — which needs `\p{M}` combining marks in tokenization, not just `\p{L}`, or
the script silently shreds.

Conversation context carries the resolved department forward, so asking "CSE HOD ఎవరు?" then
just "ఫీజు ఎంత?" still means CSE — but only for topics where that is coherent. College-wide
figures deliberately do *not* inherit a department.

### 5. Resume Optimizer — before/after against one scoring function

`src/lib/resume` · 2,935 lines

`requirements → score(before) → optimize → score(after) → gap → evidence`.

Both scores come from the same function; that symmetry is the entire basis of the
improvement claim. The trust score is evidenced against the verbatim original text, so the
tool cannot claim experience the candidate never wrote.

---

## Also in here

- **Placement portal** (2,178 lines) — proctored online exams with violation tracking.
- **Results portal** (2,044 lines) — Excel upload → hall-ticket + DOB lookup.
- **Auth** — 8 portal-derived roles with a capability matrix, enforced in Postgres RLS.
- **`/experience`** — a scroll-driven 3D tour whose frames are generated by a small software
  renderer in `scripts/render-frames.mjs`, with no 3D dependency added.

---

## Run it

```bash
npm install
cp .env.example .env.local   # every key is documented in place
npm run dev                  # http://localhost:3000
npm run build                # production build
npm test                     # 597 tests
```

Node 18+ (built on Node 22). Next.js 16.3, React 19, TypeScript 5.7, Tailwind 3.4,
Supabase, Vitest.

The app runs without AI keys — the agents degrade to their deterministic paths rather than
crashing. `.env.example` documents which keys unlock which subsystem and, for each, why it
is server-side only.

## Architecture

[`ARCHITECTURE.md`](ARCHITECTURE.md) — system diagram, agent pipelines, the state machine,
grounding strategy, and the failure mode each design decision was a response to.

Deeper specs live in [`docs/`](docs/): `AGENT-RULES.md` (read first), `BLOG-AGENT.md`,
`AUTH.md`, `SUPABASE.md`, `RESULTS-PORTAL.md`, `ROUTE-INVENTORY.md`, `DESIGN-SPEC.md`.

## Honest caveats

- The institution is real; this is an independent reconstruction, not an official
  deployment. Confirm asset and branding permission before any public launch.
- `src/data/departments.ts` still carries placeholder staff names for some departments. The
  real ones are in `real-departments.json` and are being migrated — that fabricated-name
  incident is what motivated the grounding rules above.
- CSE is fully populated; the other nine departments are at structural parity.
