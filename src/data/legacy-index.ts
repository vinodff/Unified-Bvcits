// The "Others" archive index — every route that existed in the pre-restructure
// navigation, grouped so nothing became unreachable when the header switched to
// the stakeholder model.
//
// `live: true` marks routes that are fully built pages in this app. Everything
// else still renders the migration notice at app/[...slug]/page.tsx, and is
// labelled as such on /others rather than pretending to be finished.
//
// Grounded in docs/SITEMAP.md.

export type LegacyLink = {
  label: string;
  href: string;
  live?: boolean;
  external?: boolean;
};

export type LegacySection = {
  id: string;
  heading: string;
  description: string;
  links: LegacyLink[];
};

export const legacySections: LegacySection[] = [
  {
    id: "institute",
    heading: "Institute",
    description: "Identity, leadership and the public-facing pages about BVCITS itself.",
    links: [
      { label: "About Us", href: "/about-us", live: true },
      { label: "Vision & Mission", href: "/about-us#vision-mission", live: true },
      { label: "Core Values", href: "/about-us#core-values", live: true },
      { label: "Organisation Structure", href: "/about-us#organisation", live: true },
      { label: "Principal's Message", href: "/about-us#principals-message", live: true },
      { label: "MoUs", href: "/about-us/mous" },
      { label: "Contact Us", href: "/contact-us", live: true },
      { label: "Privacy Policy", href: "/privacy-policy" },
    ],
  },
  {
    id: "academics",
    heading: "Academics & Accreditation",
    description: "Programmes, accreditation standing and the initiatives wrapped around the curriculum.",
    links: [
      { label: "Departments", href: "/departments", live: true },
      { label: "Admissions", href: "/admissions", live: true },
      { label: "Accreditations", href: "/accreditations" },
      { label: "Awards & Recognition", href: "/awards-recognition" },
      { label: "Student Counselling & Mentoring", href: "/student-mentoring" },
      { label: "Skills Enhancement Initiatives", href: "/academics/skills-enhancement-initiatives" },
      { label: "Code of Conduct", href: "/academics/code-of-conduct" },
      { label: "Polytechnic", href: "/polytechnic" },
      { label: "NIRF", href: "/nirf" },
    ],
  },
  {
    id: "examinations-autonomous",
    heading: "Examinations — Autonomous",
    description: "The autonomous examination track run by the institute's own Controller of Examinations.",
    links: [
      { label: "Controller of Examinations", href: "/examinations/autonomous/coe" },
      { label: "Academic Regulations", href: "/examinations/autonomous/academic-regulations" },
      { label: "Academic Calendars", href: "/examinations/autonomous/academic-calendars" },
      { label: "Course Structure & Syllabus", href: "/examinations/autonomous/course-structure-and-syllabus" },
      { label: "Examination Rules", href: "/examinations/autonomous/examination-rules" },
      { label: "Malpractice Guidelines", href: "/examinations/autonomous/malpractice-guidelines" },
      { label: "Notifications", href: "/examinations/autonomous/notifications" },
      { label: "Timetables", href: "/examinations/autonomous/time-tables" },
      { label: "Results", href: "/examinations/autonomous/results" },
      { label: "Academic Toppers", href: "/examinations/autonomous/academic-toppers" },
      { label: "Downloads", href: "/examinations/autonomous/downloads" },
      { label: "Model Question Papers", href: "/examinations/model-question-papers" },
      { label: "Old Question Papers", href: "/examinations/old-question-papers" },
    ],
  },
  {
    id: "examinations-jntuk",
    heading: "Examinations — JNTUK",
    description: "Records maintained under the affiliating university, JNTU Kakinada.",
    links: [
      { label: "About Examinations", href: "/examinations/about-examinations" },
      { label: "Examination Staff", href: "/examinations/staff" },
      { label: "Notifications", href: "/examinations/notifications" },
      { label: "Results", href: "/examinations/results" },
      { label: "Academic Calendars", href: "/examinations/academic-calendars" },
      { label: "Academic Regulations", href: "/examinations/academic-regulations" },
      { label: "Syllabus", href: "/examinations/syllabus" },
      { label: "Timetables", href: "/examinations/time-tables" },
      { label: "Downloads", href: "/examinations/downloads" },
      { label: "Student Background Verification", href: "/examinations/student-background-verification" },
    ],
  },
  {
    id: "iqac",
    heading: "IQAC & Quality Assurance",
    description: "The Internal Quality Assurance Cell's full record — reports, minutes and accreditation status.",
    links: [
      { label: "NAAC SSR", href: "/iqac/naac-ssr" },
      { label: "AQAR", href: "/iqac/aqar" },
      { label: "IQAC Events", href: "/iqac/events" },
      { label: "Cell Composition & Members", href: "/iqac/iqac-cell-composition-and-members" },
      { label: "Minutes of Meeting", href: "/iqac/iqac-minutes-of-meeting" },
      { label: "Action Taken Report", href: "/iqac/iqac-action-taken-report" },
      { label: "Accreditation Status (NBA / NAAC)", href: "/iqac/accreditation-status-of-nba-naac" },
      { label: "Strategic Development Plan", href: "/iqac/strategic-development-plan" },
    ],
  },
  {
    id: "placements",
    heading: "Placements & Industry",
    description: "The Training & Placement Cell and everything it runs.",
    links: [
      { label: "Placements Overview", href: "/placements-cell", live: true },
      { label: "Training & Placement Cell", href: "/placements-cell/training-and-placement-cell" },
      { label: "Industry Partnerships", href: "/placements-cell/industry-partnerships" },
      { label: "Internships & Apprenticeships", href: "/placements-cell/internship-apprenticeship-opportunities" },
      { label: "Campus Recruitment Statistics", href: "/placements-cell/campus-recruitment-statistics" },
      { label: "Entrepreneurship & Start-Up Support", href: "/placements-cell/entrepreneurship-start-up-support" },
      { label: "Skill Development Initiatives", href: "/placements-cell/skill-development-initiatives" },
      { label: "CSR Engagements", href: "/placements-cell/corporate-social-responsibility-csr-engagements" },
      { label: "Professional Certification Programmes", href: "/placements-cell/professional-certification-programmes" },
      { label: "Technology Partnerships", href: "/technology-partnerships" },
    ],
  },
  {
    id: "campus",
    heading: "Campus & Student Resources",
    description: "Facilities, student life and the disclosures that describe them.",
    links: [
      { label: "Campus Life", href: "/campus-life" },
      { label: "Infrastructure", href: "/infrastructure" },
      { label: "Mandatory Disclosures", href: "/mandatory-disclosures" },
      { label: "Research & Development Wing", href: "/student-resources/research-development-wing" },
      { label: "Department Feedbacks", href: "/student-resources/feedbacks" },
      { label: "IEEE Student Branch", href: "https://studentbranches.ieee.org/in-bvts/", external: true },
      { label: "3D Campus Experience", href: "/experience", live: true },
    ],
  },
  {
    id: "library",
    heading: "Central Library",
    description: "Collections, timings, services and the rules that govern them.",
    links: [
      { label: "Central Library", href: "/library" },
      { label: "Library Information Cell", href: "/central-library-library-information-cell" },
      { label: "Library Timings", href: "/library-timings" },
      { label: "Library Facilities", href: "/library-facilities" },
      { label: "Services", href: "/services" },
      { label: "General Rules", href: "/general-rules" },
      { label: "About the Librarian", href: "/about-librarian" },
    ],
  },
  {
    id: "feedback",
    heading: "Feedback & Grievance",
    description: "Institutional feedback channels, including the AICTE-mandated external forms.",
    links: [
      { label: "Student Feedback", href: "/institute-feedback" },
      { label: "Faculty / Staff Feedback", href: "/institute-feedback/faculty-feedback" },
      { label: "Department Feedbacks", href: "/student-resources/feedbacks" },
      { label: "AICTE Student Feedback", href: "https://www.aicte-india.org/feedback/students.php", external: true },
      { label: "AICTE Faculty Feedback", href: "https://www.aicte-india.org/feedback/faculty.php", external: true },
    ],
  },
  {
    id: "news",
    heading: "News & Events",
    description: "Announcements, event coverage and archived result notices.",
    links: [
      { label: "News", href: "/category/news" },
      { label: "Events", href: "/events" },
      { label: "IQAC Events", href: "/iqac/events" },
      { label: "Autonomous Results Archive", href: "/category/exam-section/autonomous-results" },
    ],
  },
];

export const legacyLinkCount = legacySections.reduce((n, s) => n + s.links.length, 0);
