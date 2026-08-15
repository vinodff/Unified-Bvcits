# BVCITS Clone — Global Agent Rules (Shared Contract)

> Every agent/session working on this project reads this file first. It is the shared
> source of truth. Do not let any agent independently decide what the website contains —
> the real site (https://bvcits.edu.in/) and the `docs/` folder are authoritative.

## Institution
- **Full name:** Bonam Venkata Chalamayya Institute of Technology & Science (BVCITS)
- **Location:** Amalapuram, Andhra Pradesh
- **Counselling code:** BVTS
- **Status:** Autonomous, NAAC 'A' Grade, NBA Accredited, AICTE Approved, JNTUK Affiliated
- **Phone:** +91 99854 22678 · **Original site:** https://bvcits.edu.in/ (WordPress)

## Primary objective (Phase 1)
Reproduce the existing site's **information architecture**, not a redesign:
routes, navigation, header/footer, dropdowns, breadcrumbs, page hierarchy, forms,
tables, cards, content structure, responsive behavior, internal/external links.

**Do NOT** invent pages · remove pages that look unimportant · replace real content with
generic placeholder ("Welcome to our college") · redesign during Phase 1.

## Phasing
1. **Clone** — faithful IA + content + structure (grounded in `docs/`). ✅ complete
2. **Modernize** — premium visual layer, motion, subtle 3D. ✅ complete
3. **Hackathon feature** — one flagship differentiator (e.g. AI campus assistant).
4. **QA / harden** — routes, links, responsive, a11y, performance.

> **IA v2 (current):** the shipped navigation is organised by **audience**
> (Students · Parents · Staff · Management · Regulatory · Recruiters · Trainers ·
> About · Others), not by the live site's topical menu. This is a deliberate,
> user-approved Phase 2 decision that supersedes the "do not redesign the IA" rule
> above — **read [IA-STAKEHOLDER-NAV.md](IA-STAKEHOLDER-NAV.md) before touching
> navigation.** The old topical structure is preserved in full under `/others`.

## Technical principles
- Reusable components; no duplicated UI.
- Route logic separate from UI; content/data separate from presentation.
- Semantic HTML, accessible nav, responsive layouts.
- Proper loading / error / not-found states. Descriptive titles + metadata.

## Agent safety rule
Every agent must state: (1) what it inspected, (2) what it discovered, (3) files changed,
(4) files intentionally NOT changed, (5) what the next agent needs to know.
Never silently overwrite another agent's work. Never edit `app/layout.tsx`, global CSS,
or a shared component that another active agent owns.

## Success condition (Phase 1)
Every important original route exists · navigation reaches correct routes · dropdowns work ·
mobile nav works · major visual structures match · content hierarchy matches · no missing
major pages · no dead links · the app builds.

## Legal note
This is a hackathon/educational reconstruction. Before any public deployment, confirm
permission to reuse BVCITS branding, text, images, and PDFs. Structural reproduction is
fine to build; public redistribution of copied assets is a separate question.
