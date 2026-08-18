// Turning an uploaded file into resume text.
//
// Server-side rather than in the browser: PDF extraction needs a real parser,
// and shipping one to every visitor of the dashboard costs more than the
// occasional upload does. `unpdf` is used because it bundles pdf.js in a form
// that works under a serverless runtime without the worker-file wiring the
// stock distribution needs.
//
// SECURITY: an uploaded file is untrusted input. Size is capped before any
// parsing happens, the type allow-list is checked against the actual bytes
// (a PDF magic number) rather than the filename or the browser-supplied MIME
// type, and nothing is ever written to disk.

import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { pageItemsToText } from "./pdf-text";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ExtractResult = { ok: true; text: string } | { ok: false; error: string };

/** %PDF- — the only file signature we accept for the PDF path. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

function looksLikePdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, i) => bytes[i] === byte);
}

/**
 * A quick sanity check that decoded bytes are actually readable text rather
 * than a binary file someone renamed to .txt. A resume is overwhelmingly
 * printable characters; a mislabelled binary is not.
 */
function looksLikeText(value: string): boolean {
  if (!value.trim()) return false;
  const sample = value.slice(0, 2000);
  const printable = sample.replace(/[^\x09\x0a\x0d\x20-\x7e -￿]/g, "").length;
  return printable / sample.length > 0.85;
}

/**
 * Walks the document page by page, rebuilding line structure from each page's
 * text geometry.
 *
 * unpdf's own `extractText` is used only as a fallback: it returns a flat run
 * with headings welded to the preceding sentence, which reads as one long
 * paragraph and defeats the resume parser entirely. See pdf-text.ts for the
 * full explanation.
 */
async function extractPdfLines(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string> {
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pageItemsToText(content.items as Parameters<typeof pageItemsToText>[0]));
    }
    const joined = pages.filter(Boolean).join("\n\n");
    if (joined.trim()) return joined;
  } catch {
    // Fall through to the flat extractor below rather than failing the upload:
    // badly structured text still beats no text, and the student can edit it.
  }

  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export async function extractResumeText(file: File): Promise<ExtractResult> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB. Paste the text instead.` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (looksLikePdf(bytes)) {
    try {
      const pdf = await getDocumentProxy(bytes);
      const merged = await extractPdfLines(pdf);

      if (!merged.trim()) {
        return { ok: false, error: "That PDF has no selectable text — it may be a scan. Paste your resume text instead." };
      }
      return { ok: true, text: merged.slice(0, 40000) };
    } catch {
      return { ok: false, error: "Could not read that PDF. Paste your resume text instead." };
    }
  }

  // Everything else is treated as plain text: .txt, .md, .csv all decode
  // usefully. A .docx is a ZIP archive, so it fails the printable check below
  // and gets an honest message rather than a page of mojibake.
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!looksLikeText(decoded)) {
    return {
      ok: false,
      error: "That file type isn't supported. Upload a PDF or plain text file, or paste your resume text.",
    };
  }

  return { ok: true, text: decoded.slice(0, 40000) };
}
