// Data-driven department model. ONE template renders all 10 departments.
// CSE is fully populated (flagship); the others carry structural parity with
// representative content. Grounded in docs/PAGE-TYPES.md → "Department".

export type Faculty = {
  name: string;
  designation: string;
  qualification: string;
};

export type Lab = { name: string; description: string };
export type DeptStat = { label: string; value: string };

export type Department = {
  slug: string;
  name: string;
  short: string;
  level: "UG" | "PG";
  established: string;
  intake: number;
  tagline: string;
  overview: string[];
  vision: string;
  mission: string[];
  peos: string[];
  pos: string[];
  psos: string[];
  hod: { name: string; designation: string; message: string[] };
  faculty: Faculty[];
  labs: Lab[];
  achievements: string[];
  placements: DeptStat[];
};

// The department left-sidebar tree (grounded in the live CSE sidebar).
export type SidebarNode = { label: string; slug?: string; children?: SidebarNode[] };

export const deptSidebar: SidebarNode[] = [
  { label: "About Department", slug: "" },
  { label: "Vision & Mission", slug: "vision-mission" },
  { label: "PEO, PO & PSO", slug: "peo-po-pso" },
  { label: "Head of the Department", slug: "hod" },
  { label: "Faculty", slug: "faculty" },
  {
    label: "Students",
    children: [
      { label: "Admissions", slug: "students-admissions" },
      { label: "Academic Performance", slug: "students-performance" },
      { label: "Toppers", slug: "students-toppers" },
      { label: "Certifications", slug: "students-certifications" },
      { label: "Projects", slug: "students-projects" },
      { label: "Internships", slug: "students-internships" },
    ],
  },
  { label: "Course Structure & Syllabus", slug: "syllabus" },
  { label: "Infrastructure", slug: "infrastructure" },
  {
    label: "Faculty Achievements",
    children: [
      { label: "FDPs & Workshops", slug: "achievements-fdp" },
      { label: "Guest Lectures", slug: "achievements-lectures" },
      { label: "Publications", slug: "achievements-publications" },
    ],
  },
  { label: "Department Associations", slug: "associations" },
  { label: "Department Placements", slug: "placements" },
  { label: "Newsletters", slug: "newsletters" },
  { label: "Industry Interaction", slug: "industry-interaction" },
  { label: "Gallery", slug: "gallery" },
  {
    label: "Research & Development",
    children: [
      { label: "Publications", slug: "rnd-publications" },
      { label: "Patents", slug: "rnd-patents" },
      { label: "Funded Projects", slug: "rnd-projects" },
    ],
  },
  { label: "NBA E-SAR", slug: "nba-esar" },
];

// Flatten to the set of leaf section slugs (for generateStaticParams + labels).
export const sidebarSections: { slug: string; label: string; group?: string }[] = (() => {
  const out: { slug: string; label: string; group?: string }[] = [];
  for (const node of deptSidebar) {
    if (node.slug) out.push({ slug: node.slug, label: node.label });
    if (node.children) {
      for (const c of node.children) {
        if (c.slug) out.push({ slug: c.slug, label: c.label, group: node.label });
      }
    }
  }
  return out.filter((s) => s.slug !== "");
})();

