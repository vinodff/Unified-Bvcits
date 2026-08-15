// Answer composition.
//
// Two rules drive everything here:
//   1. ESSENTIAL FIRST. The spoken line answers the question in one or two sentences.
//      Detail belongs on screen and in the action card, not in the ear.
//   2. EVERY ANSWER CARRIES A REAL LINK. See catalog.ts for the link-validity rule.
//
// Answers are composed per query from real data, so "MBA fee" returns ₹35,000 and
// "MCA fee" returns ₹45,000 — the previous engine returned the same B.Tech blob for both.

import {
  BVCITS_META,
  BUS_ROUTES,
  FEE_STRUCTURE,
  HOD_DIRECTORY,
  PLACEMENT_TOPPERS,
  RECRUITER_OFFERS,
  type FeeItem,
} from "@/data/bvcits-bot-knowledge";
import { DEPT_SECTIONS, LIVE_ROUTES, LOCAL_ROUTES, allDepartments, deptUrl } from "./catalog";
import type { AgentReply, DeptEntity, QuickReply } from "./types";

/** Builds a website_navigator card. */
function navCard(
  titleTe: string,
  titleEn: string,
  descriptionTe: string,
  descriptionEn: string,
  href: string,
  badge: string,
  secondaryLinks?: { label: string; href: string }[],
) {
  return {
    type: "website_navigator" as const,
    payload: { titleTe, titleEn, descriptionTe, descriptionEn, href, badge, secondaryLinks },
  };
}

function qr(te: string, en: string, query: string): QuickReply {
  return { te, en, query };
}

/** Default department when the user never named one. CSE is the flagship. */
export const DEFAULT_DEPT_KEY = "cse";

// ─────────────────────────── HOD / contact ───────────────────────────

export function answerHodContact(dept: DeptEntity): AgentReply {
  const { hod } = dept;
  const link = deptUrl(hod.deptSlug, DEPT_SECTIONS.hod);

  // When the source published no head for this department, say so plainly instead of
  // naming someone. Confidently stating a wrong person's name is the worst failure here.
  if (!hod.verified) {
    return {
      topic: "hod_contact",
      deptKey: dept.key,
      replyTelugu: `**${dept.short}** విభాగం అధిపతి పేరు అధికారికంగా ప్రచురించలేదు అండీ. కాలేజ్ ఆఫీసుకు కాల్ చేస్తే కలుపుతారు.\n\n📞 [${hod.phone}](${hod.directCallHref})\n🕐 ${hod.officeHours}`,
      replyEnglish: `The head of **${dept.short}** is not published in our records. The college office will connect you.\n\n📞 [${hod.phone}](${hod.directCallHref})\n🕐 ${hod.officeHours}`,
      spokenTelugu: `${dept.short} విభాగం అధిపతి పేరు మా దగ్గర లేదు. కాలేజ్ ఆఫీసు నంబర్ ఇచ్చాను, కాల్ చేయండి.`,
      spokenEnglish: `The published head for ${dept.short} isn't in our records. I've given you the college office number.`,
      actionCards: [{ type: "hod_contact", payload: hod }],
      quickReplies: [
        qr("📅 అపాయింట్మెంట్", "📅 Appointment", `book appointment with ${dept.short} hod`),
        qr("👨‍🏫 ఫ్యాకల్టీ", "👨‍🏫 Faculty", `${dept.short} faculty`),
      ],
      isFallback: false,
    };
  }

  const role = hod.designation ?? "Head of the Department";

  return {
    topic: "hod_contact",
    deptKey: dept.key,
    replyTelugu: `**${dept.short}** HOD — **${hod.hodName}** (${role}).\n\n📞 [${hod.phone}](${hod.directCallHref}) · 🕐 ${hod.officeHours}\n\n[విభాగం పేజీ చూడండి](${link})`,
    replyEnglish: `**${dept.short}** HOD — **${hod.hodName}** (${role}).\n\n📞 [${hod.phone}](${hod.directCallHref}) · 🕐 ${hod.officeHours}\n\n[Open the department page](${link})`,
    spokenTelugu: `${dept.short} విభాగం అధిపతి ${hod.hodName} గారు. ఫోన్ నంబర్ క్రింద ఇచ్చాను, కాల్ బటన్ నొక్కండి.`,
    spokenEnglish: `The ${dept.short} head is ${hod.hodName}. I've put the call button below.`,
    actionCards: [{ type: "hod_contact", payload: hod }],
    quickReplies: [
      qr("📅 అపాయింట్మెంట్", "📅 Appointment", `book appointment with ${dept.short} hod`),
      qr("💰 ఫీజు", "💰 Fee", `${dept.short} fee`),
    ],
    isFallback: false,
  };
}

