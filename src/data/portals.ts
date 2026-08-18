// Stakeholder portal model. ONE template (components/portal/PortalPage.tsx)
// renders all seven audience portals, and src/lib/site.ts derives the primary
// navigation from this same data — so a link added here appears in the header,
// the page, and the footer without being written three times.
//
// Grounded in docs/SITEMAP.md: every `href` below is either a real route in this
// app or a documented route on the live site (which currently renders the
// migration stub at app/[...slug]). No invented paths.

import type { ComponentType } from "react";
import {
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Handshake,
  Library,
  Lightbulb,
  ListChecks,
  MessageSquare,
  Rocket,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
} from "@/components/ui/icons";

export type IconType = ComponentType<{ className?: string }>;

/** A prominent "what did you come here to do" tile at the top of a portal. */
export type PortalAction = {
  label: string;
  href: string;
  description: string;
  icon: IconType;
  external?: boolean;
};

export type PortalLink = {
  label: string;
  href: string;
  external?: boolean;
};

/** A titled cluster of links. `id` doubles as the in-page anchor used by the nav. */
export type PortalGroup = {
  id: string;
  heading: string;
  description: string;
  links: PortalLink[];
};

export type PortalStat = { value: string; label: string };

export type Portal = {
  slug: string;
  /** Short label used in the header and the audience switcher. */
  navLabel: string;
  title: string;
  eyebrow: string;
  subtitle: string;
  /** One-line summary shown on the home audience-router cards. */
  summary: string;
  image: string;
  metaDescription: string;
  icon: IconType;
  actions: PortalAction[];
  stats?: PortalStat[];
  groups: PortalGroup[];
  contact: { heading: string; body: string; ctaLabel: string; ctaHref: string };
};

// Reused across portals — the institute's published, documented figures only.
const PLACEMENT_STATS: PortalStat[] = [
  { value: "1256+", label: "Offers (2026)" },
  { value: "58+", label: "Recruiting MNCs" },
  { value: "38 LPA", label: "Highest Package" },
  { value: "92%", label: "Placement Rate" },
];

