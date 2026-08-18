"use client";

// Platform-accurate previews.
//
// A reviewer approving a post needs to see what the audience will see, not a
// monospace dump of the raw body. Judgements like "this caption is too long",
// "the hook is buried below the fold", "the hashtags look spammy" are invisible
// in plain text and obvious inside the real chrome.
//
// So each platform gets its own light-themed replica — Instagram, Facebook,
// LinkedIn, WhatsApp — and the website version renders as an actual article with
// real typography rather than markdown source.
//
// Note on safety: post bodies come from a language model, so nothing here uses
// dangerouslySetInnerHTML. Markdown is parsed into React elements, which makes
// injection impossible by construction rather than by sanitising after the fact.

import { type ReactNode } from "react";
import { isSafeHref } from "./preview-utils";

const LOGO = "/assets/logos/cropped-logo.png";
const PAGE_NAME = "BVC Institute of Technology & Science";
const HANDLE = "bvcits_official";

/** Platforms that have a visual replica. Anything else falls back to plain text. */
export type PreviewPlatform = "instagram" | "facebook" | "linkedin" | "whatsapp" | "website";

export interface PreviewProps {
  platform: string;
  body: string;
  title?: string | null;
  /** Creative or source photograph to show in the post. */
  imageUrl?: string | null;
}

// --- shared helpers ---------------------------------------------------------

/**
 * Split a caption so hashtags and @mentions can be tinted the way the real
 * clients tint them. Returns plain text nodes plus highlighted spans.
 */
function withTags(text: string, tagClass: string): ReactNode[] {
  return text.split(/(\s)/).map((chunk, i) =>
    /^[#@][\w.]+$/.test(chunk) ? (
      <span key={i} className={tagClass}>{chunk}</span>
    ) : (
      <span key={i}>{chunk}</span>
    )
  );
}

