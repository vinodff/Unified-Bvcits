# BVCITS — Design Spec (EXACT, evidence-backed)

> v2 (current): premium black/gold/ivory system below. The v1 section documents the
> legacy live-site palette (navy/crimson) it replaced — kept for provenance.
> Platform: WordPress + PHP 8.2 behind Cloudflare · Theme: **Unicamp** (+ `unicamp-child`) · Page builder: **Elementor**

---

# Design System v2 — Premium (CURRENT)

Direction: **"A prestigious engineering institution with a modern technological future."**
Black → authority · Gold → excellence · Ivory → heritage · White → clarity · Maroon → tradition.

## Palette

| Token | Hex | Job |
|---|---|---|
| `brand.black` / `navy` | `#0B0B0C` | Header, hero, footer, dark sections, headings |
| `brand.charcoal` / `navy-700` | `#18181B` | Secondary dark surfaces, cards on dark |
| `brand.gold` / `gold` / `gold-400` | `#F5B800` | Buttons, hover, glows, icons on dark, stats |
| `brand.goldDark` / `crimson` / `gold-600` | `#D89B00` | Links, eyebrows, borders, secondary buttons |
| `brand.ivory` / `surface-grey` | `#F8F6F0` | Main content backgrounds, academic sections |
| `brand.white` / `surface` | `#FFFFFF` | Cards, text on dark, clean spacing |
| `brand.maroon` / `maroon` | `#7A1717` | Heritage/tradition accents ONLY (footer rule, motto) |
| `ink.soft` | `#6B6B6B` | Body text |
| `surface.border` | `#E5E2D9` | 1px editorial borders |

Color ratio: **60% ivory/white · 25% black/charcoal · 10% gold · 5% maroon/accents.**

## Legacy alias mapping (why components kept their class names)

