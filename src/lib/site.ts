// Single source of truth for site-wide constants and navigation.
// Grounded in docs/SITEMAP.md + docs/NAVIGATION.md (live bvcits.edu.in).

export const site = {
  // Exact branding as used on the live site / crest.
  name: "BVC Institute of Technology & Science",
  shortName: "BVCITS",
  tagline: "Autonomous · NAAC 'A' Grade · Amalapuram",
  location: "Amalapuram, Andhra Pradesh",
  counsellingCode: "BVTS",
  phone: "+91 99854 22678",
  phoneHref: "tel:+919985422678",
  email: "principal@bvcits.edu.in",
  liveUrl: "https://bvcits.edu.in",
  applyUrl: "/admissions#enquiry",
  internationalApplyUrl: "https://apply.bvcits.edu.in/",
} as const;

export type NavLink = { label: string; href: string; external?: boolean };
export type NavColumn = { heading?: string; links: NavLink[] };
export type NavItem = {
  label: string;
  href: string;
  columns?: NavColumn[];
};

// Departments used by the mega-menu (kept in sync with src/data/departments.ts).
import { departmentList } from "@/data/departments";
// The seven audience portals. Their nav dropdowns are DERIVED from the portal
// data rather than restated here, so a section added to a portal page appears
// in the header automatically and the two can never drift apart.
import { portals } from "@/data/portals";
import { legacySections } from "@/data/legacy-index";

/** Builds a portal's dropdown: an overview link plus one anchor per section. */
function portalNavItem(portal: (typeof portals)[number]): NavItem {
  return {
    label: portal.navLabel,
    href: `/${portal.slug}`,
    columns: [
      {
        links: [
          { label: `${portal.navLabel} — Overview`, href: `/${portal.slug}` },
          ...portal.groups.map((g) => ({
            label: g.heading,
            href: `/${portal.slug}#${g.id}`,
          })),
        ],
      },
    ],
  };
}

// Navigation is organised by AUDIENCE, not by the institute's org chart — one
// platform serving students, parents, staff, management, regulators, recruiters
// and trainers. Everything organised by topic instead lives under "Others".
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  ...portals.map(portalNavItem),
  {
    label: "About",
    href: "/about-us",
    columns: [
      {
        heading: "Institute",
        links: [
          { label: "About BVCITS", href: "/about-us#about-bvcits" },
          { label: "Vision & Mission", href: "/about-us#vision-mission" },
          { label: "Core Values", href: "/about-us#core-values" },
          { label: "Organisation Structure", href: "/about-us#organisation" },
          { label: "Principal's Message", href: "/about-us#principals-message" },
          { label: "MoUs", href: "/about-us/mous" },
          { label: "Admissions", href: "/admissions" },
          { label: "Placements", href: "/placements-cell" },
          { label: "Campus Life", href: "/campus-life" },
          { label: "Contact Us", href: "/contact-us" },
        ],
      },
      {
        heading: "Departments",
        links: [
          ...departmentList.map((d) => ({
            label: d.name,
            href: `/departments/${d.slug}`,
          })),
          { label: "All Departments", href: "/departments" },
        ],
      },
    ],
  },
  {
    label: "Others",
    href: "/others",
    columns: [
      {
        links: [
          { label: "Full Site Index", href: "/others" },
          ...legacySections.map((s) => ({
            label: s.heading,
            href: `/others#${s.id}`,
          })),
        ],
      },
    ],
  },
];

export const footerColumns: NavColumn[] = [
  {
    heading: "For You",
    links: portals.map((p) => ({ label: p.navLabel, href: `/${p.slug}` })),
  },
  {
    heading: "Academics",
    links: [
      { label: "Departments", href: "/departments" },
      { label: "Admissions", href: "/admissions" },
      { label: "Examinations", href: "/others#examinations-autonomous" },
      { label: "IQAC", href: "/iqac/naac-ssr" },
      { label: "NIRF", href: "/nirf" },
      { label: "Polytechnic", href: "/polytechnic" },
    ],
  },
  {
    heading: "Institute",
    links: [
      { label: "About Us", href: "/about-us" },
      { label: "Placements", href: "/placements-cell" },
      { label: "Contact Us", href: "/contact-us" },
      { label: "Full Site Index", href: "/others" },
      { label: "International Admissions", href: site.internationalApplyUrl, external: true },
      { label: "Privacy Policy", href: "/privacy-policy" },
    ],
  },
];

// Rotating headlines for the notifications ticker (home).
export const notifications: string[] = [
  "Admissions open for 2026–27 — Apply now under counselling code BVTS",
  "Autonomous B.Tech I Semester examination results published",
  "Faculty Development Programme on AI & Machine Learning — register at the IQAC cell",
  "Campus placements 2026: 1256+ offers across 58+ MNCs · highest package 38 LPA",
];
