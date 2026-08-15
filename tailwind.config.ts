import type { Config } from "tailwindcss";

// Premium design system v2 — docs/DESIGN-SPEC.md "Design System v2".
// Legacy token names (navy/crimson/bvblue) are REMAPPED, not removed, so every
// existing component inherits the new palette without a sweep. Only new code
// should use the semantic names below.
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ---- Brand — institutional black (#0B0B0C) ----
        brand: {
          black: "#0B0B0C",
          charcoal: "#18181B",
          gold: "#F5B800",
          goldDark: "#D89B00",
          ivory: "#F8F6F0",
          white: "#FFFFFF",
          maroon: "#7A1717",
        },
        // ---- Legacy alias: navy → brand black (was deep navy #072153) ----
        navy: {
          DEFAULT: "#0B0B0C",
          50: "#F4F4F5",
          100: "#E4E4E7",
          200: "#D4D4D8",
          300: "#A1A1AA",
          400: "#71717A",
          500: "#3F3F46",
          600: "#27272A",
          700: "#18181B",
          800: "#111113",
          900: "#0B0B0C",
          950: "#050506",
        },
        // ---- Legacy alias: crimson → luxury gold #D89B00 ----
        // Used for links/eyebrows/labels. Dark enough for readable text on white.
        crimson: {
          DEFAULT: "#D89B00",
          50: "#FCF7E6",
          100: "#F9EDC0",
          200: "#F4DD85",
          300: "#F0CB45",
          400: "#E0A600",
          500: "#C69000",
          600: "#A97A00",
          700: "#8F6A00",
          800: "#6B4F00",
          900: "#4A3700",
        },
        // ---- Signature gold #F5B800 (fills, glows, icons on dark) ----
        gold: {
          DEFAULT: "#F5B800",
          50: "#FCF7E6",
          100: "#F9EDC0",
          200: "#F4DD85",
          300: "#F0CB45",
          400: "#F5B800",
          500: "#E0A600",
          600: "#D89B00",
          700: "#A97800",
          800: "#7D5A00",
        },
        // ---- Legacy alias: bvblue → brand black (button-blue becomes black) ----
        bvblue: {
          DEFAULT: "#0B0B0C",
          50: "#F4F4F5",
          100: "#E4E4E7",
          200: "#D4D4D8",
          300: "#A1A1AA",
          400: "#71717A",
          500: "#3F3F46",
          600: "#27272A",
          700: "#18181B",
          800: "#111113",
        },
        // ---- Heritage maroon #7A1717 — reserved for heritage/tradition accents ----
        maroon: {
          DEFAULT: "#7A1717",
          50: "#FBEFEF",
          100: "#F4D6D6",
          200: "#E7A9A9",
          300: "#D57676",
          400: "#A84040",
          500: "#7A1717",
          600: "#661212",
          700: "#520E0E",
          800: "#3E0A0A",
          900: "#2B0707",
        },
        ink: {
          DEFAULT: "#0B0B0C",
          soft: "#6B6B6B",
          muted: "#919191",
          faint: "#ABABAB",
        },
        surface: {
          DEFAULT: "#ffffff",
          grey: "#F8F6F0", // warm ivory — main content backgrounds
          light: "#FAF8F2", // soft ivory
          form: "#F4F1E8",
          border: "#E5E2D9", // thin editorial borders
        },
      },
      fontFamily: {
        // Display: Manrope · Body: Inter · Heritage serif: Fraunces
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "Fraunces", "Georgia", "serif"],
      },
      maxWidth: { container: "1200px" },
      boxShadow: {
        card: "0 1px 3px rgba(11,11,12,0.06), 0 8px 24px rgba(11,11,12,0.07)",
        lift: "0 12px 40px rgba(11,11,12,0.13)",
      },
    },
  },
  plugins: [],
};

export default config;