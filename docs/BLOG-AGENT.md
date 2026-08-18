# Blog Agent

An agent pipeline that researches topics, writes full-length articles with images,
checks them, and publishes to `/blog`. Built to serve two goals at once: be
genuinely useful to students and parents, and be found on Google for the searches
those people actually run.

It is a **sibling** of the campaign pipeline, not part of it. A campaign promotes
an event that happened (photo gate, required facts per type, five-platform
fan-out). A blog post is evergreen editorial with no event behind it — pushing it
through the campaign state machine would mean either weakening the photo gate or
inventing facts to satisfy `REQUIRED_FIELDS`.

## The daily loop

```
07:00 IST cron  →  Topic Scout proposes 10 ideas
                        ↓
admin opens Marketing Studio → "Blog Agent" → approves one
                        ↓
Outline → Write → Images → SEO → Quality gate → (Revise once) → Publish
                        ↓
                   live at /blog/<slug>
```

Approving the topic **is** the approval of the article. A post only stops for a
human when the quality gate finds something critical. The admin can also type
their own title, which skips the shortlist and goes straight to writing.

## Files

| Path | What it is |
|---|---|
| `src/lib/marketing/blog/domain.ts` | Types, slugify, word/reading counts, IST batch date |
| `src/lib/marketing/blog/college-context.ts` | **Grounding layer** — every fact a post may assert, plus the forbidden-claim rules |
| `src/lib/marketing/blog/store.ts` / `supabase-store.ts` | `BlogStore`, JSON + Postgres backends |
| `src/lib/marketing/blog/agents/topic-scout.ts` | Seed bank + model pass → the daily ten |
| `src/lib/marketing/blog/agents/outline-agent.ts` | Section plan, word targets, validated internal links |
| `src/lib/marketing/blog/agents/writer-agent.ts` | Article generation, expansion pass, revision pass, markdown normalisation, invalid-link repair |
| `src/lib/marketing/blog/agents/image-agent.ts` | Hero + section graphics from real campus photos |
| `src/lib/marketing/blog/agents/seo-agent.ts` | Meta, slug, JSON-LD |
| `src/lib/marketing/blog/agents/quality-agent.ts` | The gate — all deterministic |
| `src/lib/marketing/blog/pipeline.ts` | Orchestration + publish state changes |
| `src/app/api/marketing/blog/**` | Admin API + the daily cron route |
| `src/app/admin/marketing-studio/components/blog-agent.tsx` | Idea queue + article library |
| `src/app/admin/marketing-studio/components/blog-post-detail.tsx` | Layout preview, quality, SEO, editor, run log |
| `src/app/blog/**` | The public blog |
| `src/components/blog/Markdown.tsx` | Renderer — React elements only, no HTML string anywhere |
| `supabase/migrations/0009_blog.sql` | 4 tables, 4 enums. Applied. |

## The two rules that shape everything

### 1. No fabricated claims about the college

Everything a post may assert about BVCITS comes from `college-context.ts`, which
reads real values out of `bvcits-bot-knowledge.ts` and `real-departments.json`.
The writer receives that set as `context.grounded`; the quality gate re-reads it
and matches every ₹ figure, percentage and large count in the finished prose
against it. A figure in a sentence that mentions BVCITS and has no match is a
**critical** finding.

Named people are checked separately by name shape (honorific-led, or Indian
initial-led). This exists because of the fabricated-HOD-names incident already
recorded in `docs/` — publishing an invented staff name is a correctness bug,
not a style problem.

### 2. No rankings, no guarantees

`FORBIDDEN_CLAIM_PATTERNS` blocks five things outright:

| Code | Blocks |
|---|---|
| `self_ranking` | "the best / #1 engineering college" |
| `competitor_ranking` | "better than / ahead of <another college>" |
| `guaranteed_outcome` | "100% placement", "guaranteed job" |
| `fabricated_survey` | "studies show…" with no source |
| `absolute_superlative` | "world's best", "unmatched" |

**This is why there is no "Top 5 Colleges in Konaseema" article.** That listicle
requires publishing a ranking nobody produced plus a disparaging factual claim
about named third parties. The seed bank chases the same search honestly:
*"How to Choose an Engineering College in Konaseema: 9 Things to Check Before You
Lock a Seat"*. Someone typing "best engineering college in Konaseema" is really
asking "how do I choose one" — the article that answers that question is the one
that both ranks and converts, and it is defensible.

## Images

**Two guarantees: every article has at least one image, and every image carries
the college crest.**

The hero is not best-effort. `generateBlogImages` tries a real campus photograph
first and falls back to a photo-less brand card, which depends on nothing but
`sharp` itself. If even that fails, the quality gate's `missing_hero_image`
check (critical) stops the post in `NEEDS_REVIEW` rather than letting an
imageless article publish — the hero is the `/blog` card thumbnail, the social
share image and the `image` field of the article schema, so its absence breaks
three things at once. Section images stay best-effort; the hero already covers
the article.

### The lockup

Each image is: campus photograph → top and bottom scrims → white rounded plate →
BVCITS crest → wordmark → gold rule → category eyebrow → title → tagline → solid
footer band with the full college name and counselling code.