| Legacy token | v2 meaning |
|---|---|
| `navy` (was #072153) | Brand black + neutral scale |
| `crimson` (was #AE152D) | Luxury gold #D89B00 (text-safe on white) |
| `gold` (was #D89142) | Signature gold #F5B800 scale |
| `bvblue` (was #2981BA) | Brand black (btn-blue → black) |
| `ink` | Black / `#6B6B6B` muted text |
| `surface` | White + ivory + `#E5E2D9` borders |

## Typography

- **Display: Manrope** (800/700) — hero, headings, numbers
- **Body: Inter** (400–700) — paragraphs, nav, buttons, forms
- **Heritage serif: Fraunces** — motto, heritage labels only
- Do NOT add more families.

## Component rules

- Hero: black cinematic gradient (`#0B0B0C → #18181B`), gold used only as jewelry (glow, eyebrow, progress dots).
- Buttons: `.btn-primary` = gold bg + black text (≈10:1). One gold button per view, max.
- Cards: white, 1px `#E5E2D9` border, black type, tiny gold indicator, hover `translateY(-4px)` + lift shadow.
- Eyebrows: `text-gold-600` (#D89B00), uppercase, letter-spaced.
- Dark/light rhythm: dark → light → light → dark → light → dark. Never two identical adjacent sections.
- Gold gradients only `#F5B800 → #D89B00`, never flat bright yellow fills.
- Maroon: heritage-only (footer rule, history sections). Never a primary.

## Motion & scroll (premium layer)

- **Smooth scroll:** Lenis, driven by GSAP's ticker, synced to ScrollTrigger
  (`lenis.on("scroll", ScrollTrigger.update)` + `gsap.ticker.lagSmoothing(0)`).
  This is the single source of truth for scroll feel — do not add a second
  rAF scroll loop. See `src/components/motion/SmoothScroll.tsx`.
- **Reduced motion:** every effect has a `useReducedMotion()` escape hatch that
  renders the static variant first. Animated variant is enhancement, never the
  baseline. Lenis skips entirely for reduced-motion users.
- **Performance rule:** scroll animations touch ONLY `transform` and `opacity`
  (compositor-safe). Never animate `top/left/width/height` on scroll.
- **Scroll choreography (homepage):** `HomeHeroScene` layers move at three
  independent rates (photo slowest → glow blobs → content fastest). Reuse
  `Parallax`/`ZoomFrame`/`ClipReveal` from `src/components/motion/Primitives.tsx`
  rather than writing new scroll math.
- **ClipReveal:** the "curtain wipe" (inset clip-path) is the deliberate editorial
  reveal — use sparingly (≤2 per page, one focal image + one block). Parent owns
  the clip, children own transforms — never animate transform AND clip-path on
  the same element.
- **Header:** hides on scroll down, returns on scroll up, blur+shadow once
  scrolled (`src/components/layout/SiteHeader.tsx`). Never hides while the mobile
  menu is open or for reduced-motion users.
- **Effects library:** GSAP free since Apr 2025 — `ScrollPin`/`HorizontalScroll`
  already wired. New pinned/scrubbed timelines go through `gsap.context()` with
  `ScrollTrigger.refresh()` on resize.

## v1 — Live-site evidence (superseded, provenance)

> Every value below was extracted from the live site's own CSS/HTML, mirrored locally in
> `scrape/raw/*.html` and `public/assets/css/*` (2,334 real stylesheets). No guesses.
> Superseded by Design System v2 above (was: navy #072153 + crimson #B7153A + blue #2981BA).

## Brand colors — EXACT

Source: inline Elementor kit CSS in `scrape/raw/index.html`:

| Token | Hex | Evidence |
|---|---|---|
| Primary (deep navy) | `#072153` | `--e-global-color-primary:#072153` |
| Accent (crimson) | `#B7153A` | `--e-global-color-accent:#B7153A` |
| Secondary (near-black) | `#111111` | `--e-global-color-secondary:#111111` |
| Body text (grey) | `#696969` | `--e-global-color-text:#696969` |
| Button blue | `#2981BA` | `--unicamp-color-button-background:#2981ba` |
| Button hover | `#111111` | `--unicamp-color-button-hover-background:#111` |
| Box border | `#EDEDED` | `--unicamp-color-box-border-lighten:#ededed` |
| Grey surface | `#F8F8F8` | `--unicamp-color-box-grey-background` |
| Light surface | `#F9F9FB` | `--unicamp-color-box-light-grey-background` |
| Form surface | `#F5F5F5` | `--unicamp-color-form-background` |

**Most-used hex values on the homepage** (occurrence counts):
`#FFFFFF` ×100 · `#2981BA` ×66 · `#AE152D` ×32 · `#000000` ×12 · `#ABABAB` ×11 ·
`#696969` ×11 · `#9D2235` ×9 · `#D89142` ×8 · `#919191` ×8 · `#F2B51D` ×4 · `#8C0928` ×4

**Crest colors** (from the real logo `cropped-logo.png`): crimson `#AE152D` + gold `#D89142` / `#F2B51D`.

## Typography — EXACT

Loaded from Google Fonts in the homepage `<head>`:
```
Barlow:wght@400;500;600;700;800;900
Manrope:wght@400;500;600;700;800;900
Fraunces:opsz,wght@9..144,700;9..144,800;9..144,900
```
Elementor globals also declare `"Roboto"` (primary, weight 600) and `"Century Gothic"`
(secondary, 17px / weight 400) as fallback typography.

Implementation: `next/font/google` self-hosts Barlow (display), Manrope (body), Fraunces (serif accent).

## Identity

- Brand name as used on site: **BVC Institute of Technology & Science** (crest reads "B.V.C. INSTITUTE OF TECHNOLOGY & SCIENCE / AMALAPURAM").
- Sanskrit motto on crest banner: विश्व विज्ञानं लभ्यते
- Status line: `Autonomous · NAAC 'A' Grade · Amalapuram` · Counselling code **BVTS**
- Phone `+91 99854 22678` · Footer credit: "Developed by CEO Junction"

## Homepage structure (live "Home 2026")

1. Notifications ticker
2. Hero — "Why BVCITS? / **Built for future-ready careers**" / "Shaping confident engineers, innovators and future leaders." · pills: Apply Now · Placements · International Admissions · Results
3. Accreditation badges — AICTE / NAAC 'A' / NBA / JNTUK (real logo images)
4. Highlights — Academics `09 UG · 05 PG` · Placements `1256+` · Research `1000+`
5. About — "Shaping confident engineers…" + At a glance: `40 Acre` green campus, `195+` faculty, `12k+` graduates, `1000+` placed annually
6. Career-ready learning ecosystem — Academic Depth · Placement Momentum · Research & Innovation · Campus Experience
7. Programmes — "Find the programme that fits your ambition." · 01 B.Tech · 02 Degree (BBA & BCA) · 03 PG (M.Tech · MBA · MCA) · 04 Diploma
   B.Tech branches with codes: CSE, AIML, IT, ECE, EEE, CIV, MECH
8. Latest Happenings
9. Placements — "Strong placements. Clear career direction." · `1256+` placements 2026 · `58+` MNC recruiters · `4 Lakhs` average · `12,000+` graduates
10. Campus Life — "Not Just Confined To Classrooms"
11. Institution Highlights + recognitions (Cisco Networking Academy, Pearson VUE)
12. CTA — "Admissions Open 2026-27"

## Exact placement data (live)

Toppers: **K. Naga Satya Rajesh** (22H41A0585 · CSE) — 38 Lakhs p.a., ServiceNow ·
**Palla Pavani** (22H41A4537 · CSE AI&DS) — 15 Lakhs p.a., Centific

Recruiter offers: ServiceNow 38L · Centific 15L · DBS Bank 10L · Infosys 9.5L · ABB 8.80L · TCS 7.10L · Lumen 7.10L
Top recruiters: ServiceNow, Centific, DBS Bank, Infosys, TCS, ABB, Lumen, Accenture

## Harvested assets (local)

| Type | Count | Location |
|---|---|---|
| Images | 418 | `public/assets/images/` |
| Logos | 6 | `public/assets/logos/` |
| Icons | 1 | `public/assets/icons/` |
| Fonts | 57 | `public/assets/fonts/` |
| Documents (PDF etc.) | 64 | `public/documents/` |
| Stylesheets | 2,334 | `public/assets/css/` |
| Raw HTML pages | 300 | `scrape/raw/` |

URL→local mapping: `src/data/asset-map.json` (544 entries).

## Real department data (extracted from 282 mirrored sub-pages)

Sub-pages were fetched from the real sidebar links (their slugs, incl. the site's own typo
`infrastructue`): `{code}-hod`, `{code}-vision-and-mission`, `faculty` / `faculty-profile` /
`me-staff`, `peo-po-psos`, `infrastructure`.

**271 real faculty names** + 9 real HODs extracted:

| Department | HOD (real) | Faculty |
|---|---|---|
| CSE | Dr. Katikireddy Srinivas | 53 |
| AI & DS | Dr. Ravi Kishore Veluri | 14 |
| AI & ML | — (not published) | 22 |
| ECE | Dr. Siva Sankara Phani | 59 |
| EEE | Mr ANVJ Raja Gopal | 14 |
| Mechanical | Mr. B S S Phani Sankar | 0 (roster not published as a table) |
| Civil | Dr. M C S Madan | 11 |
| MBA | Dr. Gokarakonda P S V S D Nagendra Rao | 16 |
| MCA | Mr. AVSM Ganesh | 24 |
| Science & Humanities | Mr. Boddu Sesha Rao | 58 |

Pipeline: `scripts/grab-dept-subpages.mjs` → `scripts/extract-dept-details.mjs` →
`scripts/merge-departments.mjs` → `src/data/real-departments.json`, overlaid onto the typed
model in `src/data/departments.ts` (real values always win over seeded parity content).

Raw HTML pages mirrored: **582**.

## Still to verify (next pass)
- [ ] Exact header height / container width from computed CSS (currently 76px / 1200px).
- [ ] Elementor carousel timings + scroll-animation classes for motion parity.
- [ ] Mechanical faculty roster (published in a non-table layout on the live site).
- [ ] AI&ML HOD name (not published on their HOD page).
- [ ] Real content for Examinations / IQAC / Library sections (agent run interrupted).
