# BVCITS — Route Inventory (prioritized for build order)

Priority: **P0** = essential (demo-critical) · **P1** = important · **P2** = secondary/long-tail.
Status: `done` = real page in this app · `stub` = resolves to the migration notice at
`app/[...slug]`, indexed and labelled on `/others`. Template = the PAGE-TYPES.md template.

## P0a — Stakeholder portals (IA v2 — see [IA-STAKEHOLDER-NAV.md](IA-STAKEHOLDER-NAV.md))
All seven render from one template (`components/portal/PortalPage.tsx`) over
`src/data/portals.ts`. Adding a portal = one data entry + one 13-line route file.

| Route | Template | Notes | Status |
|---|---|---|---|
| `/students` | Portal | 5 groups · 33 links | done |
| `/parents` | Portal | 6 groups · placement stats | done |
| `/staff` | Portal | 5 groups · faculty/research stats | done |
| `/management` | Portal | 5 groups · governance + reports | done |
| `/regulatory` | Portal | 6 groups · JNTUK/AICTE/NAAC/NBA/UGC/NIRF | done |
| `/recruiters` | Portal | 4 groups · placement stats | done |
| `/trainers` | Portal | 4 groups · partnership routes | done |
| `/others` | Archive index | 10 groups · 81 links · Live badges | done |

## P0 — the demo spine
| Route | Template | Notes | Status |
|---|---|---|---|
| `/` | Home | homepage + audience router section | done |
| `/about-us/` | Anchored landing | Vision/Mission/Core Values/Principal | done |
| `/admissions/` | Anchored landing + Form | intake + enquiry form | done |
| `/departments/` | Listing | 10 department cards | done |
| `/departments/computer-science-engineering/` | Department | **flagship — full content** | done |
| `/departments/[slug]/` | Department | 9 other depts, data-driven | done |
| `/departments/[slug]/[section]` | Department section | 240 prerendered sections | done |
| `/placements-cell/` | Landing + Dashboard | stats, recruiters | done |
| `/contact-us/` | Form | address/phone/email + map | done |
| `/experience` | 3D scroll experience | Phase 3 flagship | done |
| Header / MegaMenu / Footer | Global | shared shell, audience-organised | done |

## P1 — important
> Every route below currently resolves to the migration notice. They are **not
> orphaned**: each is indexed on `/others` and surfaced in the relevant portal's link
> groups. Building one for real = create the route + flip `live: true` in
> `src/data/legacy-index.ts`.

| Route | Template | Status |
|---|---|---|
| `/departments/[slug]/[section]` | Department section | stub |
| `/examinations/autonomous/` (+ COE, regulations, calendars, results, timetables, notifications) | Data/table | stub |
| `/examinations/jntuk/` (+ notifications, results, calendars, syllabus) | Data/table | stub |
| `/accreditations/`, `/awards-recognition/` | Landing | stub |
| `/iqac/*` (NAAC SSR, AQAR, events, composition, minutes, ATR, SDP) | Data/table | stub |
| `/nirf/` | Data/table | stub |
| `/library/` (+ 6 sub-pages) | Landing/listing | stub |
| `/campus-life/`, `/infrastructure/` | Gallery/landing | stub |
| `/category/news/`, `/events/` | Listing | stub |
| Placements sub-pages (8) | Landing/listing | stub |

## P2 — secondary / long-tail
| Route | Template | Status |
|---|---|---|
| `/about-us/mous/` | Detail | stub |
| Academics: `/student-mentoring/`, skills-enhancement, code-of-conduct, cells-committees | Landing | stub |
| Exam long-tail: staff, downloads, malpractice, model/old papers, background verification | Data/table | stub |
| Student Resources: mandatory-disclosures, feedbacks, R&D wing, technology-partnerships | Landing/table | stub |
| `/polytechnic/`, `/science-humanities/` | Department/landing | stub |
| `/institute-feedback/` (+ faculty) | Form | stub |
| `/privacy-policy/` | Static | stub |
| Footer aliases: academics-accreditation, faculty-research, campus-programs | Landing | stub |

## External (link out, do not clone)
`apply.bvcits.edu.in` · `/?ff_landing=3` · IEEE branch · AICTE feedback · `/wp-content/uploads/*.pdf`

## Coverage math
P0 ≈ 9 surfaces · P1 ≈ 40 routes · P2 ≈ 45+ routes. Department section dominates the long
tail — data-driven templating is what makes 100% coverage feasible in a hackathon window.