The crest (`public/assets/logos/cropped-logo.png`) is black line-art on a yellow
field with a transparent surround, so it vanishes on a dark photo. It is always
placed on a light plate; the plate geometry is computed in `logoLockup()` and
drawn by the SVG overlay, so the two cannot drift apart.

`buildBlogOverlaySvg` is separate from `creative-engine.buildOverlaySvg` on
purpose — it needs a top scrim, the plate and the wordmark, and editing the
shared function would have changed every campaign graphic as a side effect.

### Source library hygiene

`public/assets/images` is ~1000 mixed files. Three filters run:

1. **Filename** — certificates, syllabi, timetables, notices.
2. **Geometry** — landscape, ≥900px wide.
3. **Collage detection** (`hasUniformGutter`) — the library holds "activity
   report" sheets: three or four phone snaps tiled under a printed banner. One
   was picked for a section image on the first illustrated run and rendered as a
   document scan with three GPS stamps showing. A tiled sheet always has a
   full-width or full-height band of near-uniform near-white pixels where the
   gutter runs; a photograph essentially never does. The image is shrunk to a
   64×64 greyscale probe and rejected if any interior row or column is both very
   bright and very flat. This drops ~19 files (287 → 268 usable).

Separately, many photos were shot on phones running **GPS Map Camera**, which
burns a location panel into the bottom of the frame. Two things remove it: the
bottom 20% of the source is discarded before the cover-crop, and the footer band
is fully opaque (the gradient bottomed out at 0.96, and 4% of bright white text
is still legible over black).

The photo is picked deterministically from a hash of the slug, so regenerating a
post produces the same imagery.

**Nothing generates a synthetic photograph.** An AI-imagined "students in a lab"
picture on a college blog is a fabricated depiction of a real place.

Output goes to the public `blog-media` Supabase Storage bucket (created on first
use), or to `public/blog-media/` when Supabase is unconfigured. Storage keys are
normalised to forward slashes — `path.join` on Windows produced keys containing a
literal backslash that Supabase escaped to `%5C` in the public URL.

The pool scan reads and downsamples every candidate, so it costs ~10s on the
first call per process and is then cached. Tests that touch it need an explicit
timeout.

## The quality gate

Entirely deterministic. Asking a model whether its own article contains invented
statistics gets a confident "no".

| Check | Severity |
|---|---|
| Forbidden claim patterns · brand forbidden terminology | critical |
| Unverified figure in a BVCITS sentence | critical |
| Unverified person name | critical |
| ≥3 stock AI phrases ("in today's fast-paced world", "delve into", …) | critical |
| <60% of planned length · <3 H2 sections · broken internal link | critical |
| No hero image (`missing_hero_image`) | critical |
| 1–2 AI phrases · connective paragraph openers · uniform paragraph rhythm | warning |
| Keyword absent or stuffed · no internal links · weak excerpt | warning |

`verdict = "needs_review"` when there is any critical finding **or** the average
score is below 70. A high average never overrides a critical finding — one
invented placement figure is not offset by good structure.

Findings that a rewrite can fix are sent back to the writer once. Broken links
are repaired deterministically instead (`stripInvalidLinks`), because the model
invents site paths and handing that back tends to make it rewrite whole
paragraphs around the link.

## Configuration

| Env var | Effect |
|---|---|
| `OPENAI_API_KEY` + `OPENAI_BASE_URL` + `MARKETING_ROUTE_ALL=openai` | Live generation. **Required** — without it the mock provider produces a scaffold that the gate correctly refuses to publish. |
| `CRON_SECRET` | Authorises the daily job via `Authorization: Bearer …`. Without it, only a signed-in admin can trigger the cron route — deliberately closed, not open, since the endpoint burns model quota. |
| `BLOG_AUTO_WRITE=1` | The cron also writes and publishes the highest-scoring already-approved topic. Off by default: an unattended writer publishing daily to a real college's public site with nobody deciding what it says is not a feature anyone asked for. The gate still applies. |
| `MARKETING_STORE` | Shared with the campaign store; the blog can never end up on a different backend. |

Schedule lives in `vercel.json` — `30 1 * * *` UTC = 07:00 IST.

## Runbook

**Post stuck in `GENERATING`** — cannot happen from a caught failure (the
pipeline forces `FAILED` in its catch), but a hard process kill can leave one.
Set it to `FAILED` and regenerate.

**Post in `NEEDS_REVIEW` you disagree with** — open it in the studio, read the
Quality tab, then either fix the copy on the Edit tab or press "Publish anyway".
The override is recorded as an agent run against the actor.

**Article live with a wrong figure** — Unpublish first (instant), then fix. The
slug is deliberately not editable: it is the public URL, and changing it breaks
every link already shared.

**Images not loading in production** — check the `blog-media` bucket is public
and that `*.supabase.co` is in `next.config.mjs` `images.remotePatterns`.

## Verified

Live end-to-end run on 2026-08-16 against Gemini and the real photo library:
10 topics proposed, one written to 1503 words with 4 crest-branded images over
real campus photographs, scored **100/100**, verdict pass. `npm run build`
clean, 487 tests passing, 0 TypeScript errors.