export function answerAppointment(dept: DeptEntity): AgentReply {
  const { hod } = dept;
  const who = hod.verified ? hod.hodName : `${dept.short} విభాగం`;

  return {
    topic: "appointment",
    deptKey: dept.key,
    replyTelugu: `**${who}** గారిని కలవడానికి క్రింద సమయం ఎంచుకోండి.`,
    replyEnglish: `Pick a slot below to meet **${hod.verified ? hod.hodName : dept.short}**.`,
    spokenTelugu: `సమయం క్రింద ఎంచుకోండి, అపాయింట్మెంట్ బుక్ అవుతుంది.`,
    spokenEnglish: `Choose a time slot below and I'll book it.`,
    actionCards: [
      {
        type: "appointment_booking",
        payload: {
          hodInfo: hod,
          department: hod.department,
          defaultDate: "Tomorrow (రేపు)",
          availableSlots: hod.slots,
        },
      },
    ],
    quickReplies: [
      qr("📞 HOD నంబర్", "📞 HOD number", `${dept.short} hod phone number`),
      qr("📍 కాలేజ్ ఎక్కడ?", "📍 Where is the college?", "where is the college located"),
    ],
    isFallback: false,
  };
}

export function answerContact(): AgentReply {
  return {
    topic: "contact",
    replyTelugu: `**BVCITS** కాంటాక్ట్:\n\n📞 [${BVCITS_META.admissionsHelpline}](${BVCITS_META.admissionsHelplineHref})\n📧 ${BVCITS_META.email}\n📍 ${BVCITS_META.campusLocation}\n\n[కాంటాక్ట్ పేజీ](${LOCAL_ROUTES.contact})`,
    replyEnglish: `**BVCITS** contact:\n\n📞 [${BVCITS_META.admissionsHelpline}](${BVCITS_META.admissionsHelplineHref})\n📧 ${BVCITS_META.email}\n📍 ${BVCITS_META.campusLocation}\n\n[Contact page](${LOCAL_ROUTES.contact})`,
    spokenTelugu: `కాలేజ్ నంబర్ ${BVCITS_META.admissionsHelpline}. క్రింద కాల్ లింక్ ఇచ్చాను.`,
    spokenEnglish: `The college number is ${BVCITS_META.admissionsHelpline}. The call link is below.`,
    actionCards: [
      navCard(
        "కాంటాక్ట్",
        "Contact Us",
        "అడ్రస్, మ్యాప్, ఫోన్ నంబర్లు.",
        "Address, map and phone numbers.",
        LOCAL_ROUTES.contact,
        "Contact",
      ),
    ],
    quickReplies: [
      qr("🎓 అడ్మిషన్", "🎓 Admission", "how to get admission"),
      qr("📍 ఎక్కడ ఉంది?", "📍 Location", "where is the college located"),
    ],
    isFallback: false,
  };
}

// ─────────────────────────── Fees ───────────────────────────

/**
 * Turns "₹43,000 / year" into a phrase that reads naturally aloud.
 *
 * The TTS route substitutes "రూపాయలు" for "₹", which puts the currency word *before* the
 * number — backwards for Telugu, where the amount comes first ("43,000 రూపాయలు"). Building
 * the spoken phrase here keeps the symbol out of the speech path entirely.
 */
function spokenFee(tuition: string, lang: "te" | "en"): string {
  const amounts = tuition.match(/[\d,]+/g) ?? [];
  if (amounts.length === 0) return tuition;

  if (lang === "te") {
    const value =
      amounts.length > 1 ? `${amounts[0]} నుండి ${amounts[1]}` : amounts[0];
    return `సంవత్సరానికి ${value} రూపాయలు`;
  }

  const value = amounts.length > 1 ? `${amounts[0]} to ${amounts[1]}` : amounts[0];
  return `${value} rupees per year`;
}

