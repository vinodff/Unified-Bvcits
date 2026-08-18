import { describe, it, expect } from "vitest";
import { isSafeHref } from "./preview-utils";

// Article bodies are model-generated, so every href in them is untrusted input.
// The preview renders links as real anchors, which is exactly where a
// javascript: or data: URL would become clickable.
describe("preview link safety", () => {
  it("allows absolute http(s) and site-relative links", () => {
    expect(isSafeHref("https://bvcits.edu.in")).toBe(true);
    expect(isSafeHref("http://bvcits.edu.in/events")).toBe(true);
    expect(isSafeHref("/admissions")).toBe(true);
    expect(isSafeHref("  https://bvcits.edu.in  ")).toBe(true);
  });

  it("rejects script and data URLs", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("JavaScript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHref("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects protocol-relative and bare references that could be spoofed", () => {
    expect(isSafeHref("mailto:someone@example.com")).toBe(false);
    expect(isSafeHref("evil.com")).toBe(false);
    expect(isSafeHref("")).toBe(false);
  });
});
