import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageBanner from "@/components/ui/PageBanner";
import BlogImage from "@/components/blog/BlogImage";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { activeCategories, formatPublished, listPublished, type PostCard } from "@/lib/blog/public";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Practical guides for engineering students and parents in Konaseema — study skills, placements, admissions and campus life, written by BVC Institute of Technology & Science.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: `Blog · ${site.shortName}`,
    description: "Study skills, placements, admissions and campus life — practical guides for students and parents.",
    type: "website",
  },
};

/**
 * Revalidated hourly rather than rendered per request. The publish and edit
 * routes call revalidatePath('/blog') directly, so a new article appears
 * immediately; this interval only covers the case where that call is missed.
 */
export const revalidate = 3600;

const AUDIENCE_LABEL: Record<PostCard["audience"], string> = {
  students: "For students",
  parents: "For parents",
  both: "Students & parents",
  recruiters: "For recruiters",
  faculty: "For faculty",
};

function FeatureCard({ post }: { post: PostCard }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group relative block overflow-hidden rounded-3xl border border-surface-border bg-gradient-to-br from-[#08142c] via-[#0f2142] to-[#2a0d18] shadow-card"
    >
      <div className="relative aspect-[21/9] w-full bg-navy overflow-hidden">
        <BlogImage
          src={post.heroImageUrl}
          alt={post.heroImageAlt ?? post.title}
          category={post.category}
          title={post.title}
          aspectRatio="21/9"
          priority
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#08142c]/90 via-[#08142c]/40 to-transparent pointer-events-none" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 pointer-events-none">
        <span className="inline-flex items-center gap-2 rounded-full bg-gold px-3.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-navy shadow-xs">
          {post.category}
        </span>
        <h2 className="mt-3 max-w-3xl font-display text-2xl font-extrabold leading-tight text-white md:text-4xl">
          {post.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">{post.excerpt}</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          {formatPublished(post.publishedAt)} · {post.readingMinutes} min read
        </p>
      </div>
    </Link>
  );
}

function ArticleCard({ post }: { post: PostCard }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-white transition hover:-translate-y-1 hover:border-gold hover:shadow-lift"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-subtle">
        <BlogImage
          src={post.heroImageUrl}
          alt={post.heroImageAlt ?? post.title}
          category={post.category}
          title={post.title}
          aspectRatio="16/9"
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-crimson">{post.category}</p>
        <h3 className="mt-2 font-display text-lg font-bold leading-snug text-navy group-hover:text-goldDark transition">
          {post.title}
        </h3>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-soft">{post.excerpt}</p>
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted border-t border-surface-border pt-3">
          <span className="rounded-md bg-surface-subtle px-2 py-0.5 font-medium text-navy">{AUDIENCE_LABEL[post.audience]}</span>
          <span aria-hidden>·</span>
          <span>{post.readingMinutes} min read</span>
        </p>
      </div>
    </Link>
  );
}

export default async function BlogIndexPage() {
  const posts = await listPublished(60);
  const categories = await activeCategories();
  const [featured, ...rest] = posts;

  return (
    <>
      <PageBanner
        title="BVCITS Blog"
        subtitle="Straight, practical guidance for students and parents — study skills, placements, admissions and life on campus."
        crumbs={[{ label: "Blog" }]}
        image="/assets/images/h2-scaled.jpg"
      />

      {posts.length === 0 ? (
        <section className="section bg-white">
          <div className="container-page max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-navy">The first articles are on their way</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              We are building a library of practical guides for students and parents across Konaseema. In the meantime,
              the {" "}
              <Link href="/students" className="font-medium text-crimson underline underline-offset-2">
                student portal
              </Link>{" "}
              and{" "}
              <Link href="/admissions" className="font-medium text-crimson underline underline-offset-2">
                admissions pages
              </Link>{" "}
              have everything you need.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="section bg-white pb-0">
            <div className="container-page">
              <Reveal>
                <FeatureCard post={featured} />
              </Reveal>
            </div>
          </section>

          {categories.length > 1 ? (
            <section className="bg-white pt-10">
              <div className="container-page flex flex-wrap gap-2">
                {categories.map((c) => (
                  <span
                    key={c.category}
                    className="rounded-full border border-surface-border bg-surface-grey px-3.5 py-1.5 text-xs font-medium text-navy"
                  >
                    {c.category}
                    <span className="ml-1.5 text-ink-muted">{c.count}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="section bg-white">
            <Stagger className="container-page grid gap-6 sm:grid-cols-2 lg:grid-cols-3" gap={0.07}>
              {rest.map((post) => (
                <StaggerItem key={post.slug} className="h-full">
                  <ArticleCard post={post} />
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </>
      )}
    </>
  );
}
