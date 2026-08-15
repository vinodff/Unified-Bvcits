# BVCITS — Navigation Spec (grounded)

> ⚠️ **Historical reference, not the shipped nav.** This file records the navigation of
> the **live WordPress site** (bvcits.edu.in) as cloned in Phase 1. The app now ships a
> stakeholder-organised header — see **[IA-STAKEHOLDER-NAV.md](IA-STAKEHOLDER-NAV.md)**
> for the navigation that is actually implemented. Every route below is still reachable,
> via `/others`. Keep this file accurate to the *live site*; do not edit it to match
> the app.

## Top utility bar (above header)
Phone `+91 99854 22678` · "Apply for Admissions" (`/?ff_landing=3`) · Counselling code `BVTS`.

## Main header
- **Logo** (left) + institution name with **"Autonomous"** and **"NAAC 'A' Grade"** badges.
- Primary nav (center-right).
- Actions (far right): **Call** button (`tel:+919985422678`), **Apply** button.
- **Sticky** on scroll.

## Primary nav — 12 items with dropdowns
`Home · About Us · Academics · Admissions · Departments · Examinations · Placements ·
Student Resources · IQAC · Polytechnic · NIRF · Feedback`

- **Dropdown menus** on: About Us, Academics, Admissions, Departments, Examinations,
  Placements, Student Resources, IQAC, Feedback.
- **Examinations** is the widest — two columns (Autonomous / JNTUK), ~25 links → mega-menu.
- **Departments** dropdown → 10 department links.
- Some items mix on-page anchors (About Us, Admissions) with real sub-pages.

## Department in-page navigation
Department pages use a **persistent LEFT SIDEBAR** with a deep, collapsible tree
(~25–30 groups, some with nested children). This is a distinct navigation pattern from
the top mega-menu and must be its own component (`DeptSidebar`). See PAGE-TYPES.md.

## Breadcrumbs
Present on interior pages (e.g. department pages show Home › Departments › <Dept>).

## Footer navigation
Columns of quick links: About Us, Admissions, Contact Us, Accreditation, Faculty & Research,
Campus & Programs, Placements, International Admissions, Apply Now, Events, News, Results,
Privacy Policy, Support. Plus contact block (address/phone/email) and copyright
("Powered by CEO Junction").

## Mobile
Hamburger → drawer with the 12 primary items; dropdowns become accordions; department
left-sidebar collapses into an accordion/drawer. (Confirm exact behavior during design forensics
with real screenshots at 320/375/768.)

## External / portal links (must open correctly)
- `https://apply.bvcits.edu.in/` (International Admissions)
- `/?ff_landing=3` (Apply form landing)
- IEEE branch, AICTE feedback (student/faculty)
- HR Policy PDF and other `/wp-content/uploads/...` documents
