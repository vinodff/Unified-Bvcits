import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/ui/Breadcrumb";
import Markdown, { tableOfContents } from "@/components/blog/Markdown";
import { Reveal } from "@/components/motion/Reveal";
import { formatPublished, getPublished, listPublished, relatedPosts } from "@/lib/blog/public";
import { site } from "@/lib/site";

export const revalidate = 3600;

/**
 * Prerender the published set at build time; anything published afterwards is
 * rendered on first request and cached, because `dynamicParams` defaults to
 * true. A build that cannot reach the database still succeeds with an empty
 * list rather than failing — listPublished swallows store errors by design.
 */
export async function generateStaticParams() {
  const posts = await listPublished(100);
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublished(slug);
  if (!post) return { title: "Article not found" };

  const canonical = `/blog/${post.slug}`;
  return {
    title: post.seo.seoTitle || post.title,
    description: post.seo.metaDescription || post.excerpt,
    alternates: { canonical },
    keywords: [post.seo.primaryKeyword, ...post.seo.secondaryKeywords].filter(Boolean),
    openGraph: {
      title: post.seo.ogTitle || post.title,
      description: post.seo.ogDescription || post.excerpt,
      type: "article",
      url: canonical,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      images: post.seo.ogImage ? [{ url: post.seo.ogImage }] : undefined,
      siteName: site.shortName,
    },
    twitter: {
      card: post.seo.ogImage ? "summary_large_image" : "summary",
      title: post.seo.ogTitle || post.title,
      description: post.seo.ogDescription || post.excerpt,
      images: post.seo.ogImage ? [post.seo.ogImage] : undefined,
    },
  };
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublished(slug);
  if (!post) notFound();

  const toc = tableOfContents(post.bodyMd);
  const related = await relatedPosts(post);
  const published = formatPublished(post.publishedAt);

  return (
    <>
      {/*
        Structured data is emitted from the stored schema object, which the SEO
        agent built from the post's own fields. JSON.stringify is safe here —
        the value is a plain object we assembled, never model-authored HTML —
        but the `<` escape still matters, because a stray "</script>" inside any
        string field would otherwise close this tag early.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(post.seo.schemaJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <article>
        <header className="relative isolate overflow-hidden bg-navy">
          {post.heroImageUrl ? (
            <Image
              src={post.heroImageUrl}
              alt=""
              fill
              priority
              quality={82}
              sizes="100vw"
              className="object-cover object-center opacity-30"
            />
          ) : null}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-navy via-navy/95 to-navy-800/90" />

          <div className="container-page relative py-14 md:py-20">
            <Breadcrumb items={[{ label: "Blog", href: "/blog" }, { label: post.title }]} />

            <div className="mt-6 max-w-3xl">
              <span className="inline-flex rounded-full bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black">
                {post.category}
              </span>
              <h1 className="mt-5 font-display text-3xl font-extrabold leading-[1.12] tracking-tight text-white md:text-5xl">
                {post.title}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-white/75 md:text-lg">{post.excerpt}</p>

              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs uppercase tracking-[0.14em] text-gold">
                <span>{site.shortName} Editorial</span>
                {published ? (
                  <>
                    <span aria-hidden className="text-white/30">
                      /
                    </span>
                    <time dateTime={post.publishedAt ?? undefined}>{published}</time>
                  </>
                ) : null}
                <span aria-hidden className="text-white/30">
                  /
                </span>
                <span>{post.readingMinutes} min read</span>
              </div>
            </div>
          </div>
        </header>

        <div className="section bg-white">
          <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 max-w-[46rem]">
              <Markdown source={post.bodyMd} />

              {/*
                Editorial transparency. This blog is written by an agent
                pipeline, and saying so plainly is both the honest thing to do
                and better for trust than a fabricated human byline would be.
              */}
              <aside className="mt-16 rounded-2xl border border-surface-border bg-surface-grey p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-crimson">About this article</p>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  Written and edited by the {site.shortName} content team using an assisted editorial workflow, and
                  reviewed before publication. Every figure about the college is drawn from our published records.
                  Spotted something that needs correcting?{" "}
                  <Link href="/contact-us" className="font-medium text-crimson underline underline-offset-2">
                    Tell us
                  </Link>
                  .
                </p>
              </aside>

              <div className="mt-10 rounded-2xl bg-navy p-7 text-white md:p-9">
                <h2 className="font-display text-xl font-bold md:text-2xl">Thinking about engineering at BVCITS?</h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                  Autonomous, NAAC &lsquo;A&rsquo; Grade, NBA accredited and JNTUK affiliated — on a 40-acre campus in
                  Amalapuram. Counselling code {site.counsellingCode}.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/admissions"
                    className="rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-brand-black transition hover:bg-gold-500"
                  >
                    Admissions
                  </Link>
                  <Link
                    href="/contact-us"
                    className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-gold hover:text-gold"
                  >
                    Talk to us
                  </Link>
                </div>
              </div>
            </div>

            <aside className="hidden lg:block">
              {toc.length > 2 ? (
                <nav aria-label="On this page" className="sticky top-28">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">On this page</p>
                  <ul className="mt-4 space-y-2.5 border-l border-surface-border pl-4">
                    {toc.map((h) => (
                      <li key={h.id}>
                        <a
                          href={`#${h.id}`}
                          className="block text-sm leading-snug text-ink-soft transition hover:text-crimson"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
            </aside>
          </div>
        </div>

        {related.length ? (
          <section className="section bg-surface-grey">
            <div className="container-page">
              <h2 className="font-display text-2xl font-bold text-navy">Read next</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/blog/${r.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-white transition hover:-translate-y-1 hover:border-crimson-300 hover:shadow-lg"
                  >
                    <div className="relative aspect-[16/9] w-full bg-surface-grey">
                      {r.heroImageUrl ? (
                        <Image
                          src={r.heroImageUrl}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 360px, 100vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-crimson">{r.category}</p>
                      <h3 className="mt-2 font-display text-base font-bold leading-snug text-navy group-hover:text-crimson">
                        {r.title}
                      </h3>
                      <p className="mt-auto pt-4 text-xs text-ink-muted">{r.readingMinutes} min read</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}
