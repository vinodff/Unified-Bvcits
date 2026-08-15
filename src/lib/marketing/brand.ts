// Brand configuration — the controlled memory every agent reads (spec Section 41).
// Values grounded in docs/AGENT-RULES.md + docs/DESIGN-SPEC.md (evidence-backed).

import type { BrandSettings } from "./domain";

export const DEFAULT_BRAND: BrandSettings = {
  collegeName: "Bonam Venkata Chalamayya Institute of Technology & Science",
  shortName: "BVCITS",
  abbreviation: "BVCITS",
  website: "https://bvcits.edu.in",
  counsellingCode: "BVTS",
  logoPath: "/assets/logos/cropped-logo.png",
  colors: {
    black: "#0B0B0C",
    gold: "#F5B800",
    goldDark: "#D89B00",
    ivory: "#F8F6F0",
    white: "#FFFFFF",
    charcoal: "#18181B",
    maroon: "#7A1717",
  },
  tone:
    "Premium, institutional, confident. Evidence over hype: only claims backed by campaign facts. Telugu audience context (Amalapuram, Konaseema, AP).",
  preferredTerminology: [
    "Autonomous",
    "NAAC 'A' Grade",
    "NBA Accredited",
    "AICTE Approved",
    "JNTUK Affiliated",
    "Counselling Code BVTS",
    "40-acre green campus",
  ],
  departments: ["CSE", "AI & DS", "AI & ML", "ECE", "EEE", "Mechanical", "Civil", "MBA", "MCA", "Science & Humanities"],
  socialHandles: {},
  contact: {
    phone: "+91 99854 22678",
    email: "info@bvcits.edu.in",
    address: "Amalapuram, Andhra Pradesh",
  },
  officialHashtags: ["#BVCITS", "#BVCITSAmalapuram", "#Konaseema", "#EngineeringCollege"],
  forbiddenTerminology: ["world's best", "best college ever", "guaranteed placement"],
  approvalRule:
    "Nothing may be published before an explicit administrator approval recorded server-side. Any edit after approval invalidates it.",
};

/** Platform publishing capability matrix — verified against official API docs (Aug 2026). */
export const PLATFORM_CAPABILITIES: Record<
  string,
  { publishing: boolean; scheduling: "api" | "caller"; media: boolean; analytics: boolean; note: string }
> = {
  website: {
    publishing: true,
    scheduling: "caller",
    media: true,
    analytics: false,
    note: "The site is its own publisher — the worker records the publish; the article renders on the site itself.",
  },
  instagram: {
    publishing: true,
    scheduling: "api",
    media: true,
    analytics: true,
    note: "Meta Graph API Content Publishing. Requires Business/Creator account, linked FB Page, app review. Schedule window 10min–75d. 25 posts/24h.",
  },
  facebook: {
    publishing: true,
    scheduling: "api",
    media: true,
    analytics: true,
    note: "Pages API. published=false + scheduled_publish_time (10min–30d). Requires pages_manage_posts + app review.",
  },
  linkedin: {
    publishing: true,
    scheduling: "caller",
    media: true,
    analytics: false,
    note: "Posts API /rest/posts. NO official scheduling parameter — our scheduler calls the API at the chosen time. w_member_social self-serve; org pages need partner approval.",
  },
  whatsapp: {
    publishing: true,
    scheduling: "caller",
    media: true,
    analytics: true,
    note: "Cloud API. Template messages (pre-approved) + 24h customer-service window. WhatsApp Status publishing is NOT supported by the official API.",
  },
};

export const SUPPORTED_PLATFORMS = ["instagram", "facebook", "linkedin", "whatsapp", "website"] as const;