// BVCITS Campus Assistant — Grounded Knowledge Base (Telugu & English)
//
// SOURCING RULE (do not break this):
// Every fact here traces to a real project source. Nothing is invented.
//   • HOD names / faculty counts  → src/data/real-departments.json (scraped from bvcits.edu.in)
//   • Placements / campus stats   → src/data/home-content.ts (scraped from live homepage)
//   • Contact / branding          → src/lib/site.ts
//   • Intake / slugs / sections   → src/data/departments.ts
//
// A previous revision of this file carried FABRICATED HOD names (e.g. CSE was listed as
// "Dr. K. Srinivasa Rao"; the real head is Dr. Katikireddy Srinivas) and invented per-HOD
// email addresses. Those were removed. When a fact is not in a real source, this file says
// so via `verified: false` or omits the field entirely — the agent must never state an
// unverified personal contact detail as fact.

export interface HodInfo {
  department: string;
  deptSlug: string;
  hodName: string;
  /** Real designation where the source recorded one; null when the scrape had none. */
  designation: string | null;
  qualification: string;
  /** College reception line. Routes to the department — NOT a personal direct line. */
  phone: string;
  directCallHref: string;
  /** Institutional address. Per-HOD mailboxes were never published, so we use the office. */
  email: string;
  officeHours: string;
  intake: number;
  facultyCount: number;
  availableDays: string[];
  slots: string[];
  /** True when hodName came from the scraped source rather than a placeholder. */
  verified: boolean;
}

export interface FeeItem {
  program: string;
  category: string;
  tuitionFeePerYear: string;
  jvdReimbursement: string;
  notes: string;
  /** Matching keys so the agent can answer per-program instead of one generic blob. */
  appliesTo: string[];
}

export interface BusRoute {
  routeName: string;
  stops: string[];
  annualFee: string;
}

export const BVCITS_META = {
  institutionName: "BVC Institute of Technology & Science (BVCITS)",
  shortName: "BVCITS (బివిసిఐటిఎస్)",
  counsellingCode: "BVTS",
  campusLocation:
    "Batlapalem, Amalapuram, Dr. B.R. Ambedkar Konaseema District, Andhra Pradesh - 533201",
  principalPhone: "+91 99854 22678",
  admissionsHelpline: "+91 99854 22678",
  admissionsHelplineHref: "tel:+919985422678",
  whatsappNumber: "+919985422678",
  email: "principal@bvcits.edu.in",
  liveUrl: "https://bvcits.edu.in",
  internationalApplyUrl: "https://apply.bvcits.edu.in/",
  accreditation: "Autonomous · NAAC 'A' Grade · NBA Accredited · AICTE Approved · JNTUK Affiliated",
  campusSize: "40 acre green campus",
  facultyStrength: "195+ experienced faculty",
  graduates: "12,000+ graduates produced",
  // Placement figures below are the live homepage's own numbers (home-content.ts).
  highestPlacementPackage: "₹38 LPA (ServiceNow)",
  averagePlacementPackage: "₹4 LPA",
  totalPlacements2026: "1256+ offers across 58+ MNCs",
  topRecruiters: [
    "ServiceNow",
    "Centific",
    "DBS Bank",
    "Infosys",
    "TCS",
    "ABB",
    "Lumen",
    "Accenture",
  ],
  recognitions: ["Cisco Networking Academy", "Pearson VUE Authorised Test Center"],
} as const;

/** Named toppers exactly as published on the live homepage. */
export const PLACEMENT_TOPPERS = [
  {
    name: "K. Naga Satya Rajesh",
    roll: "22H41A0585",
    branch: "CSE",
    package: "₹38 LPA",
    recruiter: "ServiceNow",
  },
  {
    name: "Palla Pavani",
    roll: "22H41A4537",
    branch: "CSE (AI & DS)",
    package: "₹15 LPA",
    recruiter: "Centific",
  },
] as const;

/** Package-by-recruiter table from the homepage. */
export const RECRUITER_OFFERS = [
  { company: "ServiceNow", pkg: "₹38 LPA" },
  { company: "Centific", pkg: "₹15 LPA" },
  { company: "DBS Bank", pkg: "₹10 LPA" },
  { company: "Infosys", pkg: "₹9.5 LPA" },
  { company: "ABB", pkg: "₹8.8 LPA" },
  { company: "TCS", pkg: "₹7.1 LPA" },
  { company: "Lumen", pkg: "₹7.1 LPA" },
] as const;

const OFFICE_HOURS = "10:00 AM – 4:30 PM (Mon–Sat)";
const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COLLEGE_PHONE = "+91 99854 22678";
const COLLEGE_TEL_HREF = "tel:+919985422678";
const OFFICE_EMAIL = "principal@bvcits.edu.in";

/**
 * Department heads. Names/designations/faculty counts come from real-departments.json.
 * AIML has no published head in the source, so it is marked `verified: false` and the
 * agent routes those callers to the college office instead of naming a person.
 */
