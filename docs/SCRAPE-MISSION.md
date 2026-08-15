# BVCITS Asset & Content Harvest — Mission Brief (the "1000× better" prompt)

> This is the self-directed brief for the scraping mission. It replaces the vague ask
> "download everything" with a precise, verifiable, self-correcting pipeline.

## Role
Act as a veteran web-archival + reverse-engineering team. The original site
(https://bvcits.edu.in, Cloudflare + WordPress/PHP 8.2, server-rendered) is authoritative.
Capture the REAL artifacts — do not invent, do not substitute placeholders.

## Objective
Produce a **complete, organized, reusable local mirror of every reusable artifact** on the
site, plus a machine-readable manifest, so the rebuild can use real assets and content.

## In scope (capture ALL of these)
1. **HTML** — raw server HTML of every page discovered via the XML sitemap + link crawl.
2. **Images** — every `src`, `data-src`, `data-lazy-src`, `srcset`, `<source>`, `og:image`,
   and CSS `url()` background image (WordPress lazy-loads via `data-src` — must capture).
3. **Icons / favicons** — `link rel=icon`, `apple-touch-icon`, SVG icons, `.ico`.
4. **Logos** — institute logo, header logo, accreditation logos (AICTE/NAAC/NBA/JNTUK),
   recruiter/partner logos.
5. **Fonts** — `.woff2/.woff/.ttf/.otf` referenced by stylesheets.
6. **Stylesheets** — every `.css` (for color/spacing/typography forensics + font discovery).
7. **Documents** — every `.pdf/.doc(x)/.xls(x)/.ppt(x)/.zip` linked in nav or body.
8. **Structured content** — page text, tables, faculty, notices → kept as raw HTML + markdown.

## Out of scope
`/wp-admin/` (robots), third-party domains (download only same-host assets; log external),
tracking scripts. App JS bundles are noted but not required (we rebuild the UI).

## Deliverables (file layout)
```
scrape/
  sitemap.xml                # fetched sitemap index + children
  raw/<route-slug>.html      # raw HTML per page
  manifest.json              # every asset: url, type, localPath, bytes, status, sourcePage
  crawl-report.json          # pages found/fetched/failed, asset totals by type
public/
  assets/images/  icons/  logos/  fonts/  css/
  documents/
docs/
  ASSET-MANIFEST.md          # human-readable inventory + counts
```

## Method (deterministic, not agent-per-file)
- Discover URLs from `?sitemap.xml` (recurse sitemap index) ∪ known docs/SITEMAP.md routes ∪ on-page links (same host).
- Browser-like User-Agent; concurrency ≤ 5; per-request timeout; polite.
- Parse HTML → asset URLs (incl. lazy attrs + srcset). Fetch every CSS → parse `url()` → fonts/bg images.
- Download once (dedupe by URL); classify by extension/path; mirror to the folders above.
- Write manifest entry per asset; skip files > 12 MB (log them).

## Loop / stop condition (this is the "loop engineering")
1. Crawl → download → build manifest.
2. **Verify pass:** re-read manifest; any `status != ok` (timeout/404/5xx) → retry once with backoff.
3. Recompute. **Done when** every discovered asset is either `ok` or terminally logged as
   `failed` with reason, and every sitemap page has a saved raw HTML file.
4. Emit final counts. No silent gaps.

## Quality bar
- 100% of sitemap pages have raw HTML on disk (or a logged fetch failure).
- 0 assets in "unknown/unclassified" without a reason.
- Manifest is complete and self-consistent (counts match files on disk).
- Report distinguishes captured vs. external vs. failed — no hand-waving.

## Legal note
Educational/hackathon reconstruction. Local capture for rebuild is fine; confirm permission
before publicly redistributing BVCITS branding/photos/PDFs.

## Where multiple agents DO help (deferred, on request)
Not for byte-downloading. For **reasoning-heavy structured extraction** — turning raw HTML into
clean typed data (faculty rosters, exam tables, notices) — parallel agents with strict
per-section file ownership (Departments / Examinations / Placements / IQAC) are worth it.
Launch those only after the raw mirror + manifest exist.