/** Picks the fee row matching the department, falling back to the B.Tech convenor row. */
function pickFeeRow(deptKey?: string): FeeItem {
  if (deptKey) {
    const match = FEE_STRUCTURE.find((f) => f.appliesTo.includes(deptKey));
    if (match) return match;
  }
  return FEE_STRUCTURE[0];
}

export function answerFees(dept?: DeptEntity): AgentReply {
  const row = pickFeeRow(dept?.key);
  const label = dept ? dept.short : "B.Tech";
  const hostel = FEE_STRUCTURE.find((f) => f.appliesTo.includes("hostel"));

  return {
    topic: "fees",
    deptKey: dept?.key,
    replyTelugu: `**${label}** — ${row.category}\n\n💰 **${row.tuitionFeePerYear}**\n🎁 ${row.jvdReimbursement}\n\nహాస్టల్ ${hostel?.tuitionFeePerYear ?? "₹55,000 / year"} · కౌన్సెలింగ్ కోడ్ **BVTS**\n\n[అడ్మిషన్ల పేజీ](${LOCAL_ROUTES.admissions})`,
    replyEnglish: `**${label}** — ${row.category}\n\n💰 **${row.tuitionFeePerYear}**\n🎁 ${row.jvdReimbursement}\n\nHostel ${hostel?.tuitionFeePerYear ?? "₹55,000 / year"} · Counselling code **BVTS**\n\n[Admissions page](${LOCAL_ROUTES.admissions})`,
    spokenTelugu: `${label} ఫీజు ${spokenFee(row.tuitionFeePerYear, "te")}. అర్హత ఉంటే విద్యా దీవెన కింద ఫీజు తిరిగి వస్తుంది.`,
    spokenEnglish: `The ${label} fee is ${spokenFee(row.tuitionFeePerYear, "en")}. Eligible students get it reimbursed under the government scheme.`,
    actionCards: [
      {
        type: "fee_breakdown",
        payload: {
          department: label,
          convenorFee: row.tuitionFeePerYear,
          managementFee:
            FEE_STRUCTURE.find((f) => f.appliesTo.includes("management"))?.tuitionFeePerYear ??
            "₹70,000 – ₹1,20,000",
          hostelFee: hostel?.tuitionFeePerYear ?? "₹55,000 / year",
          busFee: "₹12,000 – ₹22,000 / year",
          jvdNotes: row.jvdReimbursement,
          counsellingCode: BVCITS_META.counsellingCode,
        },
      },
    ],
    quickReplies: [
      qr("🎓 ఎలా చేరాలి?", "🎓 How to join?", "how to get admission"),
      qr("🏠 హాస్టల్", "🏠 Hostel", "hostel fee"),
    ],
    isFallback: false,
  };
}

// ─────────────────────────── Placements ───────────────────────────

export function answerPlacements(dept?: DeptEntity): AgentReply {
  const top = PLACEMENT_TOPPERS[0];
  const deptLine = dept ? deptUrl(dept.hod.deptSlug, DEPT_SECTIONS.placements) : LOCAL_ROUTES.placements;

  return {
    topic: "placements",
    deptKey: dept?.key,
    replyTelugu: `🏆 అత్యధిక ప్యాకేజ్ **${top.package}** — ${top.name} (${top.branch}), ${top.recruiter}.\n\n📊 ${BVCITS_META.totalPlacements2026} · సగటు ${BVCITS_META.averagePlacementPackage}\n\n[ప్లేస్‌మెంట్ వివరాలు](${deptLine})`,
    replyEnglish: `🏆 Highest package **${top.package}** — ${top.name} (${top.branch}) at ${top.recruiter}.\n\n📊 ${BVCITS_META.totalPlacements2026} · Average ${BVCITS_META.averagePlacementPackage}\n\n[Placement details](${deptLine})`,
    spokenTelugu: `అత్యధిక ప్యాకేజ్ ముప్పై ఎనిమిది లక్షలు, ${top.recruiter} కంపెనీలో. మొత్తం వెయ్యి రెండు వందల యాభై ఆరు ఆఫర్లు వచ్చాయి.`,
    spokenEnglish: `The highest package is ${top.package} at ${top.recruiter}, with over 1256 offers this year.`,
    actionCards: [
      {
        type: "placements_showcase",
        payload: {
          highest: `${top.package} (${top.recruiter})`,
          top: `${PLACEMENT_TOPPERS[1].package} (${PLACEMENT_TOPPERS[1].recruiter})`,
          totalOffers: BVCITS_META.totalPlacements2026,
          average: BVCITS_META.averagePlacementPackage,
          topRecruiters: [...BVCITS_META.topRecruiters],
          offers: RECRUITER_OFFERS.map((o) => `${o.company} — ${o.pkg}`),
        },
      },
    ],
    quickReplies: [
      qr("🏢 ఏ కంపెనీలు?", "🏢 Which companies?", "which companies recruit"),
      qr("💰 ఫీజు", "💰 Fee", "fee structure"),
    ],
    isFallback: false,
  };
}