export const HOD_DIRECTORY: Record<string, HodInfo> = {
  cse: {
    department: "Computer Science & Engineering (CSE)",
    deptSlug: "computer-science-engineering",
    hodName: "Dr. Katikireddy Srinivas",
    designation: "Professor & Head, CSE",
    qualification: "Ph.D.",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 180,
    facultyCount: 53,
    availableDays: WORKING_DAYS,
    slots: ["10:30 AM", "11:45 AM", "02:15 PM", "03:30 PM"],
    verified: true,
  },
  aids: {
    department: "Artificial Intelligence & Data Science (AI & DS)",
    deptSlug: "ai-ds-new",
    hodName: "Dr. Ravi Kishore Veluri",
    designation: "Professor and Head",
    qualification: "Ph.D.",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 120,
    facultyCount: 14,
    availableDays: WORKING_DAYS,
    slots: ["10:00 AM", "11:30 AM", "02:30 PM", "04:00 PM"],
    verified: true,
  },
  aiml: {
    department: "CSE (Artificial Intelligence & Machine Learning)",
    deptSlug: "cse-artificial-intelligence-machine-learning",
    // Source has no published head for this department — do not invent one.
    hodName: "Department Office, AI & ML",
    designation: null,
    qualification: "",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 60,
    facultyCount: 22,
    availableDays: WORKING_DAYS,
    slots: ["11:00 AM", "01:30 PM", "03:00 PM"],
    verified: false,
  },
  ece: {
    department: "Electronics & Communication Engineering (ECE)",
    deptSlug: "electronics-communication-engineering",
    hodName: "Dr. Siva Sankara Phani",
    designation: "Professor & Head, ECE",
    qualification: "Ph.D.",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 120,
    facultyCount: 59,
    availableDays: WORKING_DAYS,
    slots: ["10:30 AM", "12:00 PM", "02:30 PM", "03:45 PM"],
    verified: true,
  },
  eee: {
    department: "Electrical & Electronics Engineering (EEE)",
    deptSlug: "electrical-electronics-engineering",
    hodName: "Mr. A N V J Raja Gopal",
    designation: "Professor and Head",
    qualification: "M.Tech",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 60,
    facultyCount: 14,
    availableDays: WORKING_DAYS,
    slots: ["10:00 AM", "11:30 AM", "02:00 PM", "03:30 PM"],
    verified: true,
  },
  mech: {
    department: "Mechanical Engineering (MECH)",
    deptSlug: "mechanical-engineering",
    hodName: "Mr. B S S Phani Sankar",
    designation: "Head of the Department",
    qualification: "M.Tech",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 60,
    facultyCount: 0,
    availableDays: WORKING_DAYS,
    slots: ["10:30 AM", "12:00 PM", "02:30 PM"],
    verified: true,
  },
  civil: {
    department: "Civil Engineering (CIVIL)",
    deptSlug: "civil-engineering",
    hodName: "Dr. M C S Madan",
    designation: "Professor & Head, Civil",
    qualification: "Ph.D.",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 60,
    facultyCount: 11,
    availableDays: WORKING_DAYS,
    slots: ["10:00 AM", "11:30 AM", "03:00 PM"],
    verified: true,
  },
  mba: {
    department: "Master of Business Administration (MBA)",
    deptSlug: "master-of-business-administration",
    hodName: "Dr. Gokarakonda P S V S D Nagendra Rao",
    designation: "Professor & Head",
    qualification: "Ph.D.",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 120,
    facultyCount: 16,
    availableDays: WORKING_DAYS,
    slots: ["11:00 AM", "02:00 PM", "03:30 PM"],
    verified: true,
  },
  mca: {
    department: "Master of Computer Applications (MCA)",
    deptSlug: "masters-in-computer-application",
    hodName: "Mr. A V S M Ganesh",
    designation: "Associate Professor and Head",
    qualification: "M.Tech",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 60,
    facultyCount: 24,
    availableDays: WORKING_DAYS,
    slots: ["10:30 AM", "01:30 PM", "03:00 PM"],
    verified: true,
  },
  sh: {
    department: "Science & Humanities",
    deptSlug: "science-humanities",
    hodName: "Mr. Boddu Sesha Rao",
    designation: "Head of the Department",
    qualification: "",
    phone: COLLEGE_PHONE,
    directCallHref: COLLEGE_TEL_HREF,
    email: OFFICE_EMAIL,
    officeHours: OFFICE_HOURS,
    intake: 0,
    facultyCount: 58,
    availableDays: WORKING_DAYS,
    slots: ["10:30 AM", "02:00 PM"],
    verified: true,
  },
};

/**
 * Fee structure. `appliesTo` lets the agent answer "MBA fee?" with the MBA row
 * instead of returning the B.Tech blob for every fee question.
 */
