// Blog SEO Agent — metadata, slug and JSON-LD for one article.
//
// Deliberately deterministic-first: the defaults below are built from the topic
// and the finished prose, and the model is only allowed to *improve* the title
// and description. Letting a model own the slug or the schema means a URL that
// changes between runs and a schema block asserting things the article does not
// say, and both are worse than a slightly duller meta description.

import { getLlm } from "../../providers/llm";
import { coerceShape, asString, asStringList } from "../../providers/llm-json";
import { parseLlmJson } from "../../providers/llm-json";
import { DEFAULT_BRAND } from "../../brand";
import type { BlogOutline, BlogSeo, BlogTopic } from "../domain";
import { slugify } from "../domain";
import { site } from "@/lib/site";

/** Google truncates around here; longer is not penalised, just unread. */
const TITLE_MAX = 60;
const DESC_MAX = 158;

function clamp(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** H2 headings as they ended up in the finished article, not as planned. */
export function actualHeadings(bodyMd: string): string[] {
  return (bodyMd.match(/^##\s+(.+)$/gm) ?? []).map((h) => h.replace(/^##\s+/, "").trim());
}

export interface BlogSeoInput {
  topic: BlogTopic;
  outline: BlogOutline;
  title: string;
  excerpt: string;
  bodyMd: string;
  slug: string;
  heroImageUrl?: string | null;
  publishedAt: string;
  wordCount: number;
}

/**
 * The Article JSON-LD block.
 *
 * `author` is the institution, not a person: no human wrote this, and
 * attributing it to a named staff member would be exactly the kind of
 * fabricated attribution this project has already had to correct once.
 * `publisher` carries the real organisation identity.
 */
export function buildSchema(input: BlogSeoInput, canonical: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: clamp(input.title, 110),
    description: clamp(input.excerpt, DESC_MAX),
    image: input.heroImageUrl ? [input.heroImageUrl] : undefined,
    datePublished: input.publishedAt,
    dateModified: input.publishedAt,
    wordCount: input.wordCount,
    inLanguage: "en-IN",
    author: {
      "@type": "Organization",
      name: DEFAULT_BRAND.collegeName,
      url: site.liveUrl,
    },
    publisher: {
      "@type": "CollegeOrUniversity",
      name: DEFAULT_BRAND.collegeName,
      alternateName: DEFAULT_BRAND.shortName,
      url: site.liveUrl,
      logo: { "@type": "ImageObject", url: `${site.liveUrl}${DEFAULT_BRAND.logoPath}` },
      address: {
        "@type": "PostalAddress",
        addressLocality: "Amalapuram",
        addressRegion: "Andhra Pradesh",
        addressCountry: "IN",
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    articleSection: input.topic.category,
    keywords: [input.topic.primaryKeyword, ...input.topic.secondaryKeywords].filter(Boolean).join(", "),
  };
}

function defaults(input: BlogSeoInput, canonical: string): BlogSeo {
  const headings = actualHeadings(input.bodyMd);
  const seoTitle = clamp(
    input.title.length <= TITLE_MAX ? `${input.title} | ${DEFAULT_BRAND.shortName}` : input.title,
    TITLE_MAX + 12
  );
  const metaDescription = clamp(input.excerpt, DESC_MAX);

  return {
    seoTitle,
    metaDescription,
    slug: input.slug,
    h1: input.title,
    h2Structure: headings,
    primaryKeyword: input.topic.primaryKeyword,
    secondaryKeywords: input.topic.secondaryKeywords,
    internalLinks: input.outline.internalLinks,
    ogTitle: input.title,
    ogDescription: metaDescription,
    ogImage: input.heroImageUrl ?? "",
    schemaJsonLd: buildSchema(input, canonical),
    repaired: [],
  };
}

const SEO_INSTRUCTION = [
  "Improve the search title and meta description for one article on a college blog.",
  "",
  "RULES:",
  `1. seoTitle ≤ ${TITLE_MAX} characters. Lead with what the reader gets, not the college name.`,
  `2. metaDescription ≤ ${DESC_MAX} characters, one or two sentences, written to be clicked — a specific promise, not a summary of the summary.`,
  "3. Include the primary keyword naturally in both. Never repeat it twice in the same field.",
  "4. No clickbait, no 'you won't believe', no exclamation marks.",
  "5. Never claim a ranking, a guarantee, or a statistic that is not in context.excerpt.",
  "",
  'Return JSON: {"seoTitle":"…","metaDescription":"…","secondaryKeywords":["…"]}',
].join("\n");

export async function generateBlogSeo(input: BlogSeoInput): Promise<BlogSeo> {
  const canonical = `${site.liveUrl}/blog/${input.slug}`;
  const base = defaults(input, canonical);

  let parsed: Record<string, unknown> | null = null;
  try {
    const llm = getLlm("seo");
    const res = await llm.complete({
      kind: "seo",
      instruction: SEO_INSTRUCTION,
      context: {
        title: input.title,
        excerpt: input.excerpt,
        primaryKeyword: input.topic.primaryKeyword,
        secondaryKeywords: input.topic.secondaryKeywords,
        headings: base.h2Structure,
        audience: input.topic.audience,
      },
      jsonSchemaHint: true,
      temperature: 0.5,
    });
    parsed = parseLlmJson(res.text);
  } catch {
    // The deterministic defaults are a complete, valid answer — a failed
    // enrichment call is not worth failing the pipeline over.
  }

  if (!parsed) return { ...base, repaired: ["seoTitle", "metaDescription"] };

  const { value, repaired } = coerceShape(
    parsed,
    {
      seoTitle: base.seoTitle,
      metaDescription: base.metaDescription,
      secondaryKeywords: base.secondaryKeywords,
    },
    {
      seoTitle: { aliases: ["seo_title", "metaTitle", "pageTitle"], read: (v) => {
        const s = asString(v);
        return s ? clamp(s, TITLE_MAX + 12) : undefined;
      } },
      metaDescription: { aliases: ["meta_description", "description", "metaDesc"], read: (v) => {
        const s = asString(v);
        // A description shorter than a tweet is a failure to answer, not a
        // concise answer — fall back rather than ship it.
        return s && s.length >= 70 ? clamp(s, DESC_MAX) : undefined;
      } },
      secondaryKeywords: { aliases: ["secondary_keywords", "keywords", "relatedKeywords"], read: (v) => {
        const list = asStringList(v);
        return list ? list.slice(0, 8) : undefined;
      } },
    }
  );

  const merged: BlogSeo = {
    ...base,
    seoTitle: value.seoTitle,
    metaDescription: value.metaDescription,
    secondaryKeywords: value.secondaryKeywords,
    ogTitle: input.title,
    ogDescription: value.metaDescription,
    repaired,
  };
  // Schema is rebuilt from the merged description so the structured data and
  // the meta tag can never disagree.
  merged.schemaJsonLd = buildSchema({ ...input, excerpt: value.metaDescription }, canonical);
  return merged;
}

/** Unique slug: append -2, -3 … only when the base is genuinely taken. */
export async function uniqueSlug(
  title: string,
  isAvailable: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugify(title) || "bvcits-post";
  if (await isAvailable(base)) return base;
  for (let n = 2; n <= 20; n++) {
    const candidate = `${base}-${n}`.slice(0, 80).replace(/-$/, "");
    if (await isAvailable(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 80);
}