// ─────────────────────────── Admissions ───────────────────────────

export function answerAdmissions(dept?: DeptEntity): AgentReply {
  return {
    topic: "admissions",
    deptKey: dept?.key,
    replyTelugu: `AP EAPCET కౌన్సెలింగ్ లో కోడ్ **${BVCITS_META.counsellingCode}** ఇవ్వండి — అంతే.\n\n📞 హెల్ప్‌లైన్ [${BVCITS_META.admissionsHelpline}](${BVCITS_META.admissionsHelplineHref})\n\n[అడ్మిషన్ల పేజీ](${LOCAL_ROUTES.admissions})`,
    replyEnglish: `Enter code **${BVCITS_META.counsellingCode}** in AP EAPCET counselling — that's it.\n\n📞 Helpline [${BVCITS_META.admissionsHelpline}](${BVCITS_META.admissionsHelplineHref})\n\n[Admissions page](${LOCAL_ROUTES.admissions})`,
    spokenTelugu: `కౌన్సెలింగ్ లో బి వి టి ఎస్ కోడ్ ఇవ్వండి. హెల్ప్ లైన్ నంబర్ క్రింద ఉంది.`,
    spokenEnglish: `Use counselling code B V T S. The helpline number is below.`,
    actionCards: [
      navCard(
        "అడ్మిషన్లు",
        "Admissions",
        "ఆన్‌లైన్ ఎంక్వైరీ, సీట్ల వివరాలు.",
        "Online enquiry and seat intake.",
        LOCAL_ROUTES.admissions,
        "Admissions",
        [{ label: "Apply online", href: LIVE_ROUTES.apply }],
      ),
    ],
    quickReplies: [
      qr("💰 ఫీజు ఎంత?", "💰 Fee?", "fee structure"),
      qr("📚 ఏ కోర్సులు?", "📚 Courses?", "what courses are offered"),
    ],
    isFallback: false,
  };
}

// ─────────────────────────── Facilities ───────────────────────────

export function answerHostel(): AgentReply {
  const hostel = FEE_STRUCTURE.find((f) => f.appliesTo.includes("hostel"));
  return {
    topic: "hostel",
    replyTelugu: `🏠 బాలురు, బాలికలకు వేర్వేరు హాస్టళ్లు. **${hostel?.tuitionFeePerYear}** (భోజనంతో).\n\n${hostel?.notes}\n\n${hostel?.jvdReimbursement}`,
    replyEnglish: `🏠 Separate hostels for boys and girls. **${hostel?.tuitionFeePerYear}** including food.\n\n${hostel?.notes}\n\n${hostel?.jvdReimbursement}`,
    spokenTelugu: `హాస్టల్ ఫీజు ఏడాదికి యాభై ఐదు వేలు, భోజనం కలిపి.`,
    spokenEnglish: `Hostel is ₹55,000 a year including food.`,
    actionCards: [],
    quickReplies: [
      qr("🚌 బస్సు రూట్లు", "🚌 Bus routes", "bus routes"),
      qr("💰 ట్యూషన్ ఫీజు", "💰 Tuition fee", "fee structure"),
    ],
    isFallback: false,
  };
}