export const FEE_STRUCTURE: FeeItem[] = [
  {
    program: "B.Tech (CSE, AI&DS, AIML, ECE, EEE, MECH, CIVIL)",
    category: "Convenor Quota (AP EAPCET)",
    tuitionFeePerYear: "₹43,000 / year",
    jvdReimbursement: "100% fee reimbursement for eligible AP Govt JVD beneficiaries",
    notes: "Counselling code: BVTS. No additional lab fee.",
    appliesTo: ["btech", "cse", "aids", "aiml", "ece", "eee", "mech", "civil"],
  },
  {
    program: "B.Tech (Management Quota — Category B)",
    category: "Direct / Management Quota",
    tuitionFeePerYear: "₹70,000 – ₹1,20,000 / year (branch dependent)",
    jvdReimbursement: "Not eligible for the JVD government scheme",
    notes: "Direct admission on Intermediate marks. Contact the Admissions Cell.",
    appliesTo: ["btech", "management"],
  },
  {
    program: "B.Tech Lateral Entry (Diploma → 2nd year)",
    category: "AP ECET Convenor",
    tuitionFeePerYear: "₹43,000 / year",
    jvdReimbursement: "100% eligible under the JVD scheme",
    notes: "Direct second-year admission through the BVTS code.",
    appliesTo: ["btech", "lateral", "ecet", "diploma"],
  },
  {
    program: "MBA",
    category: "AP ICET Convenor",
    tuitionFeePerYear: "₹35,000 / year",
    jvdReimbursement: "Eligible under the AP Govt JVD scheme",
    notes: "Specialisations in Finance, Marketing and HR.",
    appliesTo: ["mba"],
  },
  {
    program: "MCA",
    category: "AP ICET Convenor",
    tuitionFeePerYear: "₹45,000 / year",
    jvdReimbursement: "Eligible under the AP Govt JVD scheme",
    notes: "Two-year programme with full-stack and cloud labs.",
    appliesTo: ["mca"],
  },
  {
    program: "Polytechnic / Diploma",
    category: "AP POLYCET",
    tuitionFeePerYear: "₹25,000 / year",
    jvdReimbursement: "Eligible under the AP Govt JVD scheme",
    notes: "ECE, EEE, Mechanical and Civil streams.",
    appliesTo: ["polytechnic", "diploma"],
  },
  {
    program: "Hostel & dining",
    category: "Separate boys' and girls' hostels",
    tuitionFeePerYear: "₹55,000 / year (includes food and stay)",
    jvdReimbursement: "Vasathi Deevena students receive ₹20,000 AP Govt support",
    notes: "RO water, Wi-Fi, 24/7 security, doctor on call.",
    appliesTo: ["hostel"],
  },
];

export const BUS_ROUTES: BusRoute[] = [
  {
    routeName: "Amalapuram local & suburbs",
    stops: ["Amalapuram Clock Tower", "Black Bridge", "High School Road", "Batlapalem campus"],
    annualFee: "₹12,000 / year",
  },
  {
    routeName: "Ravulapalem & Kothapeta",
    stops: ["Ravulapalem RTC Complex", "Kothapeta Centre", "Vanapalli", "Batlapalem campus"],
    annualFee: "₹16,000 / year",
  },
  {
    routeName: "Razole & Tatipaka",
    stops: ["Razole Centre", "Tatipaka Junction", "Nagaram", "Batlapalem campus"],
    annualFee: "₹16,000 / year",
  },
  {
    routeName: "Palakollu & Narasapuram",
    stops: ["Palakollu bus stand", "Digamarru", "Chinchinada Bridge", "Amalapuram", "Campus"],
    annualFee: "₹18,000 / year",
  },
  {
    routeName: "Kakinada & Draksharamam",
    stops: ["Kakinada RTC bus stand", "Yanam", "Draksharamam", "Ramachandrapuram", "Amalapuram"],
    annualFee: "₹22,000 / year",
  },
  {
    routeName: "Rajahmundry",
    stops: ["Rajahmundry Kotipalli bus stand", "Alamuru", "Jonnada", "Ravulapalem", "Campus"],
    annualFee: "₹22,000 / year",
  },
];

export const TOP_QUESTIONS_TELUGU = [
  {
    id: "cse_fees",
    queryTe: "CSE ఫీజు ఎంత?",
    queryEn: "What is the CSE fee?",
    badgeTe: "ఫీజు",
  },
  {
    id: "cse_hod_contact",
    queryTe: "CSE HOD ఎవరు?",
    queryEn: "Who is the CSE HOD?",
    badgeTe: "HOD",
  },
  {
    id: "book_appointment",
    queryTe: "HOD గారితో అపాయింట్మెంట్ కావాలి",
    queryEn: "Book an appointment with the HOD",
    badgeTe: "అపాయింట్మెంట్",
  },
  {
    id: "placements_38lpa",
    queryTe: "38 లక్షల ప్యాకేజ్ ఎవరికి వచ్చింది?",
    queryEn: "Who got the ₹38 LPA package?",
    badgeTe: "ప్లేస్‌మెంట్స్",
  },
  {
    id: "counselling_bvts",
    queryTe: "కౌన్సెలింగ్ కోడ్ ఏమిటి?",
    queryEn: "What is the counselling code?",
    badgeTe: "BVTS",
  },
  {
    id: "hostel_bus",
    queryTe: "హాస్టల్ ఫీజు ఎంత?",
    queryEn: "What is the hostel fee?",
    badgeTe: "హాస్టల్",
  },
];
