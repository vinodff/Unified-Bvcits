import { describe, it, expect } from "vitest";
import { classifyError } from "./publisher";

describe("classifyError", () => {
  it("retries transport errors (no status)", () => {
    expect(classifyError(undefined, "ECONNRESET")).toBe("retryable");
    expect(classifyError(undefined, "socket hang up")).toBe("retryable");
  });

  it("rate limits are retryable", () => {
    expect(classifyError(429, "Too Many Requests")).toBe("rate_limited");
  });

  it("5xx errors are retryable", () => {
    expect(classifyError(500, "Internal Server Error")).toBe("retryable");
    expect(classifyError(502, "Bad Gateway")).toBe("retryable");
    expect(classifyError(503, "Service Unavailable")).toBe("retryable");
  });

  it("auth errors are permanent", () => {
    expect(classifyError(401, "Invalid OAuth token")).toBe("permanent");
    expect(classifyError(403, "Permission denied")).toBe("permanent");
  });

  it("400 with token/permission wording is permanent", () => {
    expect(classifyError(400, "invalid access token")).toBe("permanent");
    expect(classifyError(400, "no permission to publish")).toBe("permanent");
  });

  it("other 4xx are permanent", () => {
    expect(classifyError(404, "Not Found")).toBe("permanent");
    expect(classifyError(422, "Unprocessable")).toBe("permanent");
    expect(classifyError(400, "media type not supported")).toBe("permanent");
  });
});