export function sectionLabel(slug: string): string {
  const found = sidebarSections.find((s) => s.slug === slug);
  if (found) return found.group ? `${found.group} — ${found.label}` : found.label;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

// ---- CSE flagship (full content) ----
const cse: Department = {
  slug: "computer-science-engineering",
  name: "Computer Science & Engineering",
  short: "CSE",
  level: "UG",
  established: "2008",
  intake: 180,
  tagline: "Striving persistently for excellence in computing disciplines.",
  overview: [
    "The Department of Computer Science & Engineering strives persistently for excellence in computing disciplines through world-class education, industry-aligned curricula, and a strong research culture.",
    "The department prepares a competent workforce for the global software and services industry, equipping students with strong fundamentals, hands-on skills, and the ability to design ICT solutions for real-world problems.",
    "With modern laboratories, experienced faculty, and active industry partnerships, CSE at BVCITS is the largest program on campus and a consistent leader in placements.",
  ],
  vision:
    "To be a center of excellence in computer science education and research, producing globally competent engineers and responsible citizens.",
  mission: [
    "Impart quality education through an outcome-based curriculum and modern pedagogy.",
    "Foster innovation, research, and entrepreneurship among students and faculty.",
    "Build strong industry–institute collaboration to bridge the academia–industry gap.",
    "Inculcate ethical values, teamwork, and a commitment to lifelong learning.",
  ],
  peos: [
    "Graduates will excel in professional careers and higher education in computing and allied fields.",
    "Graduates will design and develop computing solutions applying strong theoretical and practical foundations.",
    "Graduates will demonstrate professional ethics, teamwork, communication, and lifelong learning.",
  ],
  pos: [
    "Engineering knowledge",
    "Problem analysis",
    "Design/development of solutions",
    "Investigation of complex problems",
    "Modern tool usage",
    "The engineer and society",
    "Environment and sustainability",
    "Ethics",
    "Individual and team work",
    "Communication",
    "Project management and finance",
    "Life-long learning",
  ],
  psos: [
    "Apply data structures, algorithms, and software engineering principles to build reliable software systems.",
    "Design intelligent, data-driven applications using AI, machine learning, and modern cloud platforms.",
  ],
  hod: {
    name: "Dr. K. Srinivasa Rao",
    designation: "Professor & Head, Department of CSE",
    message: [
      "Welcome to the Department of Computer Science & Engineering. Our goal is to nurture engineers who are technically strong, professionally ethical, and ready for the fast-evolving world of computing.",
      "We continuously update our curriculum with emerging areas such as artificial intelligence, data science, cloud, and cybersecurity, and we back it with hands-on labs, hackathons, and industry certifications.",
    ],
  },
  faculty: [
    { name: "Dr. K. Srinivasa Rao", designation: "Professor & Head", qualification: "Ph.D. (Computer Science)" },
    { name: "Dr. P. Lakshmi Prasanna", designation: "Professor", qualification: "Ph.D. (CSE)" },
    { name: "Mr. B. Venkata Ramana", designation: "Associate Professor", qualification: "M.Tech, (Ph.D.)" },
    { name: "Ms. G. Sridevi", designation: "Assistant Professor", qualification: "M.Tech (CSE)" },
    { name: "Mr. T. Naveen Kumar", designation: "Assistant Professor", qualification: "M.Tech (CSE)" },
    { name: "Ms. K. Divya", designation: "Assistant Professor", qualification: "M.Tech (Data Science)" },
  ],
  labs: [
    { name: "Programming & Data Structures Lab", description: "C, Python and Java workstations for core programming courses." },
    { name: "AI & Machine Learning Lab", description: "GPU-enabled systems for deep learning, NLP and computer vision projects." },
    { name: "Full-Stack & Cloud Lab", description: "Modern web stacks with CI/CD and cloud deployment tooling." },
    { name: "Networks & Cybersecurity Lab", description: "Cisco Networking Academy setup for networking and security labs." },
  ],
  achievements: [
    "Consistently the top-placed branch on campus with recruiters including TCS, Infosys and Wipro.",
    "Students regularly win prizes at inter-collegiate hackathons and coding contests.",
    "Faculty published 50+ papers in reputed journals and conferences over the last three years.",
    "MoUs with industry partners for internships, certifications and live projects.",
  ],
  placements: [
    { label: "Offers (2026)", value: "420+" },
    { label: "Highest Package", value: "38 LPA" },
    { label: "Recruiters", value: "58+" },
    { label: "Placement Rate", value: "92%" },
  ],
};

// ---- Parity factory for the remaining departments ----
type Seed = {
  slug: string;
  name: string;
  short: string;
  level?: "UG" | "PG";
  intake?: number;
  focus: string;
  labs: Lab[];
  hod: string;
  psos: [string, string];
};

function makeDept(s: Seed): Department {
  const level = s.level ?? "UG";
  return {
    slug: s.slug,
    name: s.name,
    short: s.short,
    level,
    established: "—",
    intake: s.intake ?? 60,
    tagline: s.focus,
    overview: [
      `The Department of ${s.name} is committed to ${s.focus.toLowerCase()} through quality teaching, well-equipped laboratories and a supportive learning environment.`,
      `The program blends strong fundamentals with practical, industry-relevant skills, preparing graduates for successful careers and higher studies.`,
    ],
    vision: `To be recognized for excellence in ${s.name} education and to develop competent, ethical professionals who contribute to society.`,
    mission: [
      "Deliver quality, outcome-based education with modern teaching methods.",
      "Provide hands-on training through well-equipped laboratories.",
      "Promote research, innovation and industry collaboration.",
      "Foster professional ethics, teamwork and lifelong learning.",
    ],
    peos: [
      `Graduates will succeed in professional careers and higher education in ${s.short}.`,
      "Graduates will apply engineering knowledge to analyze and solve real-world problems.",
      "Graduates will demonstrate ethics, communication and lifelong learning.",
    ],
    pos: cse.pos,
    psos: [...s.psos],
    hod: {
      name: s.hod,
      designation: `Professor & Head, Department of ${s.short}`,
      message: [
        `Welcome to the Department of ${s.name}. We are dedicated to providing our students with a strong foundation and the practical skills needed to excel in their profession.`,
        "Our experienced faculty, modern facilities and industry connections help students grow into confident, capable engineers.",
      ],
    },
    faculty: [
      { name: s.hod, designation: "Professor & Head", qualification: "Ph.D." },
      { name: "Faculty Member", designation: "Associate Professor", qualification: "M.Tech, (Ph.D.)" },
      { name: "Faculty Member", designation: "Assistant Professor", qualification: "M.Tech" },
      { name: "Faculty Member", designation: "Assistant Professor", qualification: "M.Tech" },
    ],
    labs: s.labs,
    achievements: [
      "Active student participation in technical events, projects and internships.",
      "Regular faculty development programmes, guest lectures and workshops.",
      "Growing record of research publications and industry collaboration.",
    ],
    placements: [
      { label: "Offers (2026)", value: "—" },
      { label: "Highest Package", value: "—" },
      { label: "Recruiters", value: "58+" },
      { label: "Placement Rate", value: "—" },
    ],
  };
}

const others: Department[] = [
  makeDept({
    slug: "ai-ds-new",
    name: "CSE – Artificial Intelligence & Data Science",
    short: "AI & DS",
    intake: 120,
    focus: "Building intelligent, data-driven systems",
    hod: "Dr. M. Ravi Kumar",
    labs: [
      { name: "Data Science Lab", description: "Analytics, big-data and visualization tooling." },
      { name: "AI & Deep Learning Lab", description: "GPU systems for ML, NLP and computer vision." },
    ],
    psos: [
      "Design data-driven solutions using statistics, machine learning and visualization.",
      "Build and deploy AI applications on modern cloud and big-data platforms.",
    ],
  }),
  makeDept({
    slug: "cse-artificial-intelligence-machine-learning",
    name: "Artificial Intelligence & Machine Learning",
    short: "AI & ML",
    intake: 60,
    focus: "Advancing machine intelligence and automation",
    hod: "Dr. S. Anitha",
    labs: [
      { name: "Machine Learning Lab", description: "Supervised, unsupervised and reinforcement learning setups." },
      { name: "Computer Vision Lab", description: "Imaging, detection and recognition experiments." },
    ],
    psos: [
      "Apply machine learning algorithms to model and solve complex problems.",
      "Develop intelligent systems integrating AI with real-world applications.",
    ],
  }),
  makeDept({
    slug: "electronics-communication-engineering",
    name: "Electronics & Communication Engineering",
    short: "ECE",
    intake: 120,
    focus: "Excellence in electronics, communication and VLSI",
    hod: "Dr. N. Prasad",
    labs: [
      { name: "Communications Lab", description: "Analog and digital communication experiments." },
      { name: "VLSI & Embedded Systems Lab", description: "FPGA, microcontroller and PCB design." },
    ],
    psos: [
      "Design and analyze electronic and communication systems.",
      "Apply VLSI, embedded and signal-processing techniques to real applications.",
    ],
  }),
  makeDept({
    slug: "electrical-electronics-engineering",
    name: "Electrical & Electronics Engineering",
    short: "EEE",
    intake: 60,
    focus: "Powering the future with electrical systems",
    hod: "Dr. R. Suresh Babu",
    labs: [
      { name: "Electrical Machines Lab", description: "Motors, generators and transformers." },
      { name: "Power Electronics Lab", description: "Converters, drives and renewable-energy systems." },
    ],
    psos: [
      "Analyze and design electrical power and control systems.",
      "Apply power electronics and renewable-energy concepts to modern problems.",
    ],
  }),
  makeDept({
    slug: "mechanical-engineering",
    name: "Mechanical Engineering",
    short: "MECH",
    intake: 60,
    focus: "Designing and manufacturing for industry",
    hod: "Dr. V. Rama Krishna",
    labs: [
      { name: "CAD/CAM Lab", description: "Design, modeling and CNC manufacturing." },
      { name: "Thermal Engineering Lab", description: "Heat, thermodynamics and IC-engine experiments." },
    ],
    psos: [
      "Apply design, thermal and manufacturing principles to engineering problems.",
      "Use modern CAD/CAM and analysis tools in product development.",
    ],
  }),
  makeDept({
    slug: "civil-engineering",
    name: "Civil Engineering",
    short: "CIVIL",
    intake: 60,
    focus: "Building sustainable infrastructure",
    hod: "Dr. A. Bhaskar Rao",
    labs: [
      { name: "Structural Engineering Lab", description: "Materials testing and structural analysis." },
      { name: "Surveying & GIS Lab", description: "Total-station surveying and geospatial tools." },
    ],
    psos: [
      "Plan, analyze and design civil-engineering structures and systems.",
      "Apply sustainable and modern construction practices.",
    ],
  }),
  makeDept({
    slug: "master-of-business-administration",
    name: "Master of Business Administration",
    short: "MBA",
    level: "PG",
    intake: 120,
    focus: "Developing future business leaders",
    hod: "Dr. P. Gopala Krishna",
    labs: [
      { name: "Business Analytics Lab", description: "Data analysis and decision-support tools." },
      { name: "Communication & Simulation Lab", description: "Soft-skills and business-simulation setups." },
    ],
    psos: [
      "Apply management principles across functional areas of business.",
      "Use analytics and strategic thinking for effective decision-making.",
    ],
  }),
  makeDept({
    slug: "masters-in-computer-application",
    name: "Master of Computer Applications",
    short: "MCA",
    level: "PG",
    intake: 60,
    focus: "Advanced application development and computing",
    hod: "Dr. Y. Srinivasulu",
    labs: [
      { name: "Application Development Lab", description: "Full-stack and mobile application development." },
      { name: "Database & Cloud Lab", description: "DBMS, cloud and DevOps tooling." },
    ],
    psos: [
      "Design and develop enterprise-grade software applications.",
      "Apply modern computing platforms to solve organizational problems.",
    ],
  }),
  makeDept({
    slug: "science-humanities",
    name: "Science & Humanities",
    short: "S&H",
    intake: 0,
    focus: "Strengthening fundamentals across engineering",
    hod: "Dr. L. Padmavathi",
    labs: [
      { name: "Physics Lab", description: "Engineering physics experiments." },
      { name: "Chemistry & English Communication Labs", description: "Applied chemistry and language skills." },
    ],
    psos: [
      "Build strong foundations in mathematics, science and communication.",
      "Support outcome-based learning across all engineering programs.",
    ],
  }),
];

// ---- Overlay REAL scraped content from the live site ----
// real-departments.json is generated by scripts/extract-dept-details.mjs +
// scripts/merge-departments.mjs from the mirrored HTML in scrape/raw/.
// Real values always win over the seeded parity content.
import realData from "./real-departments.json";

type RealDept = {
  name: string | null;
  about: string[];
  vision: string | null;
  mission: string[];
  hod: { name: string; designation: string | null; message: string[] } | null;
  faculty: { name: string; designation: string; qualification: string | null }[];
  facultyCount: number;
  peos: string[];
  pos: string[];
  psos: string[];
  labs: string[];
};

const real = realData as Record<string, RealDept>;

function withReal(d: Department): Department {
  const r = real[d.slug];
  if (!r) return d;
  return {
    ...d,
    name: r.name || d.name,
    overview: r.about.length ? r.about : d.overview,
    vision: r.vision || d.vision,
    mission: r.mission.length ? r.mission : d.mission,
    peos: r.peos.length ? r.peos : d.peos,
    pos: r.pos.length ? r.pos : d.pos,
    psos: r.psos.length ? r.psos : d.psos,
    hod: r.hod
      ? {
          name: r.hod.name,
          designation: r.hod.designation || `Head, Department of ${d.short}`,
          message: r.hod.message.length ? r.hod.message : d.hod.message,
        }
      : d.hod,
    faculty: r.faculty.length
      ? r.faculty.map((f) => ({
          name: f.name,
          designation: f.designation,
          qualification: f.qualification || "—",
        }))
      : d.faculty,
    labs: r.labs.length ? r.labs.map((l) => ({ name: l, description: "" })) : d.labs,
  };
}

const allDepartments = [cse, ...others].map(withReal);

export const departments: Record<string, Department> = Object.fromEntries(
  allDepartments.map((d) => [d.slug, d])
);

export const departmentList: Department[] = allDepartments;

/** Real faculty headcount scraped from the live site (0 when not published). */
export function realFacultyCount(slug: string): number {
  return real[slug]?.facultyCount ?? 0;
}

export function getDepartment(slug: string): Department | undefined {
  return departments[slug];
}
