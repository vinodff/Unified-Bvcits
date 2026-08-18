// Pure helpers for the platform previews.
//
// Kept out of platform-preview.tsx so they can be unit tested — this project's
// vitest setup has no JSX transform, so a test may not import a .tsx module.

/**
 * Whether a markdown link target may be rendered as a real anchor.
 *
 * Article bodies are written by a language model, so an href is untrusted input.
 * Only absolute http(s) and site-relative paths are allowed; `javascript:`,
 * `data:` and everything else render as inert text instead.
 */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|\/)/i.test(href.trim());
}