export function answerTransport(): AgentReply {
  return {
    topic: "transport",
    replyTelugu: `🚌 అమలాపురం, రావులపాలెం, రాజోలు, పాలకొల్లు, కాకినాడ, రాజమండ్రి — అన్ని వైపుల నుండి బస్సులు.\n\nఫీజు **₹12,000 – ₹22,000 / సంవత్సరం** (దూరాన్ని బట్టి).`,
    replyEnglish: `🚌 Buses run from Amalapuram, Ravulapalem, Razole, Palakollu, Kakinada and Rajahmundry.\n\nFare **₹12,000 – ₹22,000 / year** by distance.`,
    spokenTelugu: `అన్ని ప్రధాన ఊళ్ళ నుండి కాలేజ్ బస్సులు ఉన్నాయి. ఫీజు పన్నెండు వేల నుండి ఇరవై రెండు వేల వరకు.`,
    spokenEnglish: `Buses run from all the main towns. The fare is ₹12,000 to ₹22,000 a year.`,
    actionCards: [{ type: "bus_routes", payload: BUS_ROUTES }],
    quickReplies: [
      qr("🏠 హాస్టల్", "🏠 Hostel", "hostel fee"),
      qr("💰 ఫీజు", "💰 Fee", "fee structure"),
    ],
    isFallback: false,
  };
}

// ─────────────────────── Academics / exams ───────────────────────

export function answerResults(): AgentReply {
  return {
    topic: "results",
    replyTelugu: `పరీక్ష ఫలితాలు అటానమస్ పరీక్షల విభాగం పేజీలో ఉంటాయి. హాల్ టికెట్ నంబర్ ఇస్తే మార్కులు వస్తాయి.`,
    replyEnglish: `Results are published on the autonomous examinations page. Enter your hall ticket number there.`,
    spokenTelugu: `పరీక్ష ఫలితాల లింక్ క్రింద ఇచ్చాను. హాల్ టికెట్ నంబర్ ఇస్తే మార్కులు కనిపిస్తాయి.`,
    spokenEnglish: `I've put the results link below. Enter your hall ticket number there.`,
    actionCards: [
      navCard(
        "పరీక్ష ఫలితాలు",
        "Examination Results",
        "అటానమస్ పరీక్షల ఫలితాలు, నోటిఫికేషన్లు.",
        "Autonomous exam results and notifications.",
        LIVE_ROUTES.examinationsAutonomous,
        "Results",
        [{ label: "JNTUK examinations", href: LIVE_ROUTES.examinationsJntuk }],
      ),
    ],
    quickReplies: [
      qr("📅 టైంటేబుల్", "📅 Timetable", "exam timetable"),
      qr("📘 సిలబస్", "📘 Syllabus", "syllabus"),
    ],
    isFallback: false,
  };
}

export function answerTimetable(): AgentReply {
  return {
    topic: "timetable",
    replyTelugu: `పరీక్షల టైంటేబుల్ మరియు అకడమిక్ క్యాలెండర్ పరీక్షల విభాగం పేజీలో ప్రచురిస్తారు.`,
    replyEnglish: `Exam timetables and the academic calendar are published on the examinations page.`,
    spokenTelugu: `టైంటేబుల్ లింక్ క్రింద ఇచ్చాను.`,
    spokenEnglish: `The timetable link is below.`,
    actionCards: [
      navCard(
        "టైంటేబుల్",
        "Timetables & Calendar",
        "సెమిస్టర్ పరీక్షల తేదీలు.",
        "Semester examination dates.",
        LIVE_ROUTES.examinationsAutonomous,
        "Timetable",
      ),
    ],
    quickReplies: [
      qr("📊 రిజల్ట్స్", "📊 Results", "exam results"),
      qr("📘 సిలబస్", "📘 Syllabus", "syllabus"),
    ],
    isFallback: false,
  };
}

export function answerSyllabus(dept?: DeptEntity): AgentReply {
  const href = dept ? deptUrl(dept.hod.deptSlug, DEPT_SECTIONS.syllabus) : LOCAL_ROUTES.departments;
  const label = dept ? dept.short : "అన్ని బ్రాంచ్‌లు";

  return {
    topic: "syllabus",
    deptKey: dept?.key,
    replyTelugu: `**${label}** కోర్స్ స్ట్రక్చర్ & సిలబస్ ఇక్కడ ఉంది.\n\n[సిలబస్ చూడండి](${href})`,
    replyEnglish: `**${dept ? dept.short : "All branches"}** course structure and syllabus.\n\n[Open syllabus](${href})`,
    spokenTelugu: `సిలబస్ లింక్ క్రింద ఇచ్చాను.`,
    spokenEnglish: `The syllabus link is below.`,
    actionCards: [
      navCard(
        "సిలబస్",
        "Course Structure & Syllabus",
        "రెగ్యులేషన్ ప్రకారం సిలబస్.",
        "Syllabus by regulation.",
        href,
        "Syllabus",
      ),
    ],
    quickReplies: [
      qr("📊 రిజల్ట్స్", "📊 Results", "exam results"),
      qr("👨‍🏫 ఫ్యాకల్టీ", "👨‍🏫 Faculty", `${dept?.short ?? "CSE"} faculty`),
    ],
    isFallback: false,
  };
}

