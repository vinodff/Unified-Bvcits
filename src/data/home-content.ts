// EXACT homepage content extracted from the live bvcits.edu.in ("Home 2026").
// Every string/number here was read out of scrape/raw/index.html — nothing invented.

// All paths point at LOCAL, full-resolution originals (see scripts/upgrade-images.mjs).
// Every entry below was verified at >=1600px wide by scripts/audit-images.mjs, except the
// badge logos, whose source files are genuinely low-res and are therefore rendered small.
export const A = {
  logoCrest: "/assets/logos/cropped-logo.png",
  logoHeader: "/assets/logos/bvcits-2-HEADER-24022022-e1648788636922-330x50.png",
  aicte: "/assets/logos/aicte_logo.png",
  naac: "/assets/logos/NAAC_LOGO.png",
  nba: "/assets/images/images.png",
  jntuk: "/assets/logos/jntuk.png",
  // Hero: students walking the green campus — 1600x1067, natural depth of field.
  hero: "/assets/images/l1-scaled.jpg",
  // About: students in blazers before the main block — 1600x1067.
  about: "/assets/images/DSC06792-scaled.jpg",
  topper1: "/assets/images/38lpa-bvcits.png",
  topper2: "/assets/images/girl-1.png",
  gallery: [
    "/assets/images/UKS_5811-scaled.jpg", // festival — lead tile
    "/assets/images/l10-1024x683.jpg",
    "/assets/images/DSC07406-scaled.jpg",
    "/assets/images/h4-scaled.jpg",
    "/assets/images/s7-scaled.jpg",
    "/assets/images/s1-scaled.jpg", // lead tile
    "/assets/images/h2-scaled.jpg",
    "/assets/images/s10-min-scaled.jpg",
    "/assets/images/l4-scaled.jpg",
    "/assets/images/h1-scaled.jpg",
  ],
};

export const accreditations = [
  { src: A.aicte, alt: "Approved by AICTE", label: "Approved by AICTE" },
  { src: A.naac, alt: "Accredited by NAAC A Grade", label: "Accredited by NAAC 'A' Grade" },
  { src: A.nba, alt: "Accredited by NBA", label: "Accredited by NBA" },
  { src: A.jntuk, alt: "Affiliated to JNTUK", label: "Affiliated to JNTUK" },
];

export const heroPills = ["Apply Now", "Placements", "International Admissions", "Results"];

export const heroHighlights = [
  { k: "Academics", v: "09 UG · 05 PG", sub: "Programmes" },
  { k: "Placements", v: "1256+", sub: "Placements in 2026" },
  { k: "Research", v: "1000+", sub: "Publications" },
];

// "At a glance — What makes BVCITS different"
export const glance = [
  { v: "40", suffix: " Acre", label: "green campus" },
  { v: "195", suffix: "+", label: "Experienced faculty" },
  { v: "12k", suffix: "+", label: "Graduates produced" },
  { v: "1000", suffix: "+", label: "Students placed annually" },
];

export const whyPillars = [
  { title: "Academic Depth", body: "Structured learning support across engineering, diploma, degree and postgraduate education." },
  { title: "Placement Momentum", body: "Active placement training, recruiter engagement and continuous career preparation." },
  { title: "Research & Innovation", body: "Research publications, patents, centres of excellence and innovation-led student growth." },
  { title: "Campus Experience", body: "A calm green campus with student activities, practical learning and community culture." },
];

export const programGroups = [
  { no: "01", title: "B.Tech", sub: "Under Graduate Engineering" },
  { no: "02", title: "Degree", sub: "BBA & BCA Programmes" },
  { no: "03", title: "Post Graduate", sub: "M.Tech · MBA · MCA" },
  { no: "04", title: "Diploma", sub: "Polytechnic Courses" },
];

// Exact B.Tech branches + branch codes as listed on the live homepage
export const btechBranches = [
  { name: "Computer Science & Engineering", code: "CSE", slug: "computer-science-engineering" },
  { name: "CSE — Artificial Intelligence & Machine Learning", code: "AIML", slug: "cse-artificial-intelligence-machine-learning" },
  { name: "Information Technology", code: "IT", slug: "ai-ds-new" },
  { name: "Electronics & Communication Engineering", code: "ECE", slug: "electronics-communication-engineering" },
  { name: "Electrical & Electronics Engineering", code: "EEE", slug: "electrical-electronics-engineering" },
  { name: "Civil Engineering", code: "CIV", slug: "civil-engineering" },
  { name: "Mechanical Engineering", code: "MECH", slug: "mechanical-engineering" },
];

export const careerSteps = [
  { no: "01", title: "Placement Training", body: "Aptitude, communication, technical practice and mock interviews." },
  { no: "02", title: "Industry Exposure", body: "Workshops, internships, live projects and company interaction throughout the journey." },
  { no: "03", title: "Career Mentoring", body: "Guidance that helps students choose the right role, prepare better and perform confidently." },
];

export const placementStats = [
  { v: "1256+", label: "Placements in 2026" },
  { v: "58+", label: "Top MNC Recruiters" },
  { v: "4 Lakhs", label: "Average package per annum" },
  { v: "12,000+", label: "Graduates produced" },
];

export const toppers = [
  { name: "K. Naga Satya Rajesh", roll: "22H41A0585 · CSE", package: "38 Lakhs per annum", tag: "Highest Package", recruiter: "ServiceNow", img: A.topper1 },
  { name: "Palla Pavani", roll: "22H41A4537 · CSE AI&DS", package: "15 Lakhs per annum", tag: "Top Package", recruiter: "Centific", img: A.topper2 },
];

export const recruiterOffers = [
  { company: "ServiceNow", pkg: "38 Lakhs per annum" },
  { company: "Centific", pkg: "15 Lakhs per annum" },
  { company: "DBS Bank", pkg: "10 Lakhs per annum" },
  { company: "Infosys", pkg: "9.5 Lakhs per annum" },
  { company: "ABB", pkg: "8.80 Lakhs per annum" },
  { company: "TCS", pkg: "7.10 Lakhs per annum" },
  { company: "Lumen", pkg: "7.10 Lakhs per annum" },
];

export const topRecruiters = ["ServiceNow", "Centific", "DBS Bank", "Infosys", "TCS", "ABB", "Lumen", "Accenture"];

export const instituteHighlights = [
  { v: "1256+", label: "Placements in 2026" },
  { v: "58+", label: "Top MNC Recruiters" },
  { v: "40 Acre", label: "Green Campus" },
  { v: "30+", label: "Industry MOUs" },
];

export const recognitions = ["Cisco Networking Academy", "Pearson VUE Authorised Test Center"];

export const aboutBlurb =
  "BVC Institute of Technology & Science, Amalapuram brings together strong academics, career-focused learning, placement preparation, research exposure and a peaceful green campus environment where students grow with confidence.";

export const notices = [
  "In association with NIT WARANGAL & E & ICT Academy from 22nd June to 3rd July",
  "Result of I B.TECH I SEMESTER (BR23) SUPPLEMENTARY EXAMINATIONS - APR 2026 (24 BATCH)",
  "Department of ECE is going to conduct one week FDP",
  "Admissions Open 2026-27 · Counselling Code: BVTS",
];
