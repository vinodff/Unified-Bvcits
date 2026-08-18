import type { Metadata } from "next";
import { Inter, Manrope, Fraunces } from "next/font/google";
import "./globals.css";
import AppChrome from "@/components/layout/AppChrome";
import SmoothScroll from "@/components/motion/SmoothScroll";
import { site } from "@/lib/site";

// Design system v2 — docs/DESIGN-SPEC.md: Manrope (display) + Inter (body),
// Fraunces retained as the heritage serif accent.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: `${site.shortName} — ${site.name}`,
    template: `%s · ${site.shortName}`,
  },
  description:
    "BVC Institute of Technology & Science (BVCITS), Amalapuram — Autonomous, NAAC 'A' Grade, NBA accredited, affiliated to JNTUK.",
  metadataBase: new URL("https://bvcits.edu.in"),
  icons: { icon: "/assets/logos/cropped-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-white font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-gold focus:px-4 focus:py-2 focus:text-black"
        >
          Skip to content
        </a>
        <SmoothScroll />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