export function answerFaculty(dept: DeptEntity): AgentReply {
  const { hod } = dept;
  const href = deptUrl(hod.deptSlug, DEPT_SECTIONS.faculty);
  const count = hod.facultyCount;
  const countLineTe = count > 0 ? `**${count}** మంది అధ్యాపకులు ఉన్నారు. ` : "";
  const countLineEn = count > 0 ? `**${count}** faculty members. ` : "";

  return {
    topic: "faculty",
    deptKey: dept.key,
    replyTelugu: `**${dept.short}** విభాగంలో ${countLineTe}కాలేజ్ మొత్తం ${BVCITS_META.facultyStrength}.\n\n[ఫ్యాకల్టీ జాబితా](${href})`,
    replyEnglish: `**${dept.short}** has ${countLineEn}The college has ${BVCITS_META.facultyStrength}.\n\n[Faculty list](${href})`,
    spokenTelugu:
      count > 0
        ? `${dept.short} విభాగంలో ${count} మంది అధ్యాపకులు ఉన్నారు.`
        : `ఫ్యాకల్టీ జాబితా లింక్ క్రింద ఇచ్చాను.`,
    spokenEnglish:
      count > 0
        ? `${dept.short} has ${count} faculty members.`
        : `The faculty list link is below.`,
    actionCards: [
      navCard(
        "ఫ్యాకల్టీ",
        "Faculty",
        "అధ్యాపకుల జాబితా & అర్హతలు.",
        "Faculty list and qualifications.",
        href,
        "Faculty",
      ),
    ],
    quickReplies: [
      qr("👨‍🏫 HOD ఎవరు?", "👨‍🏫 Who is HOD?", `${dept.short} hod`),
      qr("🔬 ల్యాబ్‌లు", "🔬 Labs", `${dept.short} infrastructure`),
    ],
    isFallback: false,
  };
}

export function answerIntake(dept: DeptEntity): AgentReply {
  const { hod } = dept;
  const href = deptUrl(hod.deptSlug, DEPT_SECTIONS.admissions);

  return {
    topic: "intake",
    deptKey: dept.key,
    replyTelugu: `**${dept.short}** సీట్ల సంఖ్య **${hod.intake}**.\n\nకౌన్సెలింగ్ కోడ్ **${BVCITS_META.counsellingCode}**.\n\n[వివరాలు](${href})`,
    replyEnglish: `**${dept.short}** sanctioned intake is **${hod.intake}** seats.\n\nCounselling code **${BVCITS_META.counsellingCode}**.\n\n[Details](${href})`,
    spokenTelugu: `${dept.short} లో ${hod.intake} సీట్లు ఉన్నాయి.`,
    spokenEnglish: `${dept.short} has ${hod.intake} seats.`,
    actionCards: [],
    quickReplies: [
      qr("💰 ఫీజు", "💰 Fee", `${dept.short} fee`),
      qr("🎓 ఎలా చేరాలి?", "🎓 How to join?", "how to get admission"),
    ],
    isFallback: false,
  };
}

