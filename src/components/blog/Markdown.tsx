// Markdown renderer for blog articles.
//
// Renders to React elements directly. There is no HTML string anywhere in this
// file and no dangerouslySetInnerHTML, which means model-authored prose cannot
// inject markup no matter what it emits — the writer agent also strips tags,
// but that is a normalisation step, not a security boundary. This is the
// boundary.
//
// Deliberately not react-markdown: the supported syntax is exactly what the
// writer agent is instructed to produce, and a 200-line renderer we control
// beats a dependency plus a sanitiser configuration to keep correct.

import Link from "next/link";
import type { ReactNode } from "react";
import BlogImage from "./BlogImage";

/** Only these protocols may appear in a link the model wrote. */
function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

// --- inline ----------------------------------------------------------------

const INLINE_RE = /(!\[[^\]]*\]\([^)]*\))|(\[[^\]]+\]\([^)]*\))|(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_RE.source, "g");

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith("![")) {
      // Inline images are handled at block level; a stray one renders as its
      // alt text rather than an empty gap.
      const alt = token.slice(2, token.indexOf("]"));
      out.push(<span key={key} className="text-ink-muted">{alt}</span>);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]("));
      const href = safeHref(token.slice(token.indexOf("](") + 2, token.length - 1));
      out.push(
        href ? (
          href.startsWith("/") || href.startsWith("#") ? (
            <Link key={key} href={href} className="font-medium text-crimson underline decoration-crimson/30 underline-offset-2 hover:decoration-crimson">
              {label}
            </Link>
          ) : (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-crimson underline decoration-crimson/30 underline-offset-2 hover:decoration-crimson"
            >
              {label}
            </a>
          )
        ) : (
          <span key={key}>{label}</span>
        )
      );
    } else if (token.startsWith("**")) {
      out.push(<strong key={key} className="font-semibold text-navy">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key} className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[0.9em] text-navy">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// --- blocks ----------------------------------------------------------------

type Block =
  | { kind: "heading"; level: 2 | 3 | 4; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "image"; alt: string; src: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "code"; text: string }
  | { kind: "hr" };

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    const text = buffer.join(" ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
  };

  let paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(paragraph);
      paragraph = [];
      i++;
      continue;
    }

    // fenced code
    if (trimmed.startsWith("```")) {
      flushParagraph(paragraph);
      paragraph = [];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(paragraph);
      paragraph = [];
      const text = heading[2].replace(/\s*#+\s*$/, "").trim();
      blocks.push({ kind: "heading", level: heading[1].length as 2 | 3 | 4, text, id: headingId(text) });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(paragraph);
      paragraph = [];
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/);
    if (image) {
      flushParagraph(paragraph);
      paragraph = [];
      const src = safeHref(image[2]);
      if (src) blocks.push({ kind: "image", alt: image[1], src });
      i++;
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      flushParagraph(paragraph);
      paragraph = [];
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const isItem = ordered ? /^\d+[.)]\s+/.test(t) : /^[-*+]\s+/.test(t);
        if (!isItem) {
          // A wrapped continuation line belongs to the previous bullet.
          if (t && items.length && !/^(#{2,4}\s|>|\||```)/.test(t)) {
            items[items.length - 1] += ` ${t}`;
            i++;
            continue;
          }
          break;
        }
        items.push(t.replace(/^([-*+]|\d+[.)])\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph(paragraph);
      paragraph = [];
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: quoted });
      continue;
    }

    // table: a header row followed by a separator row
    if (trimmed.startsWith("|") && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flushParagraph(paragraph);
      paragraph = [];
      const header = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }
  flushParagraph(paragraph);
  return blocks;
}

/** Headings, for the article's table of contents. */
export function tableOfContents(md: string): { text: string; id: string }[] {
  return parseBlocks(md)
    .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading" && b.level === 2)
    .map((b) => ({ text: b.text, id: b.id }));
}

export default function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);

  return (
    <div className="blog-prose">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case "heading": {
            const cls =
              block.level === 2
                ? "mt-14 scroll-mt-28 font-display text-2xl font-bold tracking-tight text-navy md:text-3xl"
                : block.level === 3
                  ? "mt-10 scroll-mt-28 font-display text-xl font-bold text-navy"
                  : "mt-8 scroll-mt-28 font-display text-lg font-semibold text-navy";
            const Tag = block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
            return (
              <Tag key={key} id={block.id} className={cls}>
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={key} className="mt-5 text-[1.0625rem] leading-[1.8] text-ink">
                {renderInline(block.text, key)}
              </p>
            );
          case "list":
            return block.ordered ? (
              <ol key={key} className="mt-5 list-decimal space-y-2.5 pl-6 text-[1.0625rem] leading-[1.75] text-ink marker:font-semibold marker:text-crimson">
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`)}</li>
                ))}
              </ol>
            ) : (
              <ul key={key} className="mt-5 space-y-2.5 pl-6 text-[1.0625rem] leading-[1.75] text-ink [&>li]:relative">
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`} className="before:absolute before:-left-5 before:top-[0.7em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-crimson">
                    {renderInline(item, `${key}-${n}`)}
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote key={key} className="mt-7 border-l-4 border-gold bg-surface-subtle/60 py-4 pl-5 pr-4 text-[1.0625rem] italic leading-[1.75] text-navy">
                {block.lines.map((l, n) => (
                  <p key={`${key}-${n}`} className={n ? "mt-3" : ""}>
                    {renderInline(l, `${key}-${n}`)}
                  </p>
                ))}
              </blockquote>
            );
          case "image":
            return (
              <figure key={key} className="my-8 overflow-hidden rounded-2xl border border-surface-border bg-surface-subtle shadow-card">
                <BlogImage
                  src={block.src}
                  alt={block.alt || "Article illustration"}
                  title={block.alt || undefined}
                  aspectRatio="16/9"
                />
                {block.alt ? (
                  <figcaption className="border-t border-surface-border bg-white px-4 py-2 text-center text-xs font-medium text-ink-muted">
                    {block.alt}
                  </figcaption>
                ) : null}
              </figure>
            );
          case "table":
            return (
              <div key={key} className="mt-8 overflow-x-auto rounded-xl ring-1 ring-surface-border">
                <table className="w-full min-w-[32rem] border-collapse text-left text-[0.95rem]">
                  <thead className="bg-navy text-white">
                    <tr>
                      {block.header.map((h, n) => (
                        <th key={`${key}-h${n}`} className="px-4 py-3 font-semibold">
                          {renderInline(h, `${key}-h${n}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r${r}`} className="border-t border-surface-border odd:bg-white even:bg-surface-subtle/50">
                        {row.map((cell, c) => (
                          <td key={`${key}-r${r}c${c}`} className="px-4 py-3 align-top text-ink">
                            {renderInline(cell, `${key}-r${r}c${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre key={key} className="mt-6 overflow-x-auto rounded-xl bg-navy p-5 text-sm leading-relaxed text-white/90">
                <code>{block.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={key} className="mt-12 border-surface-border" />;
        }
      })}
    </div>
  );
}
