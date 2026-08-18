// Blog pipeline — approved topic in, published article out.
//
// Stage order and why:
//   outline → write → images → seo → quality → revise → re-quality → publish
//
// Images run before SEO because the hero URL belongs in the OG tags and the
// JSON-LD, and SEO runs before quality because the quality gate checks the
// excerpt that SEO finalised. The revise pass runs at most once: a second
// automatic rewrite of a rewrite drifts away from the outline, and at that
// point a human should look at it.
//
// Every stage records a BlogAgentRun. A stage that fails records the failure
// and, where the article can still stand without it (images, SEO enrichment),
// the pipeline continues. Writing and quality are the two stages whose failure
// is fatal.

import type {
  BlogAgentRun,
  BlogImage,
  BlogOutline,
  BlogPost,
  BlogQualityReport,
  BlogTopic,
} from "./domain";
import { countWords, istDate, newId, nowIso, readingMinutes } from "./domain";
import type { BlogStore } from "./store";
import { generateOutline, linkableRoutes } from "./agents/outline-agent";
import { writeArticle, reviseArticle, deriveExcerpt, stripInvalidLinks } from "./agents/writer-agent";
import { generateBlogImages, insertSectionImages } from "./agents/image-agent";
import { generateBlogSeo, uniqueSlug } from "./agents/seo-agent";
import { qualitySummary, revisionBrief, runBlogQuality, groundingSnapshot } from "./agents/quality-agent";
import { proposeTopics, adminTopic, TOPICS_PER_BATCH } from "./agents/topic-scout";
import { PREFERRED_INTERNAL_LINKS } from "./college-context";

export interface RunOptions {
  actor: string;
  /**
   * Publish automatically when the quality gate passes. The admin's approval of
   * the topic is the approval of the post; only a critical finding stops it.
   */
  autoPublish?: boolean;
}

// --------------------------------------------------------------------------
// Agent run bookkeeping
// --------------------------------------------------------------------------

async function record(
  store: BlogStore,
  anchor: { postId?: string; topicBatch?: string },
  agentName: string,
  status: BlogAgentRun["status"],
  summary: string,
  extra: { startedAt?: string; error?: string; model?: string } = {}
): Promise<void> {
  const startedAt = extra.startedAt ?? nowIso();
  const finishedAt = nowIso();
  await store.saveRun({
    id: newId("brun"),
    postId: anchor.postId ?? null,
    topicBatch: anchor.topicBatch ?? null,
    agentName,
    status,
    summary,
    model: extra.model ?? "",
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    error: extra.error ?? null,
  });
}

// --------------------------------------------------------------------------
// Topic batch
// --------------------------------------------------------------------------

export interface BatchResult {
  batch: string;
  topics: BlogTopic[];
  created: number;
  reused: boolean;
  notes: string[];
}

/**
 * Produce (or return) today's shortlist.
 *
 * Idempotent by design: the daily cron may fire more than once — a retry, a
 * manual trigger, two regions — and each extra run must not add ten more ideas
 * to a queue the admin is already looking at. Pass `force` for the studio's
 * explicit "generate new ideas" button.
 */
export async function ensureTopicBatch(
  store: BlogStore,
  opts: { actor: string; batch?: string; force?: boolean } = { actor: "blog-agent" }
): Promise<BatchResult> {
  const batch = opts.batch ?? istDate();
  const existing = await store.listTopics({ proposedOn: batch });

  if (existing.length >= TOPICS_PER_BATCH && !opts.force) {
    return { batch, topics: existing, created: 0, reused: true, notes: [] };
  }

  const startedAt = nowIso();
  const published = await store.listPosts({ status: ["PUBLISHED", "NEEDS_REVIEW", "UNPUBLISHED"], limit: 100 });

  try {
    const result = await proposeTopics({
      batch,
      publishedTitles: published.map((p) => p.title),
      existingBatchTitles: existing.map((t) => t.title),
      count: Math.max(1, TOPICS_PER_BATCH - (opts.force ? 0 : existing.length)),
    });

    await store.saveTopics(result.topics);
    await record(
      store,
      { topicBatch: batch },
      "Topic Scout",
      "success",
      `Proposed ${result.topics.length} ideas for ${batch} (${result.fromModel} from the model, ${result.fromSeeds} from the seed bank).`,
      { startedAt }
    );

    const all = await store.listTopics({ proposedOn: batch });
    return { batch, topics: all, created: result.topics.length, reused: false, notes: result.notes };
  } catch (e) {
    await record(store, { topicBatch: batch }, "Topic Scout", "failed", "Topic generation failed.", {
      startedAt,
      error: (e as Error).message,
    });
    throw e;
  }
}