export function answerCourses(): AgentReply {
  const depts = allDepartments().filter((d) => d.key !== "sh");
  const listTe = depts.map((d) => `• ${d.short} (${d.hod.intake} సీట్లు)`).join("\n");
  const listEn = depts.map((d) => `• ${d.short} — ${d.hod.intake} seats`).join("\n");

  return {
    topic: "courses",
    replyTelugu: `మా బ్రాంచ్‌లు:\n\n${listTe}\n\n[అన్ని విభాగాలు](${LOCAL_ROUTES.departments})`,
    replyEnglish: `Our branches:\n\n${listEn}\n\n[All departments](${LOCAL_ROUTES.departments})`,
    spokenTelugu: `సీ ఎస్ ఈ, ఏ ఐ డేటా సైన్స్, ఏ ఐ ఎం ఎల్, ఈ సి ఈ, ఈ ఈ ఈ, మెకానికల్, సివిల్, ఎం బి ఏ, ఎం సి ఏ కోర్సులు ఉన్నాయి.`,
    spokenEnglish: `We offer C S E, A I and Data Science, A I M L, E C E, E E E, Mechanical, Civil, M B A and M C A.`,
    actionCards: [
      navCard(
        "విభాగాలు",
        "Departments",
        "పది విభాగాలు, సీట్లు, ఫ్యాకల్టీ.",
        "Ten departments with intake and faculty.",
        LOCAL_ROUTES.departments,
        "Departments",
      ),
    ],
    quickReplies: [
      qr("💰 ఫీజు", "💰 Fee", "fee structure"),
      qr("🏆 ప్లేస్‌మెంట్స్", "🏆 Placements", "placements"),
    ],
    isFallback: false,
  };
}

export function answerLocation(): AgentReply {
  return {
    topic: "location",
    replyTelugu: `📍 ${BVCITS_META.campusLocation}\n\n${BVCITS_META.campusSize}.\n\n[మ్యాప్ & దారి](${LOCAL_ROUTES.contact})`,
    replyEnglish: `📍 ${BVCITS_META.campusLocation}\n\n${BVCITS_META.campusSize}.\n\n[Map and directions](${LOCAL_ROUTES.contact})`,
    spokenTelugu: `కాలేజ్ బట్లపాలెం, అమలాపురం లో ఉంది. నలభై ఎకరాల క్యాంపస్.`,
    spokenEnglish: `The campus is at Batlapalem, Amalapuram — forty acres.`,
    actionCards: [
      navCard(
        "కాంటాక్ట్ & మ్యాప్",
        "Contact & Map",
        "అడ్రస్, మ్యాప్, ఫోన్.",
        "Address, map and phone.",
        LOCAL_ROUTES.contact,
        "Location",
      ),
    ],
    quickReplies: [
      qr("🚌 బస్సు రూట్లు", "🚌 Bus routes", "bus routes"),
      qr("🏠 హాస్టల్", "🏠 Hostel", "hostel"),
    ],
    isFallback: false,
  };
}

export function answerAccreditation(): AgentReply {
  return {
    topic: "accreditation",
    replyTelugu: `**${BVCITS_META.accreditation}**\n\n${BVCITS_META.recognitions.join(" · ")}\n\n[మా గురించి](${LOCAL_ROUTES.about})`,
    replyEnglish: `**${BVCITS_META.accreditation}**\n\n${BVCITS_META.recognitions.join(" · ")}\n\n[About us](${LOCAL_ROUTES.about})`,
    spokenTelugu: `కాలేజ్ అటానమస్, నాక్ ఏ గ్రేడ్, ఎన్ బి ఏ గుర్తింపు, జే ఎన్ టి యు కే అనుబంధం.`,
    spokenEnglish: `We're autonomous with NAAC A grade, NBA accreditation and JNTUK affiliation.`,
    actionCards: [
      navCard(
        "గుర్తింపులు",
        "Accreditations",
        "NAAC, NBA, NIRF వివరాలు.",
        "NAAC, NBA and NIRF details.",
        LOCAL_ROUTES.about,
        "Accreditation",
        [
          { label: "NIRF", href: LIVE_ROUTES.nirf },
          { label: "NAAC SSR", href: LIVE_ROUTES.naacSsr },
        ],
      ),
    ],
    quickReplies: [
      qr("🏆 ప్లేస్‌మెంట్స్", "🏆 Placements", "placements"),
      qr("📚 కోర్సులు", "📚 Courses", "what courses are offered"),
    ],
    isFallback: false,
  };
}

