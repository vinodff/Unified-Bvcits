#!/usr/bin/env node
// Grant a role to an existing account, by email.
//
// Solves the bootstrap problem: roles are assigned from /dashboard/users, which
// itself requires an admin — so the FIRST admin cannot be made through the UI.
// This script uses the service key directly, which is why it is a local CLI and
// not an HTTP route.
//
//   node scripts/grant-role.mjs someone@bvcits.edu.in admin
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VALID_ROLES = [
  "student",
  "parent",
  "faculty",
  "management",
  "regulatory",
  "recruiter",
  "trainer",
  "admin",
];

/** Minimal .env parser — avoids a dependency for one file read. */
function loadEnv(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // No .env.local — fall through to the checks below.
  }
}

async function main() {
  loadEnv();

  const [email, role] = process.argv.slice(2);

  if (!email || !role) {
    console.error("Usage: node scripts/grant-role.mjs <email> <role>");
    console.error(`Roles: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Unknown role "${role}". Valid: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The profile row is created by the on_auth_user_created trigger, so the
  // account must already exist — this script grants a role, it does not invite.
  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error(`Lookup failed: ${lookupError.message}`);
    if (lookupError.code === "42P01") {
      console.error("The profiles table does not exist — apply supabase/migrations/0004_auth_roles.sql first.");
    }
    process.exit(1);
  }

  if (!profile) {
    console.error(`No account for ${email}. Have them sign up at /signup first.`);
    process.exit(1);
  }

  if (profile.role === role) {
    console.log(`${email} is already ${role}. Nothing to do.`);
    return;
  }

  const { error } = await supabase.rpc("set_user_role", {
    p_user_id: profile.id,
    p_role: role,
  });

  if (error) {
    console.error(`Could not set role: ${error.message}`);
    process.exit(1);
  }

  console.log(`${profile.full_name ?? email}: ${profile.role} → ${role}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