/** Render body text preserving the author's paragraph breaks. */
function Paragraphs({ text, tagClass }: { text: string; tagClass: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className={i > 0 ? "mt-3" : undefined}>
          {para.split("\n").map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {withTags(line, tagClass)}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function Avatar({ size = 40 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full border border-black/10 bg-white object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function PostImage({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`w-full object-cover ${className}`} />;
}

// --- Instagram --------------------------------------------------------------

function InstagramPost({ body, imageUrl }: PreviewProps) {
  const likes = 248;
  return (
    <div className="mx-auto w-full max-w-[420px] border border-[#dbdbdb] bg-white font-sans text-[#262626]">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] p-[2px]">
          <div className="rounded-full bg-white p-[2px]"><Avatar size={30} /></div>
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">{HANDLE}</p>
          <p className="truncate text-[11px] text-[#737373]">Amalapuram, Andhra Pradesh</p>
        </div>
        <span className="text-lg leading-none text-[#262626]">⋯</span>
      </div>

      {imageUrl ? (
        <PostImage src={imageUrl} alt="Post image" className="aspect-square" />
      ) : (
        <div className="flex aspect-square items-center justify-center bg-[#fafafa] text-[13px] text-[#8e8e8e]">
          No image — the creative agent composes one from your photos
        </div>
      )}

      <div className="px-3 pt-2.5">
        <div className="flex items-center gap-4 text-[22px] leading-none">
          <span>♡</span><span>💬</span><span>➤</span>
          <span className="ml-auto">🔖</span>
        </div>
        <p className="mt-2 text-[13px] font-semibold">{likes.toLocaleString("en-IN")} likes</p>
        <div className="mt-1 whitespace-pre-wrap text-[13px] leading-[18px]">
          <span className="font-semibold">{HANDLE}</span>{" "}
          <Paragraphs text={body} tagClass="text-[#00376b]" />
        </div>
        <p className="mt-1.5 text-[13px] text-[#8e8e8e]">View all 34 comments</p>
        <p className="mb-3 mt-1 text-[10px] uppercase tracking-wide text-[#8e8e8e]">2 hours ago</p>
      </div>
    </div>
  );
}

// --- Facebook ---------------------------------------------------------------

function FacebookPost({ body, imageUrl }: PreviewProps) {
  return (
    <div className="mx-auto w-full max-w-[500px] rounded-lg bg-white font-sans text-[#050505] shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar size={40} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold hover:underline">{PAGE_NAME}</p>
          <p className="text-[13px] text-[#65676b]">2 h · 🌐</p>
        </div>
        <span className="text-xl leading-none text-[#65676b]">⋯</span>
      </div>

      <div className="whitespace-pre-wrap px-3 pb-3 text-[15px] leading-[20px]">
        <Paragraphs text={body} tagClass="text-[#1877f2]" />
      </div>

      <PostImage src={imageUrl} alt="Post image" className="max-h-[500px]" />

      <div className="flex items-center justify-between px-3 py-2.5 text-[15px] text-[#65676b]">
        <span className="flex items-center gap-1">
          <span className="inline-flex">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#1877f2] text-[10px] text-white">👍</span>
            <span className="-ml-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#f33e58] text-[10px] text-white">❤</span>
          </span>
          <span className="ml-1">312</span>
        </span>
        <span>28 comments · 14 shares</span>
      </div>

      <div className="mx-3 grid grid-cols-3 border-t border-[#ced0d4] py-1 text-[15px] font-semibold text-[#65676b]">
        {["👍 Like", "💬 Comment", "↪ Share"].map((l) => (
          <span key={l} className="rounded py-1.5 text-center hover:bg-[#f2f2f2]">{l}</span>
        ))}
      </div>
    </div>
  );
}

// --- LinkedIn ---------------------------------------------------------------

function LinkedInPost({ body, imageUrl }: PreviewProps) {
  return (
    <div className="mx-auto w-full max-w-[540px] rounded-lg border border-[#e0dfdc] bg-white font-sans text-[rgba(0,0,0,0.9)]">
      <div className="flex items-start gap-2 p-3">
        <Avatar size={48} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-semibold hover:text-[#0a66c2] hover:underline">{PAGE_NAME}</p>
          <p className="truncate text-[12px] text-[rgba(0,0,0,0.6)]">
            Autonomous · NAAC &apos;A&apos; Grade · Amalapuram
          </p>
          <p className="text-[12px] text-[rgba(0,0,0,0.6)]">2h · 🌐</p>
        </div>
        <span className="whitespace-nowrap text-[14px] font-semibold text-[#0a66c2]">+ Follow</span>
      </div>

      <div className="whitespace-pre-wrap px-3 pb-2 text-[14px] leading-[20px]">
        <Paragraphs text={body} tagClass="font-semibold text-[#0a66c2]" />
      </div>

      <PostImage src={imageUrl} alt="Post image" className="max-h-[500px]" />

      <div className="flex items-center justify-between px-3 py-2 text-[12px] text-[rgba(0,0,0,0.6)]">
        <span className="flex items-center gap-1">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-[#0a66c2] text-[9px] text-white">👍</span>
          <span className="grid h-4 w-4 place-items-center rounded-full bg-[#6dae4f] text-[9px] text-white">💡</span>
          <span className="ml-1">186</span>
        </span>
        <span>23 comments · 9 reposts</span>
      </div>

      <div className="mx-3 grid grid-cols-4 border-t border-[#e0dfdc] py-1 text-[14px] font-semibold text-[rgba(0,0,0,0.6)]">
        {["👍 Like", "💬 Comment", "🔁 Repost", "➤ Send"].map((l) => (
          <span key={l} className="rounded py-2 text-center hover:bg-[#f3f2ef]">{l}</span>
        ))}
      </div>
    </div>
  );
}

// --- WhatsApp ---------------------------------------------------------------

function WhatsAppPost({ body }: PreviewProps) {
  return (
    <div className="mx-auto w-full max-w-[420px] rounded-lg bg-[#efeae2] p-4 font-sans">
      <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
        <div className="whitespace-pre-wrap text-[14.2px] leading-[19px] text-[#111b21]">
          <Paragraphs text={body} tagClass="text-[#027eb5] underline" />
        </div>
        <p className="mt-1 text-right text-[11px] text-[#667781]">
          18:00 <span className="text-[#53bdeb]">✓✓</span>
        </p>
      </div>
    </div>
  );
}

// --- Website / blog article -------------------------------------------------

/**
 * Minimal markdown renderer for the article body.
 *
 * Deliberately hand-rolled and element-based: the project has no markdown
 * dependency, the writing agent emits a small predictable subset, and returning
 * React elements means model output can never inject markup.
 */
function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split("\n");
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-4 list-disc space-y-1.5 pl-6 text-[17px] leading-[1.7] text-[#2b2b2b]">
        {list.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </ul>
    );
    list = [];
  };

  /** Bold, italics and links, resolved into elements. */
  const inline = (text: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) parts.push(<strong key={m.index} className="font-semibold text-black">{tok.slice(2, -2)}</strong>);
      else if (tok.startsWith("[")) {
        const link = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
        const href = link?.[2] ?? "";
        parts.push(
          isSafeHref(href)
            ? <a key={m.index} href={href} className="text-[#8a1538] underline underline-offset-2 hover:text-[#b01c46]">{link?.[1]}</a>
            : <span key={m.index}>{link?.[1]}</span>
        );
      } else parts.push(<em key={m.index} className="italic">{tok.slice(1, -1)}</em>);
      last = m.index + tok.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*+]\s+/.test(line)) { list.push(line.replace(/^\s*[-*+]\s+/, "")); continue; }
    flushList();
    if (!line.trim()) continue;

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2]);
      const cls = {
        1: "mt-0 mb-4 font-display text-[40px] font-extrabold leading-[1.15] tracking-[-0.02em] text-black",
        2: "mb-3 mt-9 font-display text-[27px] font-bold leading-tight tracking-[-0.01em] text-black",
        3: "mb-2 mt-7 font-display text-[21px] font-bold text-black",
        4: "mb-2 mt-5 text-[18px] font-semibold text-black",
      }[level as 1 | 2 | 3 | 4];
      blocks.push(level === 1 ? <h1 key={blocks.length} className={cls}>{text}</h1>
        : level === 2 ? <h2 key={blocks.length} className={cls}>{text}</h2>
        : level === 3 ? <h3 key={blocks.length} className={cls}>{text}</h3>
        : <h4 key={blocks.length} className={cls}>{text}</h4>);
      continue;
    }
    blocks.push(<p key={blocks.length} className="my-4 text-[17px] leading-[1.75] text-[#2b2b2b]">{inline(line)}</p>);
  }
  flushList();
  return <>{blocks}</>;
}

