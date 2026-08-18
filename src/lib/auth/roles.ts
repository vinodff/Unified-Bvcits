// Role model for signed-in users.
//
// The eight roles mirror the seven stakeholder portals in src/data/portals.ts
// (see docs/IA-STAKEHOLDER-NAV.md) plus `admin`. That is deliberate: a signed-in
// user's role maps onto the portal they already navigate to, so authentication
// adds a layer to the existing IA instead of inventing a second one.
//
// As in domain.ts, the union is DERIVED from the runtime array so the list the
// UI renders and the type the code checks cannot drift. Adding a role here also
// needs `alter type public.user_role add value` — see
// supabase/migrations/0004_auth_roles.sql.

export const USER_ROLES = [
  "student",
  "parent",
  "faculty",
  "management",
  "regulatory",
  "recruiter",
  "trainer",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  student: "Student",
  parent: "Parent / Guardian",
  faculty: "Faculty & Staff",
  management: "Management",
  regulatory: "Regulatory Body",
  recruiter: "Recruiter",
  trainer: "Training Partner",
  admin: "Administrator",
};

/**
 * The public portal each role belongs to. `admin` has no audience portal of its
 * own — administration is a function, not an audience — so it borrows the
 * management portal for its public-facing links.
 */
export const ROLE_PORTAL: Record<UserRole, string> = {
  student: "/students",
  parent: "/parents",
  faculty: "/staff",
  management: "/management",
  regulatory: "/regulatory",
  recruiter: "/recruiters",
  trainer: "/trainers",
  admin: "/management",
};

/** Roles a visitor may choose when registering. */
export const SELF_SIGNUP_ROLES: readonly UserRole[] = [
  "student",
  "parent",
  "recruiter",
  "trainer",
];

/**
 * Roles that must be granted by an administrator.
 *
 * Note this list is advisory for the UI only — the database is the real
 * boundary. `handle_new_user()` forces every new account to 'student'
 * regardless of what the signup form submits, and
 * `guard_profile_privilege_change()` blocks self-service role edits. A user who
 * bypasses this form gains nothing.
 */
export const ADMIN_GRANTED_ROLES: readonly UserRole[] = [
  "faculty",
  "management",
  "regulatory",
  "admin",
];

// --- capabilities -----------------------------------------------------------

/**
 * One capability per thing a signed-in user can actually do in this app. Kept
 * as data rather than scattered `role === "admin"` checks so the dashboard, the
 * nav and the API routes all answer the question the same way.
 */
export const CAPABILITIES = [
  "announcements.read",
  "announcements.write",
  "enquiries.read",
  "assistant.insights",
  "marketing.studio",
  "users.manage",
  "opportunities.read",
  "opportunities.moderate",
  "exams.create",
  "exams.review",
  "academics.record",
  "academics.manage",
  "results.publish",
  "certificates.generate",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// `opportunities.read` is held by every role. The feed is aimed at students,
// but a parent tracking deadlines and a faculty member pointing a class at a
// hackathon both need to see the same list — and the rows are public-web
// postings, so there is nothing to withhold. `opportunities.moderate` is the
// oversight half: retiring a bad row, or reviewing what the verifier rejected.
const CAPABILITY_MATRIX: Record<UserRole, readonly Capability[]> = {
  student: ["announcements.read", "opportunities.read"],
  parent: ["announcements.read", "opportunities.read"],
  recruiter: ["announcements.read", "opportunities.read"],
  trainer: ["announcements.read", "opportunities.read"],
  regulatory: ["announcements.read", "opportunities.read"],
  // academics.record: mark attendance and enter/publish subject results for
  // whichever (subject, class) pairs the timetable actually assigns them —
  // teaches_student() in 0007_student_records.sql is the real boundary, this
  // capability only decides whether the "My Classes" page exists for them.
  faculty: ["announcements.read", "announcements.write", "opportunities.read", "exams.review", "academics.record", "certificates.generate"],
  management: [
    "announcements.read",
    "announcements.write",
    "enquiries.read",
    "assistant.insights",
    "opportunities.read",
    "opportunities.moderate",
    // Read-only institutional oversight, same flavour as enquiries/insights —
    // not academics.record, management does not mark attendance or enter marks.
    "academics.manage",
    // Bulk results publishing is an examination-branch function, and in this
    // institution that sits with management as well as the site admin. It is
    // NOT given to faculty: uploading a sheet publishes marks for every branch
    // at once, which is a wider blast radius than the per-class marks entry
    // `academics.record` already covers.
    "results.publish",
    "certificates.generate",
  ],
  admin: [
    "announcements.read",
    "announcements.write",
    "enquiries.read",
    "assistant.insights",
    "marketing.studio",
    "users.manage",
    "opportunities.read",
    "opportunities.moderate",
    "exams.create",
    "exams.review",
    "academics.record",
    "academics.manage",
    "results.publish",
    "certificates.generate",
  ],
};

export function can(role: UserRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITY_MATRIX[role].includes(capability);
}

export function capabilitiesFor(role: UserRole | null | undefined): readonly Capability[] {
  return role ? CAPABILITY_MATRIX[role] : [];
}

/** Departments a student or faculty member can be attached to. */
export const DEPARTMENT_OPTIONS = [
  "CSE",
  "CSE (AI & ML)",
  "AI & DS",
  "ECE",
  "EEE",
  "Mechanical",
  "Civil",
  "MBA",
  "MCA",
  "Basic Sciences & Humanities",
] as const;
