import { describe, it, expect } from "vitest";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { YoutrackClient } from "../youtrack-client.js";

const baseConfig = {
  baseUrl: "https://yt.test",
  token: "perm:test-token",
  timezone: "UTC",
  outputDir: "/tmp",
};

class CapturedRequest extends Error {
  constructor(public readonly method: string, public readonly url: string) {
    super(`captured ${method} ${url}`);
  }
}

/**
 * Installs an axios interceptor that aborts every request with a CapturedRequest
 * exception carrying the resolved URL. This keeps the test focused on URL
 * shape and avoids any networking (which conflicts with nock + follow-redirects).
 */
function captureUrl(client: YoutrackClient): { last: () => CapturedRequest | undefined } {
  let captured: CapturedRequest | undefined;
  // Reach into private http for testing — the interceptor is removed when the
  // client goes out of scope at end of test.
  const {http} = (client as unknown as { http: AxiosInstance });

  http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    captured = new CapturedRequest(String(cfg.method ?? "get"), String(cfg.url ?? ""));
    throw captured;
  });

  return { last: () => captured };
}

describe("YoutrackClient URL encoding", () => {
  it("leaves safe ids untouched", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureUrl(client);

    await expect(client.getIssue("BC-1")).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/issues/BC-1");
  });

  it("encodes / in issueId so it cannot escape the path", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureUrl(client);

    await expect(client.getIssue("BC-1/comments")).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/issues/BC-1%2Fcomments");
  });

  it("encodes ? in attachmentId", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureUrl(client);

    await expect(client.getAttachment("BC-1", "1-1?bad")).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/issues/BC-1/attachments/1-1%3Fbad");
  });

  it("encodes # in workItemId path", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureUrl(client);

    await expect(client.deleteWorkItem("BC-1", "4-9#frag")).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/issues/BC-1/timeTracking/workItems/4-9%23frag");
  });
});
