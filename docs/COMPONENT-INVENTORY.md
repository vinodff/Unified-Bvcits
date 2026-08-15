# BVCITS — Component Inventory

## Global (layout — one owner, never double-edited)
- `UtilityBar` — phone, apply link, counselling code
- `Header` — logo + name + Autonomous/NAAC badges + primary nav + Call/Apply CTAs (sticky)
- `PrimaryNav` — 12 items with dropdowns
- `MegaMenu` — Examinations (2-col Autonomous/JNTUK), Departments (10 links)
- `MobileNav` — drawer + accordions
- `Breadcrumb`
- `Footer` — quick-link columns + contact block + copyright
- `RootLayout` (App Router)

## Department
- `DeptSidebar` — data-driven collapsible tree (~25–30 groups)
- `DeptLayout` — hero + breadcrumb + sidebar + content slot
- `DeptSectionRenderer` — renders content blocks by type

## Content blocks (shared, data-driven)
- `Hero` / `PageBanner`
- `NotificationTicker` (home)
- `HeroCarousel` (home)
- `StatCounter` / `StatsRow`
- `ProgramCard` / `DepartmentCard`
- `LogoCarousel` (recruiters, awards)
- `PlacementsDashboard`
- `NewsCard` / `EventCard`
- `GalleryGrid`
- `AccreditationBadges`
- `FacultyCard` / `FacultyGrid` / `FacultyProfile`
- `DataTable` (sortable, responsive → horizontal scroll on mobile)
- `PdfList` / `DownloadLink`
- `AnchorNav` (for anchored landing pages)
- `SectionHeader`
- `CTASection`

## Forms
- `EnquiryForm` (admission)
- `FeedbackForm`
- `ContactForm`

## UI primitives
- `Button` (primary=orange/gold, secondary=blue outline)
- `Card`, `Badge`, `Tabs`, `Accordion`, `Modal`, `Pagination`, `Container`

## State/feedback
- `loading.tsx`, `error.tsx`, `not-found.tsx` per segment