function WebsiteArticle({ body, title, imageUrl }: PreviewProps) {
  // The agent usually opens the body with its own H1; drop the separate title
  // in that case so the article does not show the headline twice.
  const hasOwnH1 = /^\s*#\s+/.test(body);
  const readMinutes = Math.max(1, Math.round(body.split(/\s+/).length / 200));

  return (
    <div className="mx-auto w-full max-w-[720px] bg-white font-sans">
      {/* site chrome, so it reads as a page on bvcits.edu.in rather than a card */}
      <div className="flex items-center gap-2 border-b border-black/10 px-6 py-3">
        <Avatar size={28} />
        <span className="font-display text-[13px] font-bold tracking-tight text-black">BVCITS</span>
        <span className="ml-auto text-[12px] text-black/40">bvcits.edu.in</span>
      </div>

      <article className="px-6 py-8 sm:px-10">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a1538]">Campus News</p>
        {!hasOwnH1 && title && (
          <h1 className="mb-4 font-display text-[40px] font-extrabold leading-[1.15] tracking-[-0.02em] text-black">{title}</h1>
        )}
        <div className="mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-black/10 pb-5 text-[13px] text-black/50">
          <Avatar size={26} />
          <span className="font-medium text-black/70">BVCITS Newsroom</span>
          <span>·</span>
          <span>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
          <span>·</span>
          <span>{readMinutes} min read</span>
        </div>

        {imageUrl && (
          <figure className="mb-7">
            <PostImage src={imageUrl} alt={title ?? "Article image"} className="max-h-[400px] rounded-lg" />
            <figcaption className="mt-2 text-[12px] text-black/45">Photograph from the event · BVCITS</figcaption>
          </figure>
        )}

        <Markdown source={body} />

        <div className="mt-10 rounded-xl bg-[#faf7f2] p-5">
          <p className="font-display text-[15px] font-bold text-black">Admissions Open 2026–27</p>
          <p className="mt-1 text-[13px] leading-relaxed text-black/60">
            Counselling Code <strong className="text-[#8a1538]">BVTS</strong> · Autonomous · NAAC &apos;A&apos; Grade · Amalapuram
          </p>
        </div>
      </article>
    </div>
  );
}

// --- entry point ------------------------------------------------------------

/** Renders the post inside its platform's real chrome. */
export function PlatformPreview(props: PreviewProps) {
  switch (props.platform) {
    case "instagram": return <InstagramPost {...props} />;
    case "facebook": return <FacebookPost {...props} />;
    case "linkedin": return <LinkedInPost {...props} />;
    case "whatsapp": return <WhatsAppPost {...props} />;
    case "website": return <WebsiteArticle {...props} />;
    default:
      return (
        <div className="mx-auto max-w-[500px] whitespace-pre-wrap rounded-lg bg-white p-5 font-sans text-[15px] leading-relaxed text-black">
          {props.body}
        </div>
      );
  }
}

/** The surface a preview sits on — platform apps are light, the Studio is not. */
export function PreviewStage({ platform, children }: { platform: string; children: ReactNode }) {
  const stage =
    platform === "instagram" ? "bg-[#fafafa]"
    : platform === "facebook" ? "bg-[#f0f2f5]"
    : platform === "linkedin" ? "bg-[#f4f2ee]"
    : platform === "whatsapp" ? "bg-[#d1d7db]"
    : "bg-[#e9e9ea]";
  return <div className={`overflow-x-auto rounded-xl p-4 sm:p-6 ${stage}`}>{children}</div>;
}
