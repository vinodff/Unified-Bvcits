# BVCITS — Stakeholder Navigation (IA v2)

> **This is the shipped information architecture.** `NAVIGATION.md` and `SITEMAP.md`
> remain the grounded record of the *live WordPress site* — they describe what was
> cloned, not what this app now navigates by. Where the two differ, this file
> describes reality.

## The decision

The brief for this platform is *"one interactive platform serving students, parents,
staff, management, JNTUK, government authorities, AICTE/UGC, recruiters, trainers"*.
The cloned WordPress IA was organised by the institute's **org chart** (Academics,
Examinations, IQAC, Student Resources…). A visitor had to already know which internal
department owned their answer before they could find it.

IA v2 organises the primary navigation by **audience** instead. Topic-organised access
is preserved in full under **Others**, so nothing became unreachable.

**This is a deliberate, user-approved departure from AGENT-RULES.md's Phase 1 rule
("reproduce the existing site's information architecture, not a redesign").** Phase 1
cloning is complete; this is a Phase 2 IA decision. Do not "restore" the old
twelve-item topical header on the assumption that it was lost by accident.

## Primary navigation — 10 items

| # | Header | Route | Dropdown |
|---|---|---|---|
| 1 | Home | `/` | — |
| 2 | Students | `/students` | Overview + 5 section anchors |
| 3 | Parents | `/parents` | Overview + 6 section anchors |
| 4 | Staff | `/staff` | Overview + 5 section anchors |
| 5 | Management | `/management` | Overview + 5 section anchors |
| 6 | Regulatory | `/regulatory` | Overview + 6 section anchors |
| 7 | Recruiters | `/recruiters` | Overview + 4 section anchors |
| 8 | Trainers | `/trainers` | Overview + 4 section anchors |
| 9 | About | `/about-us` | 2-col mega-menu: Institute + all 10 Departments |
| 10 | Others | `/others` | Full site index + 10 topic anchors |

"Regulatory" is the single header covering JNTUK, AICTE, UGC, NAAC, NBA and NIRF —
the audiences in the brief that all want the same thing: statutory evidence.

## Data flow — one source, three surfaces

```
src/data/portals.ts ──┬──> src/lib/site.ts    → header dropdowns + footer "For You"
                      ├──> components/portal/PortalPage.tsx → the 7 portal pages
                      └──> app/page.tsx       → home audience router cards

src/data/legacy-index.ts ─┬──> src/lib/site.ts  → "Others" dropdown
                          └──> app/others/page.tsx → the archive index
```

**Never restate a link in `site.ts` that already exists in `portals.ts`.** The nav is
derived from the portal data precisely so the header and the page cannot drift apart.
To add a section to a portal, add a `PortalGroup` — the header updates itself.

## Files

| File | Role |
|---|---|
| `src/data/portals.ts` | The 7 portals: actions, stats, link groups, contact block |
| `src/data/legacy-index.ts` | The 10 archive groups behind `/others`, with `live` flags |
| `src/components/portal/PortalPage.tsx` | The one template rendering all 7 portals |
| `src/components/portal/AudienceSwitcher.tsx` | Cross-portal strip, on every portal + `/others` |
| `src/app/<portal>/page.tsx` × 7 | Thin route files — metadata + `<PortalPage>` |
| `src/app/others/page.tsx` | Archive index (bespoke, not the portal template) |

Routes are **explicit folders, not a `[portal]` dynamic segment** — a single dynamic
segment at the root would take priority over `app/[...slug]` and swallow every
one-segment archive route (`/nirf`, `/polytechnic`, `/library`).

## The "Others" archive

`/others` indexes all ~81 legacy routes in 10 topic groups. Entries built as real pages
in this app carry a **Live** badge; the rest resolve to the migration notice at
`app/[...slug]/page.tsx`, which links to the published version on `bvcits.edu.in`.

This was an explicit scope call: keep the stub, but make everything behind it findable
and honestly labelled rather than silently promising ~60 pages that don't exist yet.
Building those pages out for real is the natural next increment — flip `live: true` in
`legacy-index.ts` as each one lands.

## Content rule for portal pages

Portal pages are **navigational**, not a new place to invent institutional facts.
Every `href` points at a real route in this app or a route documented in `SITEMAP.md`.
The only figures used are ones already published elsewhere on this site (placement
stats, faculty counts, accreditation standing). Do not add fees, dates, staff names or
contact details to `portals.ts` without a source — see the `fabricated-hod-names`
memory for how that bites.
