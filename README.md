# BVCITS 2.0 — College Website Reconstruction

A modern Next.js reconstruction of [bvcits.edu.in](https://bvcits.edu.in) (Bonam Venkata
Chalamayya Institute of Technology & Science, Amalapuram), built for a hackathon.

**Phase 1 (faithful clone) — DONE.** Phases 2–4 (modernize → AI feature → QA) are next.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (260 static pages)
npm run start    # serve the production build
npm run frames   # re-render the 3D scroll frame sequences (see below)
```

Node 18+ required (built on Node 22, Next.js 15.1, React 19, Tailwind 3.4, TypeScript 5.7).

## What's built (Phase 1)

- **Global shell** — top utility bar, sticky header with hover mega-menus (12 sections,
  Examinations is a 2-column Autonomous/JNTUK menu), mobile drawer with accordions, footer.
- **Home** — notifications ticker, auto-rotating hero, accreditation strip, count-up stats,
  programs grid, recruiter marquee, placements dashboard, news, campus gallery, CTA.
- **Landing pages** — About (anchored sections), Admissions (procedure + intake table +
  enquiry form), Placements (stats + service cards), Contact (info + form).
- **Departments** — index + a **data-driven `[slug]/[section]` template**. All 10 departments
  render from `src/data/departments.ts`; **CSE is fully populated**, the other 9 at structural
  parity. 240 department section pages are prerendered.
- **No dead links** — every long-tail nav route (`/examinations/...`, `/iqac/...`, `/library`,
  etc.) resolves through the root catch-all to a real, styled page linking to the live source.
- **States** — `loading`, `error`, and `not-found` boundaries.

## 3D scroll experience — `/experience`

A scroll-driven tour built on the sticky-canvas frame-sequence technique: a tall
section pins a `<canvas>` that scrubs a pre-rendered image sequence as you
scroll. Two sequences (an assembling geodesic "knowledge core", then a corridor
flythrough of the departments), plus neumorphic stat tiles, an FAQ and an
SVG-circuit CTA.

The frames are generated, not hand-modelled — `scripts/render-frames.mjs` is a
small software 3D renderer (no new dependencies; `sharp` encodes the JPEGs).
Run `npm run frames` to re-render; it regenerates `src/lib/frame-manifest.ts`
from what lands on disk so frame counts can't drift.

Full write-up, including how to swap in real Blender frames and how to promote
the page to `/`: [`docs/3D-EXPERIENCE.md`](docs/3D-EXPERIENCE.md).

## Structure

```
docs/           # Source-of-truth reverse-engineering + specs (read AGENT-RULES.md first)
src/
  app/          # Routes (App Router)
  components/   # layout / ui / home / departments / forms
  data/         # departments.ts — the department content model
  lib/          # site.ts — nav tree, contact, constants
```

## Grounding

Everything is grounded in the real site. See [`docs/`](docs/):
`SITEMAP.md`, `ROUTE-INVENTORY.md`, `NAVIGATION.md`, `PAGE-TYPES.md`,
`COMPONENT-INVENTORY.md`, `DESIGN-SPEC.md`, `AGENT-RULES.md`.

## Next phases

2. **Modernize** — refine tokens from a real screenshot/CSS pass, richer motion, subtle 3D.
3. **Hackathon feature** — one flagship (e.g. AI campus assistant / smart department explorer).
4. **QA** — routes, a11y, responsive, performance.

## Notes

- Brand tokens (deep blue `#003d7a`, gold `#f5a623`) are **provisional** — confirm exact
  values in `docs/DESIGN-SPEC.md` before Phase 2 locks them.
- Placeholder imagery uses CSS gradients; drop real assets into `public/` later.
- This is an educational reconstruction — confirm asset/branding permission before public deploy.
```

# Unified-Bvcits
