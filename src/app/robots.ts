import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * The disallow list is the point of this file. /admin, /dashboard and the
 * portals sit behind auth, but an indexed login URL still leaks the shape of
 * the private surface and wastes crawl budget that should be going to the blog.
 */
export default function robots(): MetadataRoute.Robots {
  const base = site.liveUrl.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/dashboard/", "/placement-portal/", "/login", "/signup"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
