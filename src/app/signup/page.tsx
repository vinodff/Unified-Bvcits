import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create Account | BVCITS",
  description:
    "Create a BVCITS account to access announcements and services for students, parents, recruiters and training partners.",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Register as a student, parent, recruiter or training partner."
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-crimson hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
