// Fetching a job description from a URL the student pasted.
//
// SECURITY: this is a server-side fetch of a user-supplied URL — textbook
// SSRF. The URL rules live in jd-sanitize.ts (pure, tested); what this module
// adds is the I/O hardening around them:
//
//   - redirects are NOT followed, because a public URL that 302s to
//     169.254.169.254 defeats a check performed only on the original
//   - the body is read through a hard byte cap rather than trusting
//     content-length, which a hostile server can simply lie about
//   - a timeout bounds how long one student request can hold a connection
//
// The DNS-rebinding case (a public hostname resolving to a private address)
// is not closed by hostname checks alone. No-redirect plus the size cap keeps
// the blast radius to "one GET of a body we then discard", which is the
// residual risk accepted here.

import "server-only";
import { checkJdUrl, htmlToText } from "./jd-sanitize";

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 12_000;

export type JdFetchResult = { ok: true; text: string } | { ok: false; error: string };

export async function fetchJobDescription(rawUrl: string): Promise<JdFetchResult> {
  const check = checkJdUrl(rawUrl);
  if (!check.ok) return { ok: false, error: check.error };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(check.url.toString(), {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        // Many career sites answer an unknown agent with 403 while serving
        // browsers fine — the same finding the opportunity pipeline hit.
        "User-Agent": "Mozilla/5.0 (compatible; BVCITS-ResumeOptimizer/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: "That link redirects elsewhere. Open it and paste the description text instead." };
    }
    if (!response.ok) {
      return { ok: false, error: `The site returned ${response.status}. Paste the description text instead.` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text/plain")) {
      return { ok: false, error: "That link isn't a web page. Paste the description text instead." };
    }

    const reader = response.body?.getReader();
    if (!reader) return { ok: false, error: "Could not read that page." };

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
      }
    }
    void reader.cancel();

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      if (offset >= received) break;
      const slice = chunk.subarray(0, Math.min(chunk.length, received - offset));
      merged.set(slice, offset);
      offset += slice.length;
    }

    const text = htmlToText(new TextDecoder().decode(merged));
    if (text.length < 100) {
      return { ok: false, error: "Couldn't find readable text there — many job sites need JavaScript. Paste the text instead." };
    }

    return { ok: true, text: text.slice(0, 20000) };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? "That site took too long to respond." : "Could not reach that link." };
  } finally {
    clearTimeout(timeout);
  }
}
