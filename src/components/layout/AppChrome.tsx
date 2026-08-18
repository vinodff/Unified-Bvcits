"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import BvcitsAssistantLauncher from "@/components/chat/BvcitsAssistantLauncher";
import { ScrollProgress } from "@/components/motion/Primitives";

/**
 * The active exam-taking route runs as a locked-down, distraction-free
 * environment: no site nav (a student could click away mid-exam), no chat
 * widget, no scroll-progress bar layered above the exam's own header.
 * Everything else keeps the normal site chrome.
 */
export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSecureExam = pathname?.startsWith("/placement-portal/exam/") ?? false;

  if (isSecureExam) {
    return <main id="main">{children}</main>;
  }

  return (
    <>
      <ScrollProgress />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <BvcitsAssistantLauncher />
    </>
  );
}