/** Approve a proposed idea. Returns the updated topic. */
export async function decideTopic(
  store: BlogStore,
  topicId: string,
  decision: "approved" | "rejected",
  actor: string
): Promise<BlogTopic> {
  const topic = await store.getTopic(topicId);
  if (!topic) throw new Error(`Topic ${topicId} not found.`);
  if (topic.status === "used") throw new Error("That idea has already been written.");

  const updated: BlogTopic = { ...topic, status: decision, decidedBy: actor, decidedAt: nowIso() };
  await store.saveTopic(updated);
  return updated;
}

/** Create an approved topic from a title the admin typed in. */
export async function createAdminTopic(
  store: BlogStore,
  title: string,
  opts: { by: string; category?: BlogTopic["category"]; audience?: BlogTopic["audience"] }
): Promise<BlogTopic> {
  const trimmed = title.trim();
  if (trimmed.length < 10) throw new Error("Give the article a real title — at least 10 characters.");
  const topic = adminTopic(trimmed, opts);
  await store.saveTopic(topic);
  return topic;
}

// --------------------------------------------------------------------------
// Article generation
// --------------------------------------------------------------------------

export interface GenerationResult {
  post: BlogPost;
  images: BlogImage[];
  quality: BlogQualityReport;
  notes: string[];
}

/**
 * Write, illustrate, optimise, check and (usually) publish one article.
 *
 * The post row is created up front in GENERATING so the studio can show
 * progress, and so a crash mid-run leaves a visible failed post rather than
 * nothing at all.
 */
