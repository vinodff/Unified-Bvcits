/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next dev` and `next build` both write to distDir. Running a production
  // build while a dev server is up makes them fight over the same files, and
  // the build dies somewhere different every run — a missing chunk, a failed
  // rename of .next/export/500.html, a bogus TypeError during prerender.
  // Set NEXT_DIST_DIR to build into a separate directory instead of stopping
  // the dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  eslint: {
    // The clone ships without an ESLint setup; type-checking still runs.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "bvcits.edu.in" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // Blog hero/section graphics live in the public `blog-media` Supabase
      // Storage bucket (see src/lib/marketing/blog/agents/image-agent.ts).
      // Scoped to the storage path so the wildcard host cannot be used to
      // proxy arbitrary files from any Supabase project.
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  // `ws` must not be bundled. Webpack's minifier renames its internal `mask`/`unmask`
  // helpers and the frame masker then throws "t.mask is not a function" at runtime — which
  // surfaced as every Edge TTS call timing out and falling back to the lower-quality
  // Google voice, plus an uncaughtException in the server log.
  serverExternalPackages: ["xlsx", "ws"],
};

export default nextConfig;
