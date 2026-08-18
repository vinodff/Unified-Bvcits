// Reconstructing readable lines from a PDF's text items.
//
// WHY THIS EXISTS: pdf.js (and therefore unpdf's convenience `extractText`)
// hands back a flat run of text fragments with no line structure. Joining
// them naively produces exactly the failure this feature hit in testing —
//
//   "...simplify work.PROFILE / SUMMARYEDUCATIONB.TECH CSE STUDENTVINOD
//    KUMAR KONDETIvinodkondeti081@gmail.com+91 8019238515Sakhinetipalli..."
//
// — where every heading is welded to the sentence before it. A resume parser
// keys almost entirely off line starts and headings, so that single defect
// cascades into an empty parse and an empty "optimized" resume.
//
// The fix is to use the geometry pdf.js already gives us. Each text item
// carries a transform matrix whose last two entries are its x/y position on
// the page. Items sharing a y are one visual line; a change in y is a line
// break. Within a line, a horizontal gap wider than a space means a column
// boundary or tab, not a joined word.

import "server-only";

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  hasEOL?: boolean;
}

/** Two items count as the same line when their baselines are within this many points. */
const LINE_TOLERANCE = 2.5;

/** A horizontal gap wider than this fraction of the font size implies a space. */
const SPACE_RATIO = 0.25;

interface PositionedItem {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

function toPositioned(items: TextItem[]): PositionedItem[] {
  return items
    .filter((item) => typeof item.str === "string" && item.str.length > 0)
    .map((item) => ({
      text: item.str,
      // transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
      x: item.transform[4],
      y: item.transform[5],
      width: item.width ?? 0,
      fontSize: Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10,
    }));
}

/** Groups items into visual lines by baseline, top of page first. */
function groupIntoLines(items: PositionedItem[]): PositionedItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedItem[][] = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    // PDF y-origin is the BOTTOM of the page, so descending y walks down it.
    if (current && Math.abs(current[0].y - item.y) <= LINE_TOLERANCE) {
      current.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

/** Joins one line's fragments, inserting a space wherever the geometry implies one. */
function renderLine(line: PositionedItem[]): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const item = line[i];
    if (i > 0) {
      const previous = line[i - 1];
      const gap = item.x - (previous.x + previous.width);
      const needsSpace = gap > previous.fontSize * SPACE_RATIO;
      const alreadySpaced = out.endsWith(" ") || item.text.startsWith(" ");
      if (needsSpace && !alreadySpaced) out += " ";
    }
    out += item.text;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Detects the vertical gap that separates blocks, and inserts a blank line
 * there. Resume parsers rely on blank lines to know where one job entry ends
 * and the next begins, and a PDF expresses that as extra leading rather than
 * as any character.
 */
function withBlockBreaks(lines: PositionedItem[][]): string[] {
  const rendered: string[] = [];

  // Typical line spacing for this document, used as the baseline to compare
  // against. Median rather than mean so one big title gap cannot skew it.
  const deltas: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const delta = lines[i - 1][0].y - lines[i][0].y;
    if (delta > 0) deltas.push(delta);
  }
  deltas.sort((a, b) => a - b);
  const medianDelta = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)] : 0;

  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && medianDelta > 0) {
      const delta = lines[i - 1][0].y - lines[i][0].y;
      if (delta > medianDelta * 1.6) rendered.push("");
    }
    const text = renderLine(lines[i]);
    if (text) rendered.push(text);
  }

  return rendered;
}

/** Extracts one page's text with its line structure intact. */
export function pageItemsToText(items: TextItem[]): string {
  const positioned = toPositioned(items);
  if (positioned.length === 0) return "";
  return withBlockBreaks(groupIntoLines(positioned)).join("\n");
}
