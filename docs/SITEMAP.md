# BVCITS — Sitemap (grounded in live site, 2026-08-14)

> Source: https://bvcits.edu.in/ main nav + footer + department sub-nav. URLs are the
> REAL paths on the live WordPress site. Clone routes should mirror these paths.

## 1. Home
- `/` (live: `/home-page-v2/`)

## 2. About Us — `/about-us/`
On-page anchors: About BVCITS, Vision & Mission, Core Values, Organisation Structure, Principal's Message
- `/about-us/mous/` — MoUs

## 3. Academics
- `/accreditations/`
- `/awards-recognition/`
- `/cells-committees/student-counselling-mentoring-cell/`
- `/student-mentoring/`
- `/academics/skills-enhancement-initiatives/`
- `/academics/code-of-conduct/`

## 4. Admissions — `/admissions/`
Anchors: Overview, Procedure, Course Intake, Enquiry (form)
- External: `https://apply.bvcits.edu.in/` (International Admissions)
- Landing: `/?ff_landing=3` (Apply for Admissions form)

## 5. Departments — `/departments/`
- `/departments/computer-science-engineering/`
- `/departments/ai-ds-new/` (CSE – AI & DS)
- `/departments/cse-artificial-intelligence-machine-learning/` (AI & ML)
- `/departments/electronics-communication-engineering/`
- `/departments/electrical-electronics-engineering/`
- `/departments/mechanical-engineering/`
- `/departments/civil-engineering/`
- `/departments/master-of-business-administration/`
- `/departments/masters-in-computer-application/`
- `/science-humanities/`

> **Each department page has a deep LEFT-SIDEBAR sub-nav** (~25–30 items, many are
> separate pages): About, Vision & Mission, PEO/PO/PSO, OBE, BR Regulations, DAC & PAQIC,
> HOD, BOS Minutes, Faculty, Students (Admissions/Success/Performance/Toppers/
> Certifications/Projects/Awards/Internships), Magazines, Faculty Achievements (FDPs/
> Guest Lectures/Workshops/Books/Methodologies/Awards/Memberships/Conferences), Course
> Structure & Syllabus, Infrastructure, Feedbacks (Curriculum/Facilities/Alumni/Employer/
> Exit/Parent), Associations, Placements, Newsletters, Industry Interaction, Gallery,
> R&D (Publications/Patents/Projects/Consultancy/Funded/Guidance), NBA E-SAR.
> **See PAGE-TYPES.md → "Department" for the modeling strategy (this is the biggest scope driver).**

## 6. Examinations
### Autonomous — `/examinations/autonomous/`
- `/coe/`, `/academic-regulations/`, `/academic-calendars/`, `/course-structure-and-syllabus/`,
  `/examination-rules/`, `/malpractice-guidelines/`, `/notifications/`, `/time-tables/`,
  `/results/`, `/academic-toppers/`, `/downloads/` (all under `/examinations/autonomous/`)
- `/examinations/autonomous-exam-portal/` + `/old-question-papers/`
- `/examinations/model-question-papers/`
- `/examinations/contact-us/`
### JNTUK — `/examinations/jntuk/`
- `/examinations/about-examinations/`, `/staff/`, `/notifications/`, `/results/`,
  `/academic-calendars/`, `/academic-regulations/`, `/syllabus/`, `/time-tables/`,
  `/downloads/`, `/student-background-verification/`

## 7. Placements — `/placements-cell/`
- `/training-and-placement-cell/`
- `/industry-partnerships/`
- `/internship-apprenticeship-opportunities/`
- `/campus-recruitment-statistics/`
- `/entrepreneurship-start-up-support/`
- `/skill-development-initiatives/`
- `/corporate-social-responsibility-csr-engagements/`
- `/professional-certification-programmes/`

## 8. Student Resources
- `/mandatory-disclosures/`
- `/infrastructure/` and `/infrastructure-2/`
- `/student-resources/feedbacks/`
- `/student-resources/research-development-wing/`
- `/technology-partnerships/`
- `/campus-life/`
- External: IEEE Student Branch `https://studentbranches.ieee.org/in-bvts/`
- **Central Library** — `/library/` + `/about-librarian/`, `/library-timings/`,
  `/central-library-library-information-cell/`, `/library-facilities/`, `/services/`, `/general-rules/`

## 9. IQAC
- `/iqac/naac-ssr/`, `/iqac/aqar/`, `/iqac/events/`,
  `/iqac/iqac-cell-composition-and-members/`, `/iqac/iqac-minutes-of-meeting/`,
  `/iqac/iqac-action-taken-report/`, `/iqac/accreditation-status-of-nba-naac/`,
  `/iqac/strategic-development-plan/`
- HR Policy PDF: `/wp-content/uploads/2023/07/HR-Policy.pdf`

## 10. Polytechnic — `/polytechnic/`

## 11. NIRF — `/nirf/`

## 12. Feedback
- `/institute-feedback/` (Student) + `/institute-feedback/faculty-feedback/`
- External AICTE: student & faculty feedback (aicte-india.org)

## Footer-only routes
- `/contact-us/`, `/academics-accreditation/`, `/faculty-research/`, `/campus-programs/`,
  `/events/`, `/category/news/`, `/category/exam-section/autonomous-results/`, `/privacy-policy/`

## Scale summary
~12 top-level sections · ~90–110 distinct non-department routes · department section can
expand to 300+ URLs if every sidebar item is a page. **Department depth is the #1 scope decision.**
