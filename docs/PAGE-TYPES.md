# BVCITS — Page Types (reusable templates)

Grouping the ~100 routes into a small set of templates so we build templates, not pages.

## 1. Home (unique)
14 sections top→bottom: utility bar → header → **notifications ticker** → **hero carousel**
→ accreditation badges (AICTE/NAAC/NBA/JNTUK) → **stats counters** (195+ faculty, 40+ PhD,
57+ publications, 14+ patents) → **programs grid** (B.Tech cards) → recruiter logo carousel →
**placements dashboard** (numbers, 58+ MNCs, 38 LPA highest) → news/events cards → campus-life
gallery → awards logos (CISCO, Pearson VUE) → footer.

## 2. Anchored landing page
Long single page with in-page anchor nav. Examples: About Us, Admissions.
Sections stacked with `id`s; sub-nav dropdown jumps to anchors.

## 3. Department page  ← BIGGEST SCOPE DRIVER
Layout: hero/banner (dept name) + breadcrumb + **left sidebar tree** + main content.
Sidebar tree (~25–30 groups): About, Vision/Mission, PEO/PO/PSO, OBE, BR Regulations,
DAC & PAQIC, HOD, BOS Minutes, Faculty, Students (8 children), Magazines, Faculty
Achievements (8 children), Syllabus, Infrastructure, Feedbacks (6 children), Associations,
Placements, Newsletters, Industry Interaction, Gallery, R&D (6 children), NBA E-SAR.

**Modeling strategy (recommended):**
- Route: `/departments/[slug]` with nested `/departments/[slug]/[section]`.
- The sidebar tree is **data-driven** from a single `departments` dataset (same structure
  for all 10 depts; content differs).
- **Do not hand-build 300 pages.** Build ONE department template + a section renderer that
  reads content blocks (text, table, faculty cards, PDF list, gallery) from data.
- Populate **CSE fully** as the flagship; other depts get structural parity + representative
  content. This is the key scope call for the user.

## 4. Listing page
Cards/rows of items. Examples: News (`/category/news/`), Events, Departments index,
Placements sub-pages, IQAC events.

## 5. Detail / article page
Single record. Examples: news article, MoU detail, notification detail.

## 6. Data / table page
Dense tables + downloadable PDFs. Examples: Exam notifications, results, timetables,
academic calendars, regulations, mandatory disclosures, NIRF, syllabus.

## 7. Faculty listing / profile
Grid of faculty cards → optional profile. Used inside every department + exam staff.

## 8. Form page
Examples: Admission Enquiry, Feedback forms, Contact Us. (Real site uses Fluent Forms.)

## 9. Document/PDF redirect
Many nav items link straight to `/wp-content/uploads/*.pdf`. Model as external doc links,
serve from `public/documents/`.

## 10. Gallery page
Image grids. Campus Life, department galleries, events.
