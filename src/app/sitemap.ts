import type { MetadataRoute } from "next";
import { departmentList } from "@/data/departments";
import { portals } from "@/data/portals";
import { listPublished } from "@/lib/blog/public";
import { site } from "@/lib/site";

/**
 * XML sitemap.
 *
 * Added alongside the blog: publishing articles that search engines have to
 * discover by crawling links is a slow route to the visibility this content is
 * for. Blog posts carry their real publication date so freshness is visible;
 * the static institutional pages do not claim a lastModified they cannot
 * substantiate.
 */
export const revalidate = 3600;

const STATIC_ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/about-us", priority: 0.8 },
  { path: "/admissions", priority: 0.9 },
  { path: "/departments", priority: 0.9 },
  { path: "/placements-cell", priority: 0.9 },
  { path: "/experience", priority: 0.7 },
  { path: "/contact-us", priority: 0.7 },
  { path: "/blog", priority: 0.9 },
  { path: "/others", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.liveUrl.replace(/\/$/, "");

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    changeFrequency: r.path === "/blog" ? "daily" : "monthly",
    priority: r.priority,
  }));

  for (const portal of portals) {
    entries.push({ url: `${base}/${portal.slug}`, changeFrequency: "monthly", priority: 0.7 });
  }

  for (const dept of departmentList) {
    entries.push({ url: `${base}/departments/${dept.slug}`, changeFrequency: "monthly", priority: 0.8 });
  }

  for (const post of await listPublished(500)) {
    entries.push({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : undefined,
      changeFrequency: "yearly",
      priority: 0.7,
    });
  }

  return entries;
}
