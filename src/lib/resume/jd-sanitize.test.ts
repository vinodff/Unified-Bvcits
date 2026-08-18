import { describe, expect, it } from "vitest";
import { checkJdUrl, htmlToText, isDisallowedHost } from "./jd-sanitize";

describe("isDisallowedHost — SSRF guard", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "db.internal",
    "printer.local",
    "intranet", // no dot
  ])("rejects %s", (host) => {
    expect(isDisallowedHost(host)).toBe(true);
  });

  it.each(["careers.google.com", "boards.greenhouse.io", "www.linkedin.com", "internshala.com"])(
    "allows %s",
    (host) => {
      expect(isDisallowedHost(host)).toBe(false);
    }
  );

  it("rejects a public IP too, since a bare IP is never a real posting", () => {
    expect(isDisallowedHost("8.8.8.8")).toBe(true);
  });
});

describe("checkJdUrl", () => {
  it("rejects http, allowing only https", () => {
    const result = checkJdUrl("http://careers.google.com/job/1");
    expect(result.ok).toBe(false);
  });

  it("rejects non-web schemes", () => {
    expect(checkJdUrl("file:///etc/passwd").ok).toBe(false);
    expect(checkJdUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("rejects garbage that is not a URL", () => {
    expect(checkJdUrl("not a url").ok).toBe(false);
  });

  it("rejects the cloud metadata endpoint over https", () => {
    expect(checkJdUrl("https://169.254.169.254/latest/meta-data/").ok).toBe(false);
  });

  it("accepts a normal https job posting", () => {
    const result = checkJdUrl("https://boards.greenhouse.io/example/jobs/1");
    expect(result.ok).toBe(true);
  });
});

describe("htmlToText", () => {
  it("removes script and style content entirely", () => {
    const text = htmlToText("<style>.a{color:red}</style><p>Hello</p><script>alert(1)</script>");
    expect(text).toContain("Hello");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("turns block endings into newlines", () => {
    expect(htmlToText("<li>One</li><li>Two</li>")).toContain("\n");
  });

  it("decodes common entities", () => {
    expect(htmlToText("<p>R&amp;D</p>")).toContain("R&D");
  });

  it("strips all tags", () => {
    expect(htmlToText("<div><span>Job</span></div>")).not.toContain("<");
  });
});