export async function generatePost(
  store: BlogStore,
  topicId: string,
  opts: RunOptions
): Promise<GenerationResult> {
  const topic = await store.getTopic(topicId);
  if (!topic) throw new Error(`Topic ${topicId} not found.`);
  if (topic.status === "rejected") throw new Error("That idea was rejected — approve it before generating.");

  const notes: string[] = [];
  const postId = newId("bpost");
  const slug = await uniqueSlug(topic.title, (s) => store.slugAvailable(s, postId));

  const post: BlogPost = {
    id: postId,
    slug,
    title: topic.title,
    excerpt: "",
    bodyMd: "",
    category: topic.category,
    tags: [topic.primaryKeyword, ...topic.secondaryKeywords].filter(Boolean).slice(0, 6),
    audience: topic.audience,
    readingMinutes: 0,
    wordCount: 0,
    status: "GENERATING",
    seo: {
      seoTitle: topic.title,
      metaDescription: "",
      slug,
      h1: topic.title,
      h2Structure: [],
      primaryKeyword: topic.primaryKeyword,
      secondaryKeywords: topic.secondaryKeywords,
      internalLinks: [],
      ogTitle: topic.title,
      ogDescription: "",
      ogImage: "",
      schemaJsonLd: {},
      repaired: [],
    },
    quality: null,
    grounding: groundingSnapshot(),
    topicId: topic.id,
    createdBy: opts.actor,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await store.savePost(post);
  await store.saveTopic({ ...topic, status: "used", postId, decidedBy: topic.decidedBy ?? opts.actor, decidedAt: topic.decidedAt ?? nowIso() });

  try {
    // ---- 1. Outline ------------------------------------------------------
    let started = nowIso();
    const outline: BlogOutline = await generateOutline(topic);
    await record(
      store,
      { postId },
      "Outline Agent",
      "success",
      outline.repaired.length
        ? `${outline.sections.length} sections, ~${outline.targetWords} words — model output was incomplete, fell back on: ${outline.repaired.join(", ")}.`
        : `${outline.sections.length} sections, ~${outline.targetWords} words.`,
      { startedAt: started }
    );

    // The link allowlist is resolved once, here, because it is needed three
    // times: to repair the draft, to repair the revision, and to score both.
    const routes = await linkableRoutes();
    const allowedLinks = [
      ...new Set([
        ...routes,
        ...PREFERRED_INTERNAL_LINKS.map((l) => l.href),
        ...outline.internalLinks.map((l) => l.href),
        "/",
      ]),
    ];

    // ---- 2. Write --------------------------------------------------------
    started = nowIso();
    const written = await writeArticle(topic, outline);
    notes.push(...written.notes);

    // Deterministic repair before anything else looks at the prose: an invented
    // route is not a judgement call, and leaving it for the revision pass costs
    // a model call to fix something a regex settles exactly.
    const linkFix = stripInvalidLinks(written.bodyMd, allowedLinks);
    if (linkFix.removed.length) {
      notes.push(`Removed ${linkFix.removed.length} invented internal link(s): ${linkFix.removed.join(", ")}.`);
    }

    await record(
      store,
      { postId },
      "Writing Agent",
      "success",
      `${written.wordCount} words${written.expanded ? " (after an expansion pass)" : ""}` +
        (linkFix.removed.length ? `; removed ${linkFix.removed.length} invalid internal link(s).` : "."),
      { startedAt: started }
    );

    written.bodyMd = linkFix.bodyMd;
    post.bodyMd = written.bodyMd;
    post.excerpt = written.excerpt;
    post.wordCount = written.wordCount;
    post.readingMinutes = readingMinutes(written.bodyMd);
    post.updatedAt = nowIso();
    await store.savePost(post);

    // ---- 3. Images -------------------------------------------------------
    started = nowIso();
    let images: BlogImage[] = [];
    try {
      const generated = await generateBlogImages(postId, slug, topic, outline);
      notes.push(...generated.notes);
      images = [generated.hero, ...generated.sections];
      await store.deleteImages(postId);
      for (const img of images) await store.saveImage(img);

      post.heroImageUrl = generated.hero.url;
      post.heroImageAlt = generated.hero.alt;
      post.bodyMd = insertSectionImages(post.bodyMd, outline, generated.sections);
      await store.savePost(post);

      const photoBacked = images.filter((i) => i.photoBacked).length;
      await record(
        store,
        { postId },
        "Image Agent",
        "success",
        `${images.length} image${images.length === 1 ? "" : "s"} composed with the college crest (${photoBacked} over real campus photographs).`,
        { startedAt: started }
      );
    } catch (e) {
      /*
       * Reached only when even the photo-less brand card could not be composed,
       * i.e. sharp itself is broken. The article still finishes writing — the
       * prose is the expensive part and throwing it away helps nobody — but the
       * quality gate's missing_hero_image check now fails it, so it stops in
       * NEEDS_REVIEW instead of publishing an imageless post.
       */
      notes.push(`Image generation failed: ${(e as Error).message}`);
      await record(
        store,
        { postId },
        "Image Agent",
        "failed",
        "Image generation failed, including the brand-card fallback — the article cannot auto-publish without a hero image.",
        { startedAt: started, error: (e as Error).message }
      );
    }

    // ---- 4. SEO ----------------------------------------------------------
    started = nowIso();
    const publishedAtGuess = nowIso();
    const seo = await generateBlogSeo({
      topic,
      outline,
      title: post.title,
      excerpt: post.excerpt || deriveExcerpt(post.bodyMd, topic.angle),
      bodyMd: post.bodyMd,
      slug,
      heroImageUrl: post.heroImageUrl,
      publishedAt: publishedAtGuess,
      wordCount: post.wordCount,
    });
    post.seo = seo;
    // The meta description is the better-written sentence of the two, so it
    // becomes the card excerpt as well — one edit, one place.
    post.excerpt = seo.metaDescription || post.excerpt;
    await store.savePost(post);
    await record(
      store,
      { postId },
      "SEO Agent",
      "success",
      seo.repaired.length
        ? `Metadata built — model output was incomplete, fell back on: ${seo.repaired.join(", ")}.`
        : `Metadata built for "${seo.seoTitle}".`,
      { startedAt: started }
    );

    // ---- 5. Quality gate -------------------------------------------------
    started = nowIso();
    let quality = runBlogQuality({
      topic,
      outline,
      bodyMd: post.bodyMd,
      title: post.title,
      excerpt: post.excerpt,
      allowedLinks,
      hasHeroImage: Boolean(post.heroImageUrl),
    });
    await record(store, { postId }, "Quality Gate", "success", qualitySummary(quality), { startedAt: started });

    // ---- 6. Revise, once -------------------------------------------------
    if (quality.verdict === "needs_review") {
      const brief = revisionBrief(quality);
      if (brief.length) {
        started = nowIso();
        try {
          const revised = await reviseArticle(topic, outline, post.bodyMd, brief);
          if (revised.changed) {
            // The rewrite can reintroduce an invented route, so the same
            // deterministic repair runs again over its output.
            const revisedFix = stripInvalidLinks(revised.bodyMd, allowedLinks);
            post.bodyMd = insertSectionImages(revisedFix.bodyMd, outline, images.filter((i) => i.placement === "section"));
            post.wordCount = countWords(post.bodyMd);
            post.readingMinutes = readingMinutes(post.bodyMd);
            await store.savePost(post);

            const rechecked = runBlogQuality({
              topic,
              outline,
              bodyMd: post.bodyMd,
              title: post.title,
              excerpt: post.excerpt,
              allowedLinks,
              hasHeroImage: Boolean(post.heroImageUrl),
            });
            rechecked.revisions = brief;
            quality = rechecked;
            await record(
              store,
              { postId },
              "Revision Agent",
              "success",
              `Addressed ${brief.length} finding${brief.length === 1 ? "" : "s"}; re-scored ${qualitySummary(rechecked)}`,
              { startedAt: started }
            );
          } else {
            await record(store, { postId }, "Revision Agent", "skipped", "The revision pass returned nothing usable; kept the original draft.", { startedAt: started });
          }
        } catch (e) {
          await record(store, { postId }, "Revision Agent", "failed", "Revision pass failed.", {
            startedAt: started,
            error: (e as Error).message,
          });
        }
      }
    }

    post.quality = quality;

    // ---- 7. Publish or hold ---------------------------------------------
    const autoPublish = opts.autoPublish !== false;
    if (quality.verdict === "pass" && autoPublish) {
      post.status = "PUBLISHED";
      post.publishedAt = nowIso();
      // Rebuild the schema against the real publish time, so datePublished in
      // the structured data matches what the page actually says.
      post.seo = {
        ...post.seo,
        schemaJsonLd: { ...post.seo.schemaJsonLd, datePublished: post.publishedAt, dateModified: post.publishedAt },
      };
      await record(store, { postId }, "Publisher", "success", `Published to /blog/${slug}.`);
    } else {
      post.status = "NEEDS_REVIEW";
      const reason =
        quality.verdict === "pass"
          ? "auto-publish is off for this run"
          : `${quality.issues.filter((i) => i.severity === "critical").length} critical finding(s)`;
      await record(store, { postId }, "Publisher", "skipped", `Held for review — ${reason}.`);
    }

    post.updatedAt = nowIso();
    await store.savePost(post);

    return { post, images, quality, notes };
  } catch (e) {
    const message = (e as Error).message;
    await record(store, { postId }, "Blog Pipeline", "failed", "Generation aborted.", { error: message });
    const failed = (await store.getPost(postId)) ?? post;
    // A post must never be left in GENERATING. Nothing polls it out of that
    // state, and FAILED is the only status the studio offers a retry from.
    await store.savePost({ ...failed, status: "FAILED", publishError: message, updatedAt: nowIso() });
    throw e;
  }
}

// --------------------------------------------------------------------------
// Publish state changes
// --------------------------------------------------------------------------

export async function publishPost(store: BlogStore, postId: string, actor: string): Promise<BlogPost> {
  const post = await store.getPost(postId);
  if (!post) throw new Error(`Post ${postId} not found.`);
  if (post.status === "GENERATING") throw new Error("The article is still being generated.");

  const updated: BlogPost = {
    ...post,
    status: "PUBLISHED",
    publishedAt: post.publishedAt ?? nowIso(),
    unpublishedAt: null,
    publishError: null,
    updatedAt: nowIso(),
  };
  updated.seo = {
    ...updated.seo,
    schemaJsonLd: { ...updated.seo.schemaJsonLd, datePublished: updated.publishedAt, dateModified: nowIso() },
  };
  await store.savePost(updated);
  await record(store, { postId }, "Publisher", "success", `Published by ${actor}.`);
  return updated;
}

export async function unpublishPost(store: BlogStore, postId: string, actor: string): Promise<BlogPost> {
  const post = await store.getPost(postId);
  if (!post) throw new Error(`Post ${postId} not found.`);
  const updated: BlogPost = { ...post, status: "UNPUBLISHED", unpublishedAt: nowIso(), updatedAt: nowIso() };
  await store.savePost(updated);
  await record(store, { postId }, "Publisher", "success", `Unpublished by ${actor}.`);
  return updated;
}

/** Apply an admin's manual edits, then re-run the gate over the result. */
export async function editPost(
  store: BlogStore,
  postId: string,
  patch: Partial<Pick<BlogPost, "title" | "excerpt" | "bodyMd" | "category" | "tags">>,
  actor: string
): Promise<BlogPost> {
  const post = await store.getPost(postId);
  if (!post) throw new Error(`Post ${postId} not found.`);

  const updated: BlogPost = {
    ...post,
    ...patch,
    updatedAt: nowIso(),
  };
  if (patch.bodyMd !== undefined) {
    updated.wordCount = countWords(patch.bodyMd);
    updated.readingMinutes = readingMinutes(patch.bodyMd);
  }
  // The slug is intentionally not editable here: it is the public URL, and
  // silently changing it breaks every link already shared.
  await store.savePost(updated);
  await record(store, { postId }, "Editor", "success", `Edited by ${actor} (${Object.keys(patch).join(", ")}).`);
  return updated;
}
