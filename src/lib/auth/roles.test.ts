import { describe, expect, test } from "vitest";
import {
  ADMIN_GRANTED_ROLES,
  CAPABILITIES,
  ROLE_LABELS,
  ROLE_PORTAL,
  SELF_SIGNUP_ROLES,
  USER_ROLES,
  can,
  capabilitiesFor,
  isUserRole,
  type Capability,
  type UserRole,
} from "./roles";
import { portals } from "@/data/portals";

describe("role definitions", () => {
  test("every role has a label and a portal", () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABELS[role], `label for ${role}`).toBeTruthy();
      expect(ROLE_PORTAL[role], `portal for ${role}`).toMatch(/^\//);
    }
  });

  test("every role portal resolves to a real portal page", () => {
    const slugs = new Set(portals.map((p) => p.slug));
    for (const role of USER_ROLES) {
      const slug = ROLE_PORTAL[role].replace(/^\//, "");
      expect(slugs.has(slug), `${role} → /${slug} must exist in portals.ts`).toBe(true);
    }
  });

  test("isUserRole accepts known roles and rejects everything else", () => {
    expect(isUserRole("student")).toBe(true);
    expect(isUserRole("admin")).toBe(true);
    expect(isUserRole("superuser")).toBe(false);
    expect(isUserRole("")).toBe(false);
    expect(isUserRole(null)).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isUserRole(42)).toBe(false);
  });

  test("self-signup and admin-granted roles do not overlap", () => {
    for (const role of SELF_SIGNUP_ROLES) {
      expect(ADMIN_GRANTED_ROLES).not.toContain(role);
    }
  });

  test("no privileged role is self-signup selectable", () => {
    const privileged: Capability[] = ["users.manage", "marketing.studio", "enquiries.read"];
    for (const role of SELF_SIGNUP_ROLES) {
      for (const capability of privileged) {
        expect(can(role, capability), `${role} must not have ${capability}`).toBe(false);
      }
    }
  });
});

describe("capabilities", () => {
  test("every role can read announcements", () => {
    for (const role of USER_ROLES) {
      expect(can(role, "announcements.read"), role).toBe(true);
    }
  });

  test("only admin can manage users or open the studio", () => {
    const adminOnly: Capability[] = ["users.manage", "marketing.studio"];
    for (const capability of adminOnly) {
      const holders = USER_ROLES.filter((r) => can(r, capability));
      expect(holders, capability).toEqual(["admin"]);
    }
  });

  test("only management and admin read enquiries", () => {
    const holders = USER_ROLES.filter((r) => can(r, "enquiries.read"));
    expect(holders.sort()).toEqual(["admin", "management"]);
  });

  test("students and parents cannot write announcements", () => {
    expect(can("student", "announcements.write")).toBe(false);
    expect(can("parent", "announcements.write")).toBe(false);
    expect(can("faculty", "announcements.write")).toBe(true);
    expect(can("management", "announcements.write")).toBe(true);
    expect(can("admin", "announcements.write")).toBe(true);
  });

  test("a null or unknown role has no capabilities", () => {
    for (const capability of CAPABILITIES) {
      expect(can(null, capability)).toBe(false);
      expect(can(undefined, capability)).toBe(false);
    }
    expect(capabilitiesFor(null)).toHaveLength(0);
  });

  test("admin holds every declared capability", () => {
    for (const capability of CAPABILITIES) {
      expect(can("admin", capability), capability).toBe(true);
    }
  });

  test("capability lists contain only declared capabilities", () => {
    for (const role of USER_ROLES) {
      for (const capability of capabilitiesFor(role)) {
        expect(CAPABILITIES, `${role} has undeclared ${capability}`).toContain(capability);
      }
    }
  });

  test("privilege is monotonic: admin is a superset of every other role", () => {
    const adminCaps = new Set(capabilitiesFor("admin"));
    for (const role of USER_ROLES) {
      for (const capability of capabilitiesFor(role)) {
        expect(adminCaps.has(capability), `admin missing ${capability} held by ${role}`).toBe(true);
      }
    }
  });
});

describe("role/enum parity with the database", () => {
  // 0004_auth_roles.sql declares public.user_role. If this list changes without
  // an `alter type ... add value`, inserts fail at runtime with an enum error.
  const SQL_ENUM_VALUES: UserRole[] = [
    "student",
    "parent",
    "faculty",
    "management",
    "regulatory",
    "recruiter",
    "trainer",
    "admin",
  ];

  test("USER_ROLES matches the Postgres enum exactly", () => {
    expect([...USER_ROLES].sort()).toEqual([...SQL_ENUM_VALUES].sort());
  });
});