export const portals: Portal[] = [
  // ---------------------------------------------------------------- STUDENTS
  {
    slug: "students",
    navLabel: "Students",
    eyebrow: "Student Portal",
    title: "For Students",
    subtitle:
      "Results, timetables, syllabus, the library and every support cell on campus — the whole semester in one place.",
    summary: "Results, timetables, syllabus, library, clubs and student support.",
    image: "/assets/images/DSC07406-scaled.jpg",
    metaDescription:
      "Student portal for BVCITS — examination results, timetables, syllabus, academic calendars, library, mentoring and campus life.",
    icon: GraduationCap,
    actions: [
      {
        // Repointed from the /examinations/autonomous/results migration stub to
        // the live lookup. This is now a real route in this app that answers
        // the question the tile promises — the stub only listed notices.
        label: "Check Your Results",
        href: "/students/results",
        description: "Enter your hall ticket number and date of birth. No account needed.",
        icon: Trophy,
      },
      {
        label: "Timetables",
        href: "/students/timetable",
        description: "Live class timetable with the current period highlighted.",
        icon: CalendarDays,
      },
      {
        label: "Syllabus",
        href: "/examinations/autonomous/course-structure-and-syllabus",
        description: "Course structure for every regulation.",
        icon: BookOpen,
      },
      {
        label: "Notifications",
        href: "/examinations/autonomous/notifications",
        description: "Exam notices, fee dates and circulars.",
        icon: Bell,
      },
    ],
    stats: [
      { value: "10", label: "Departments" },
      { value: "195+", label: "Faculty" },
      { value: "40+", label: "PhD Faculty" },
      { value: "1256+", label: "Offers (2026)" },
    ],
    groups: [
      {
        id: "academics",
        heading: "Academics",
        description: "Your programme, its regulations and the calendar you are graded against.",
        links: [
          { label: "All Departments", href: "/departments" },
          { label: "Course Structure & Syllabus", href: "/examinations/autonomous/course-structure-and-syllabus" },
          { label: "Academic Regulations", href: "/examinations/autonomous/academic-regulations" },
          { label: "Academic Calendars", href: "/examinations/autonomous/academic-calendars" },
          { label: "Skills Enhancement Initiatives", href: "/academics/skills-enhancement-initiatives" },
          { label: "Code of Conduct", href: "/academics/code-of-conduct" },
        ],
      },
      {
        id: "examinations",
        heading: "Examinations",
        description: "Both examination tracks — the autonomous COE and JNTUK — with rules, papers and results.",
        links: [
          { label: "Autonomous Results", href: "/examinations/autonomous/results" },
          { label: "JNTUK Results", href: "/examinations/results" },
          { label: "Examination Notifications", href: "/examinations/autonomous/notifications" },
          { label: "Class Timetable", href: "/students/timetable" },
          { label: "Model Question Papers", href: "/examinations/model-question-papers" },
          { label: "Old Question Papers", href: "/examinations/old-question-papers" },
          { label: "Examination Rules", href: "/examinations/autonomous/examination-rules" },
          { label: "Malpractice Guidelines", href: "/examinations/autonomous/malpractice-guidelines" },
          { label: "Academic Toppers", href: "/examinations/autonomous/academic-toppers" },
          { label: "Controller of Examinations", href: "/examinations/autonomous/coe" },
        ],
      },
      {
        id: "campus",
        heading: "Campus & Facilities",
        description: "Where you study, read and spend the rest of the day.",
        links: [
          { label: "Campus Life", href: "/campus-life" },
          { label: "Central Library", href: "/library" },
          { label: "Library Timings", href: "/library-timings" },
          { label: "Library Facilities", href: "/library-facilities" },
          { label: "Infrastructure", href: "/infrastructure" },
          { label: "IEEE Student Branch", href: "https://studentbranches.ieee.org/in-bvts/", external: true },
        ],
      },
      {
        id: "career",
        heading: "Career & Skills",
        description: "Training, certifications and the route from classroom to offer letter.",
        links: [
          { label: "Training & Placement Cell", href: "/placements-cell/training-and-placement-cell" },
          { label: "Internships & Apprenticeships", href: "/placements-cell/internship-apprenticeship-opportunities" },
          { label: "Skill Development Initiatives", href: "/placements-cell/skill-development-initiatives" },
          { label: "Professional Certification Programmes", href: "/placements-cell/professional-certification-programmes" },
          { label: "Entrepreneurship & Start-Up Support", href: "/placements-cell/entrepreneurship-start-up-support" },
          { label: "Research & Development Wing", href: "/student-resources/research-development-wing" },
        ],
      },
      {
        id: "support",
        heading: "Support & Your Voice",
        description: "Mentoring, grievances and the feedback channels that are actually read.",
        links: [
          { label: "Student Counselling & Mentoring", href: "/student-mentoring" },
          { label: "Student Feedback", href: "/institute-feedback" },
          { label: "Department Feedbacks", href: "/student-resources/feedbacks" },
          { label: "AICTE Student Feedback", href: "https://www.aicte-india.org/feedback/students.php", external: true },
          { label: "Contact the Institute", href: "/contact-us" },
        ],
      },
    ],
    contact: {
      heading: "Need help with something not listed here?",
      body: "The student counselling and mentoring cell can point you to the right department or office.",
      ctaLabel: "Contact Student Support",
      ctaHref: "/contact-us",
    },
  },

  // ----------------------------------------------------------------- PARENTS
  {
    slug: "parents",
    navLabel: "Parents",
    eyebrow: "Parents & Guardians",
    title: "For Parents & Guardians",
    subtitle:
      "Admissions, academic progress, campus wellbeing and placement outcomes — the answers families ask for most, without the runaround.",
    summary: "Admissions, fees, academic progress, campus safety and outcomes.",
    image: "/assets/images/CA_04490-min-scaled.jpg",
    metaDescription:
      "Information for parents and guardians of BVCITS students — admissions, academic calendars, results, campus safety, transparency reports and placement outcomes.",
    icon: Users,
    actions: [
      {
        label: "Admission Enquiry",
        href: "/admissions#enquiry",
        description: "Ask the admissions office a question directly.",
        icon: Send,
      },
      {
        label: "Course Intake",
        href: "/admissions#intake",
        description: "Programmes offered and sanctioned intake.",
        icon: ListChecks,
      },
      {
        label: "Placement Record",
        href: "/placements-cell",
        description: "Where our graduates actually end up.",
        icon: TrendingUp,
      },
      {
        label: "Contact the Institute",
        href: "/contact-us",
        description: "Phone, email and campus address.",
        icon: MessageSquare,
      },
    ],
    stats: PLACEMENT_STATS,
    groups: [
      {
        id: "admissions",
        heading: "Admissions & Enrolment",
        description: "How a seat is secured, under which counselling code, and what the process asks of you.",
        links: [
          { label: "Admissions Overview", href: "/admissions#overview" },
          { label: "Admissions Procedure", href: "/admissions#procedure" },
          { label: "Course Intake", href: "/admissions#intake" },
          { label: "Admission Enquiry Form", href: "/admissions#enquiry" },
          { label: "International Admissions", href: "https://apply.bvcits.edu.in/", external: true },
          { label: "All Departments", href: "/departments" },
        ],
      },
      {
        id: "progress",
        heading: "Academic Progress",
        description: "The calendar your child is measured against, and where results are published.",
        links: [
          { label: "Academic Calendars", href: "/examinations/autonomous/academic-calendars" },
          { label: "Examination Results", href: "/examinations/autonomous/results" },
          { label: "Academic Regulations", href: "/examinations/autonomous/academic-regulations" },
          { label: "Academic Toppers", href: "/examinations/autonomous/academic-toppers" },
          { label: "Examination Notifications", href: "/examinations/autonomous/notifications" },
        ],
      },
      {
        id: "wellbeing",
        heading: "Campus & Wellbeing",
        description: "Facilities, conduct standards and the people responsible for student welfare.",
        links: [
          { label: "Campus Life", href: "/campus-life" },
          { label: "Infrastructure", href: "/infrastructure" },
          { label: "Central Library", href: "/library" },
          { label: "Student Counselling & Mentoring", href: "/student-mentoring" },
          { label: "Code of Conduct", href: "/academics/code-of-conduct" },
        ],
      },
      {
        id: "outcomes",
        heading: "Outcomes & Employability",
        description: "What the degree leads to — recruiters, packages and training that gets students there.",
        links: [
          { label: "Placements Overview", href: "/placements-cell" },
          { label: "Campus Recruitment Statistics", href: "/placements-cell/campus-recruitment-statistics" },
          { label: "Training & Placement Cell", href: "/placements-cell/training-and-placement-cell" },
          { label: "Industry Partnerships", href: "/placements-cell/industry-partnerships" },
          { label: "Internships & Apprenticeships", href: "/placements-cell/internship-apprenticeship-opportunities" },
        ],
      },
      {
        id: "transparency",
        heading: "Transparency & Accreditation",
        description: "Public records that let you verify the institute's standing for yourself.",
        links: [
          { label: "Mandatory Disclosures", href: "/mandatory-disclosures" },
          { label: "Accreditations", href: "/accreditations" },
          { label: "NIRF", href: "/nirf" },
          { label: "NAAC SSR", href: "/iqac/naac-ssr" },
          { label: "Accreditation Status (NBA / NAAC)", href: "/iqac/accreditation-status-of-nba-naac" },
          { label: "Awards & Recognition", href: "/awards-recognition" },
        ],
      },
      {
        id: "feedback",
        heading: "Raise a Concern",
        description: "Formal feedback routes, including the parent feedback channel run by each department.",
        links: [
          { label: "Institute Feedback", href: "/institute-feedback" },
          { label: "Department Feedbacks (incl. Parent)", href: "/student-resources/feedbacks" },
          { label: "Contact Us", href: "/contact-us" },
        ],
      },
    ],
    contact: {
      heading: "Want to speak to someone directly?",
      body: "Reach the principal's office or your child's department head using the contact directory.",
      ctaLabel: "Contact the Institute",
      ctaHref: "/contact-us",
    },
  },

  // ------------------------------------------------------------------- STAFF
  {
    slug: "staff",
    navLabel: "Staff",
    eyebrow: "Faculty & Staff",
    title: "For Faculty & Staff",
    subtitle:
      "Teaching resources, professional development, research support and the institutional duties that come with the role.",
    summary: "Teaching resources, FDPs, research support and IQAC duties.",
    image: "/assets/images/UKS_5811-scaled.jpg",
    metaDescription:
      "Faculty and staff resources at BVCITS — academic regulations, faculty development, research and consultancy, IQAC responsibilities and HR policy.",
    icon: UserCheck,
    actions: [
      {
        label: "Academic Calendars",
        href: "/examinations/autonomous/academic-calendars",
        description: "Teaching schedule for the current cycle.",
        icon: CalendarDays,
      },
      {
        label: "Regulations & Syllabus",
        href: "/examinations/autonomous/academic-regulations",
        description: "Current BR regulations and course structure.",
        icon: BookOpen,
      },
      {
        label: "Research & Development",
        href: "/student-resources/research-development-wing",
        description: "Publications, patents and funded projects.",
        icon: Lightbulb,
      },
      {
        label: "IQAC",
        href: "/iqac/naac-ssr",
        description: "Quality cell records and reporting duties.",
        icon: ClipboardCheck,
      },
    ],
    stats: [
      { value: "195+", label: "Faculty" },
      { value: "40+", label: "PhD Holders" },
      { value: "57+", label: "Publications" },
      { value: "14+", label: "Patents" },
    ],
    groups: [
      {
        id: "teaching",
        heading: "Teaching & Assessment",
        description: "Everything you need to plan a semester and run an examination correctly.",
        links: [
          { label: "Academic Calendars", href: "/examinations/autonomous/academic-calendars" },
          { label: "Academic Regulations", href: "/examinations/autonomous/academic-regulations" },
          { label: "Course Structure & Syllabus", href: "/examinations/autonomous/course-structure-and-syllabus" },
          { label: "Examination Rules", href: "/examinations/autonomous/examination-rules" },
          { label: "Malpractice Guidelines", href: "/examinations/autonomous/malpractice-guidelines" },
          { label: "Examination Staff", href: "/examinations/staff" },
          { label: "Code of Conduct", href: "/academics/code-of-conduct" },
        ],
      },
      {
        id: "development",
        heading: "Professional Development",
        description: "FDPs, workshops and certification tracks open to teaching staff.",
        links: [
          { label: "Skills Enhancement Initiatives", href: "/academics/skills-enhancement-initiatives" },
          { label: "Professional Certification Programmes", href: "/placements-cell/professional-certification-programmes" },
          { label: "Technology Partnerships", href: "/technology-partnerships" },
          { label: "Awards & Recognition", href: "/awards-recognition" },
          { label: "Departments (Faculty Achievements)", href: "/departments" },
        ],
      },
      {
        id: "research",
        heading: "Research & Consultancy",
        description: "Publication support, patent filing, funded projects and industry consultancy.",
        links: [
          { label: "Research & Development Wing", href: "/student-resources/research-development-wing" },
          { label: "Industry Partnerships", href: "/placements-cell/industry-partnerships" },
          { label: "MoUs", href: "/about-us/mous" },
          { label: "Central Library", href: "/library" },
        ],
      },
      {
        id: "quality",
        heading: "Quality & Compliance",
        description: "The IQAC record trail every department contributes to.",
        links: [
          { label: "NAAC SSR", href: "/iqac/naac-ssr" },
          { label: "AQAR", href: "/iqac/aqar" },
          { label: "IQAC Cell Composition & Members", href: "/iqac/iqac-cell-composition-and-members" },
          { label: "IQAC Minutes of Meeting", href: "/iqac/iqac-minutes-of-meeting" },
          { label: "IQAC Action Taken Report", href: "/iqac/iqac-action-taken-report" },
          { label: "Strategic Development Plan", href: "/iqac/strategic-development-plan" },
        ],
      },
      {
        id: "hr",
        heading: "HR & Policy",
        description: "Institutional policy and the feedback channels staff are asked to complete.",
        links: [
          { label: "Faculty / Staff Feedback", href: "/institute-feedback/faculty-feedback" },
          { label: "AICTE Faculty Feedback", href: "https://www.aicte-india.org/feedback/faculty.php", external: true },
          { label: "Organisation Structure", href: "/about-us#organisation" },
          { label: "Contact Us", href: "/contact-us" },
        ],
      },
    ],
    contact: {
      heading: "Looking for a form or policy document?",
      body: "The administrative office maintains the current versions of all staff policy documents.",
      ctaLabel: "Contact Administration",
      ctaHref: "/contact-us",
    },
  },

  // -------------------------------------------------------------- MANAGEMENT
  {
    slug: "management",
    navLabel: "Management",
    eyebrow: "Management & Governance",
    title: "For Management & Governance",
    subtitle:
      "Institutional performance, governance records, statutory reports and the strategic plan they feed into.",
    summary: "Governance records, institutional performance and strategic planning.",
    image: "/assets/images/DJI_0575-min-scaled.jpg",
    metaDescription:
      "Governance and management view of BVCITS — organisation structure, IQAC records, NIRF and NAAC reporting, strategic development plan and institutional performance.",
    icon: Building2,
    actions: [
      {
        label: "Strategic Development Plan",
        href: "/iqac/strategic-development-plan",
        description: "The institute's forward plan and targets.",
        icon: Target,
      },
      {
        label: "NIRF",
        href: "/nirf",
        description: "National ranking submissions and data.",
        icon: TrendingUp,
      },
      {
        label: "Mandatory Disclosures",
        href: "/mandatory-disclosures",
        description: "Statutory disclosure set, in full.",
        icon: FileText,
      },
      {
        label: "IQAC Minutes",
        href: "/iqac/iqac-minutes-of-meeting",
        description: "Decisions of record and action taken.",
        icon: ClipboardCheck,
      },
    ],
    groups: [
      {
        id: "governance",
        heading: "Governance",
        description: "Who decides what, and the minuted record of those decisions.",
        links: [
          { label: "Organisation Structure", href: "/about-us#organisation" },
          { label: "Principal's Message", href: "/about-us#principals-message" },
          { label: "IQAC Cell Composition & Members", href: "/iqac/iqac-cell-composition-and-members" },
          { label: "IQAC Minutes of Meeting", href: "/iqac/iqac-minutes-of-meeting" },
          { label: "IQAC Action Taken Report", href: "/iqac/iqac-action-taken-report" },
          { label: "IQAC Events", href: "/iqac/events" },
        ],
      },
      {
        id: "performance",
        heading: "Institutional Performance",
        description: "The numbers the institute is judged on, internally and externally.",
        links: [
          { label: "NIRF", href: "/nirf" },
          { label: "Campus Recruitment Statistics", href: "/placements-cell/campus-recruitment-statistics" },
          { label: "Accreditations", href: "/accreditations" },
          { label: "Awards & Recognition", href: "/awards-recognition" },
          { label: "Academic Toppers", href: "/examinations/autonomous/academic-toppers" },
          { label: "Research & Development Wing", href: "/student-resources/research-development-wing" },
        ],
      },
      {
        id: "strategy",
        heading: "Strategy & Partnerships",
        description: "Where growth is coming from — collaborations, industry ties and social commitments.",
        links: [
          { label: "Strategic Development Plan", href: "/iqac/strategic-development-plan" },
          { label: "MoUs", href: "/about-us/mous" },
          { label: "Industry Partnerships", href: "/placements-cell/industry-partnerships" },
          { label: "Technology Partnerships", href: "/technology-partnerships" },
          { label: "CSR Engagements", href: "/placements-cell/corporate-social-responsibility-csr-engagements" },
          { label: "Entrepreneurship & Start-Up Support", href: "/placements-cell/entrepreneurship-start-up-support" },
        ],
      },
      {
        id: "reports",
        heading: "Reports & Disclosures",
        description: "The document set requested by every accrediting and funding body.",
        links: [
          { label: "Mandatory Disclosures", href: "/mandatory-disclosures" },
          { label: "NAAC SSR", href: "/iqac/naac-ssr" },
          { label: "AQAR", href: "/iqac/aqar" },
          { label: "Accreditation Status (NBA / NAAC)", href: "/iqac/accreditation-status-of-nba-naac" },
          { label: "Regulatory & Statutory Index", href: "/regulatory" },
        ],
      },
      {
        id: "academic-units",
        heading: "Academic Units",
        description: "Departmental performance, leadership and intake across all programmes.",
        links: [
          { label: "All Departments", href: "/departments" },
          { label: "Polytechnic", href: "/polytechnic" },
          { label: "Course Intake", href: "/admissions#intake" },
          { label: "Infrastructure", href: "/infrastructure" },
        ],
      },
    ],
    contact: {
      heading: "Need a report that isn't published here?",
      body: "The IQAC maintains the full institutional record and can supply documents on request.",
      ctaLabel: "Contact the IQAC",
      ctaHref: "/contact-us",
    },
  },

  // -------------------------------------------------------------- REGULATORY
  {
    slug: "regulatory",
    navLabel: "Regulatory",
    eyebrow: "JNTUK · AICTE · UGC · NAAC · NBA · NIRF",
    title: "For Regulatory & Government Bodies",
    subtitle:
      "An audit-ready index of statutory disclosures, accreditation records and affiliation compliance — organised by the body that asks for it.",
    summary: "JNTUK, AICTE, UGC, NAAC, NBA and NIRF compliance records in one index.",
    image: "/assets/images/iqac.jpg",
    metaDescription:
      "Regulatory and statutory index for BVCITS — JNTUK affiliation records, AICTE disclosures, NAAC SSR and AQAR, NBA accreditation status and NIRF submissions.",
    icon: BadgeCheck,
    actions: [
      {
        label: "Mandatory Disclosures",
        href: "/mandatory-disclosures",
        description: "The complete AICTE disclosure set.",
        icon: FileText,
      },
      {
        label: "NAAC SSR",
        href: "/iqac/naac-ssr",
        description: "Self-study report and supporting data.",
        icon: ClipboardCheck,
      },
      {
        label: "Accreditation Status",
        href: "/iqac/accreditation-status-of-nba-naac",
        description: "Current NBA and NAAC standing.",
        icon: BadgeCheck,
      },
      {
        label: "NIRF",
        href: "/nirf",
        description: "Ranking submissions, year by year.",
        icon: TrendingUp,
      },
    ],
    groups: [
      {
        id: "jntuk",
        heading: "JNTUK — Affiliating University",
        description:
          "Records maintained under Jawaharlal Nehru Technological University Kakinada affiliation.",
        links: [
          { label: "About Examinations", href: "/examinations/about-examinations" },
          { label: "JNTUK Notifications", href: "/examinations/notifications" },
          { label: "JNTUK Results", href: "/examinations/results" },
          { label: "JNTUK Academic Calendars", href: "/examinations/academic-calendars" },
          { label: "JNTUK Academic Regulations", href: "/examinations/academic-regulations" },
          { label: "JNTUK Syllabus", href: "/examinations/syllabus" },
          { label: "JNTUK Timetables", href: "/examinations/time-tables" },
          { label: "Student Background Verification", href: "/examinations/student-background-verification" },
          { label: "Examination Staff", href: "/examinations/staff" },
          { label: "Downloads", href: "/examinations/downloads" },
        ],
      },
      {
        id: "aicte",
        heading: "AICTE",
        description: "Approval-linked disclosures and the mandated student and faculty feedback channels.",
        links: [
          { label: "Mandatory Disclosures", href: "/mandatory-disclosures" },
          { label: "Accreditations", href: "/accreditations" },
          { label: "Course Intake", href: "/admissions#intake" },
          { label: "AICTE Student Feedback", href: "https://www.aicte-india.org/feedback/students.php", external: true },
          { label: "AICTE Faculty Feedback", href: "https://www.aicte-india.org/feedback/faculty.php", external: true },
        ],
      },
      {
        id: "naac",
        heading: "NAAC & IQAC",
        description: "Quality assurance record — self-study, annual reports and the cell that produces them.",
        links: [
          { label: "NAAC SSR", href: "/iqac/naac-ssr" },
          { label: "AQAR", href: "/iqac/aqar" },
          { label: "IQAC Cell Composition & Members", href: "/iqac/iqac-cell-composition-and-members" },
          { label: "IQAC Minutes of Meeting", href: "/iqac/iqac-minutes-of-meeting" },
          { label: "IQAC Action Taken Report", href: "/iqac/iqac-action-taken-report" },
          { label: "IQAC Events", href: "/iqac/events" },
          { label: "Strategic Development Plan", href: "/iqac/strategic-development-plan" },
        ],
      },
      {
        id: "nba",
        heading: "NBA — Programme Accreditation",
        description: "Programme-level accreditation status and the per-department E-SAR record.",
        links: [
          { label: "Accreditation Status (NBA / NAAC)", href: "/iqac/accreditation-status-of-nba-naac" },
          { label: "Accreditations Overview", href: "/accreditations" },
          { label: "Departments (NBA E-SAR)", href: "/departments" },
        ],
      },
      {
        id: "autonomous",
        heading: "Autonomous Status (UGC)",
        description: "The examination and curriculum machinery that autonomy requires the institute to run itself.",
        links: [
          { label: "Controller of Examinations", href: "/examinations/autonomous/coe" },
          { label: "Academic Regulations", href: "/examinations/autonomous/academic-regulations" },
          { label: "Course Structure & Syllabus", href: "/examinations/autonomous/course-structure-and-syllabus" },
          { label: "Academic Calendars", href: "/examinations/autonomous/academic-calendars" },
          { label: "Examination Rules", href: "/examinations/autonomous/examination-rules" },
          { label: "Malpractice Guidelines", href: "/examinations/autonomous/malpractice-guidelines" },
          { label: "Departments (BOS Minutes)", href: "/departments" },
        ],
      },
      {
        id: "rankings",
        heading: "Rankings & Recognition",
        description: "Externally assessed standing and awards on the public record.",
        links: [
          { label: "NIRF", href: "/nirf" },
          { label: "Awards & Recognition", href: "/awards-recognition" },
          { label: "Research & Development Wing", href: "/student-resources/research-development-wing" },
        ],
      },
    ],
    contact: {
      heading: "Requesting a document for an inspection or audit?",
      body: "The IQAC and the Controller of Examinations hold the authoritative copies of all statutory records.",
      ctaLabel: "Contact the Institute",
      ctaHref: "/contact-us",
    },
  },

  // -------------------------------------------------------------- RECRUITERS
  {
    slug: "recruiters",
    navLabel: "Recruiters",
    eyebrow: "Campus Hiring",
    title: "For Recruiters",
    subtitle:
      "Hire from ten disciplines with a placement record to match — the process, the numbers and how to schedule a drive.",
    summary: "Placement record, talent pool by discipline and how to schedule a drive.",
    image: "/assets/images/DSC06792-scaled.jpg",
    metaDescription:
      "Recruit from BVCITS — campus recruitment statistics, talent pool across ten departments, training and certification programmes, and how to schedule a campus drive.",
    icon: Briefcase,
    actions: [
      {
        label: "Schedule a Campus Drive",
        href: "/contact-us",
        description: "Reach the Training & Placement Cell directly.",
        icon: Send,
      },
      {
        label: "Recruitment Statistics",
        href: "/placements-cell/campus-recruitment-statistics",
        description: "Year-wise offers, packages and recruiters.",
        icon: TrendingUp,
      },
      {
        label: "Talent Pool",
        href: "/departments",
        description: "Ten departments, UG and PG, with intake.",
        icon: Users,
      },
      {
        label: "Training & Placement Cell",
        href: "/placements-cell/training-and-placement-cell",
        description: "How candidates are prepared before you meet them.",
        icon: Target,
      },
    ],
    stats: PLACEMENT_STATS,
    groups: [
      {
        id: "talent",
        heading: "Talent Pool",
        description: "Who you would be hiring — by discipline, with intake and demonstrated work.",
        links: [
          { label: "All Departments", href: "/departments" },
          { label: "Course Intake", href: "/admissions#intake" },
          { label: "Academic Toppers", href: "/examinations/autonomous/academic-toppers" },
          { label: "Polytechnic", href: "/polytechnic" },
        ],
      },
      {
        id: "record",
        heading: "Placement Record",
        description: "The published hiring history, and the cell that runs the process.",
        links: [
          { label: "Placements Overview", href: "/placements-cell" },
          { label: "Campus Recruitment Statistics", href: "/placements-cell/campus-recruitment-statistics" },
          { label: "Training & Placement Cell", href: "/placements-cell/training-and-placement-cell" },
          { label: "Internships & Apprenticeships", href: "/placements-cell/internship-apprenticeship-opportunities" },
          { label: "Industry Partnerships", href: "/placements-cell/industry-partnerships" },
        ],
      },
      {
        id: "readiness",
        heading: "Candidate Readiness",
        description: "Certifications, skill programmes and industry tooling students train on before placement season.",
        links: [
          { label: "Skill Development Initiatives", href: "/placements-cell/skill-development-initiatives" },
          { label: "Professional Certification Programmes", href: "/placements-cell/professional-certification-programmes" },
          { label: "Technology Partnerships", href: "/technology-partnerships" },
          { label: "Skills Enhancement Initiatives", href: "/academics/skills-enhancement-initiatives" },
          { label: "Entrepreneurship & Start-Up Support", href: "/placements-cell/entrepreneurship-start-up-support" },
        ],
      },
      {
        id: "credentials",
        heading: "Institutional Credentials",
        description: "Accreditation and ranking evidence for your vendor or campus-approval process.",
        links: [
          { label: "Accreditations", href: "/accreditations" },
          { label: "NIRF", href: "/nirf" },
          { label: "Awards & Recognition", href: "/awards-recognition" },
          { label: "Mandatory Disclosures", href: "/mandatory-disclosures" },
          { label: "About BVCITS", href: "/about-us" },
        ],
      },
    ],
    contact: {
      heading: "Ready to schedule a drive?",
      body: "The Training & Placement Cell coordinates dates, shortlists and on-campus logistics.",
      ctaLabel: "Contact the Placement Cell",
      ctaHref: "/contact-us",
    },
  },

  // ---------------------------------------------------------------- TRAINERS
  {
    slug: "trainers",
    navLabel: "Trainers",
    eyebrow: "Training Partners",
    title: "For Trainers & Training Partners",
    subtitle:
      "Deliver certifications, skill programmes and industry training on campus — the programmes we run and how to propose one.",
    summary: "Deliver certifications and skill programmes on campus.",
    image: "/assets/images/WORKSHOP-BY-G-S-S-SASTRY.jpg",
    metaDescription:
      "Partner with BVCITS as a trainer or training provider — existing skill development and certification programmes, partnership routes, campus facilities and points of contact.",
    icon: Sparkles,
    actions: [
      {
        label: "Propose a Programme",
        href: "/contact-us",
        description: "Bring a course or certification to campus.",
        icon: Send,
      },
      {
        label: "Skill Development",
        href: "/placements-cell/skill-development-initiatives",
        description: "Programmes already running on campus.",
        icon: Rocket,
      },
      {
        label: "Certification Programmes",
        href: "/placements-cell/professional-certification-programmes",
        description: "Existing certification tracks and partners.",
        icon: Award,
      },
      {
        label: "Technology Partnerships",
        href: "/technology-partnerships",
        description: "Current platform and vendor tie-ups.",
        icon: Handshake,
      },
    ],
    groups: [
      {
        id: "programmes",
        heading: "Programmes We Run",
        description: "The existing training surface — worth reading before proposing something adjacent.",
        links: [
          { label: "Skill Development Initiatives", href: "/placements-cell/skill-development-initiatives" },
          { label: "Professional Certification Programmes", href: "/placements-cell/professional-certification-programmes" },
          { label: "Skills Enhancement Initiatives", href: "/academics/skills-enhancement-initiatives" },
          { label: "Training & Placement Cell", href: "/placements-cell/training-and-placement-cell" },
          { label: "Entrepreneurship & Start-Up Support", href: "/placements-cell/entrepreneurship-start-up-support" },
        ],
      },
      {
        id: "partnership",
        heading: "Partnership Routes",
        description: "How external organisations are formally engaged by the institute.",
        links: [
          { label: "MoUs", href: "/about-us/mous" },
          { label: "Industry Partnerships", href: "/placements-cell/industry-partnerships" },
          { label: "Technology Partnerships", href: "/technology-partnerships" },
          { label: "CSR Engagements", href: "/placements-cell/corporate-social-responsibility-csr-engagements" },
        ],
      },
      {
        id: "facilities",
        heading: "Campus & Facilities",
        description: "Where training is delivered — labs, library and departmental infrastructure.",
        links: [
          { label: "Infrastructure", href: "/infrastructure" },
          { label: "Central Library", href: "/library" },
          { label: "Departments & Labs", href: "/departments" },
          { label: "Campus Life", href: "/campus-life" },
        ],
      },
      {
        id: "counterparts",
        heading: "Who You'll Work With",
        description: "The cells that own training, research and quality on the institute side.",
        links: [
          { label: "Training & Placement Cell", href: "/placements-cell/training-and-placement-cell" },
          { label: "Research & Development Wing", href: "/student-resources/research-development-wing" },
          { label: "IQAC", href: "/iqac/naac-ssr" },
          { label: "About BVCITS", href: "/about-us" },
          { label: "Contact Us", href: "/contact-us" },
        ],
      },
    ],
    contact: {
      heading: "Have a programme to propose?",
      body: "Send an outline to the Training & Placement Cell — they route proposals to the relevant department.",
      ctaLabel: "Get in Touch",
      ctaHref: "/contact-us",
    },
  },
];

export const portalBySlug = new Map(portals.map((p) => [p.slug, p]));

export function getPortal(slug: string): Portal {
  const portal = portalBySlug.get(slug);
  // Portals are referenced by literal slug from static route files, so a miss
  // means a route and this dataset drifted apart — fail loudly at build time
  // rather than rendering a half-empty page.
  if (!portal) throw new Error(`Unknown portal slug: "${slug}"`);
  return portal;
}

/** Icons used by the "Others" archive index and the home audience router. */
export { Library, BookOpen, Bell, ListChecks, MessageSquare, FileText };
