import type { UserRole } from "./roles";

/**
 * Demo credentials for the login page.
 *
 * These are real accounts with real privileges — the demo administrator can
 * manage every user and open the Marketing Studio. They are therefore shown
 * ONLY when NEXT_PUBLIC_DEMO_LOGINS is explicitly enabled, and the flag must
 * stay off on any deployment holding real data.
 *
 * Accounts are created by `npm run seed:demo`, which is the source of truth for
 * the email addresses and the password.
 */
export const DEMO_PASSWORD = "BvcitsDemo#2026";

export interface DemoAccount {
  role: UserRole;
  email: string;
  label: string;
  unlocks: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    role: "student",
    email: "demo.student@example.com",
    label: "Student",
    unlocks: "Announcements for students, own profile",
  },
  {
    role: "parent",
    email: "demo.parent@example.com",
    label: "Parent",
    unlocks: "Announcements for parents",
  },
  {
    role: "faculty",
    email: "demo.faculty@example.com",
    label: "Faculty",
    unlocks: "+ Post announcements",
  },
  {
    role: "admin",
    email: "demo.admin@example.com",
    label: "Administrator",
    unlocks: "+ Enquiries, insights, users, Marketing Studio",
  },
];

/**
 * Whether to show the demo panel.
 *
 * Compared against the literal string so any value other than "1" — including
 * "0", "false" or an empty variable — leaves it off. Defaulting to hidden
 * matters more than convenience here.
 */
export function demoLoginsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_LOGINS === "1";
}