export function answerLibrary(): AgentReply {
  return {
    topic: "library",
    replyTelugu: `📚 సెంట్రల్ డిజిటల్ లైబ్రరీ — పుస్తకాలు, IEEE/Springer ఈ-జర్నల్స్.\n\n[లైబ్రరీ పేజీ](${LIVE_ROUTES.library})`,
    replyEnglish: `📚 Central digital library with books and IEEE/Springer e-journals.\n\n[Library page](${LIVE_ROUTES.library})`,
    spokenTelugu: `సెంట్రల్ డిజిటల్ లైబ్రరీ ఉంది. లింక్ క్రింద ఇచ్చాను.`,
    spokenEnglish: `There's a central digital library. The link is below.`,
    actionCards: [
      navCard(
        "లైబ్రరీ",
        "Library",
        "పుస్తకాలు, ఈ-జర్నల్స్, డిజిటల్ వనరులు.",
        "Books, e-journals and digital resources.",
        LIVE_ROUTES.library,
        "Library",
      ),
    ],
    quickReplies: [
      qr("🏫 ఇన్‌ఫ్రాస్ట్రక్చర్", "🏫 Infrastructure", "cse infrastructure"),
      qr("📚 కోర్సులు", "📚 Courses", "what courses are offered"),
    ],
    isFallback: false,
  };
}

// ─────────────────────── Conversational glue ───────────────────────

export function answerGreeting(): AgentReply {
  return {
    topic: "greeting",
    replyTelugu: `నమస్కారం! 🙏 BVCITS గురించి ఏమైనా అడగండి — ఫీజు, HOD, ప్లేస్‌మెంట్స్, అడ్మిషన్.`,
    replyEnglish: `Namaskaram! 🙏 Ask me anything about BVCITS — fees, HODs, placements, admissions.`,
    spokenTelugu: `నమస్కారం! ఏం కావాలో అడగండి.`,
    spokenEnglish: `Namaskaram! What would you like to know?`,
    actionCards: [],
    quickReplies: [
      qr("💰 ఫీజు", "💰 Fee", "fee structure"),
      qr("📞 HOD", "📞 HOD", "cse hod"),
      qr("🏆 ప్లేస్‌మెంట్స్", "🏆 Placements", "placements"),
      qr("🎓 అడ్మిషన్", "🎓 Admission", "how to get admission"),
    ],
    isFallback: false,
  };
}

export function answerBackchannel(): AgentReply {
  return {
    topic: "backchannel",
    replyTelugu: `చెప్పండి, వింటున్నాను…`,
    replyEnglish: `Go ahead, I'm listening…`,
    spokenTelugu: `చెప్పండి.`,
    spokenEnglish: `Go ahead.`,
    actionCards: [],
    quickReplies: [],
    isFallback: false,
  };
}

/**
 * Genuine fallback. Says what it *can* do rather than only "I didn't understand",
 * so the user always has a next step.
 */
export function answerUnknown(): AgentReply {
  return {
    topic: "unknown",
    replyTelugu: `అది నాకు సరిగ్గా అర్థం కాలేదు అండీ. ఫీజు, సీట్లు, HOD, ప్లేస్‌మెంట్స్, అడ్మిషన్, హాస్టల్, బస్సు — వీటి గురించి అడగండి.\n\n📞 [${BVCITS_META.admissionsHelpline}](${BVCITS_META.admissionsHelplineHref})`,
    replyEnglish: `I didn't quite get that. Try asking about fees, seats, HODs, placements, admissions, hostel or buses.\n\n📞 [${BVCITS_META.admissionsHelpline}](${BVCITS_META.admissionsHelplineHref})`,
    spokenTelugu: `అది అర్థం కాలేదు. ఫీజు, సీట్లు, హెచ్ ఓ డి, ప్లేస్‌మెంట్స్ గురించి అడగండి.`,
    spokenEnglish: `I didn't catch that. Try asking about fees, seats, H O Ds or placements.`,
    actionCards: [],
    quickReplies: [
      qr("💰 ఫీజు", "💰 Fee", "fee structure"),
      qr("🎓 అడ్మిషన్", "🎓 Admission", "how to get admission"),
      qr("📞 కాంటాక్ట్", "📞 Contact", "contact number"),
    ],
    isFallback: true,
  };
}

/** Exposed so the engine can name the default department without importing the map. */
export function defaultDept(): DeptEntity {
  return { key: DEFAULT_DEPT_KEY, short: "CSE", hod: HOD_DIRECTORY[DEFAULT_DEPT_KEY] };
}
