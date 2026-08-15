import type { Metadata } from "next";
import StudioApp from "./studio-app";

export const metadata: Metadata = {
  title: "Marketing Studio — BVCITS",
  description: "BVCITS AI Marketing & Social Media Automation Studio — admin access.",
  robots: { index: false, follow: false },
};

export default function MarketingStudioPage() {
  return <StudioApp />;
}