import { describe, it, expect } from "vitest";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { YoutrackClient } from "../youtrack-client.js";

const baseConfig = {
  baseUrl: "https://yt.test",
  token: "perm:test",
  defaultProject: "BC",
  outputDir: "/tmp",
  timezone: "UTC",
};

class CapturedRequest extends Error {
  constructor(
    public readonly method: string,
    public readonly url: string,
    public readonly query: string,
  ) {
    super(`captured ${method} ${url}`);
  }
}

function captureRequest(client: YoutrackClient): { last: () => CapturedRequest | undefined } {
  let captured: CapturedRequest | undefined;
  const { http } = client as unknown as { http: AxiosInstance };

  http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const params = (cfg.params ?? {}) as Record<string, unknown>;

    captured = new CapturedRequest(
      String(cfg.method ?? "get"),
      String(cfg.url ?? ""),
      String(params.query ?? ""),
    );
    throw captured;
  });

  return { last: () => captured };
}

describe("resolveIssueId in mutations", () => {
  it("createIssueComment normalizes numeric id via defaultProject", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.createIssueComment({ issueId: "9205", text: "hi" })).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/issues/BC-9205/comments");
  });

  it("updateIssueComment normalizes numeric id", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(
      client.updateIssueComment({ issueId: "9205", commentId: "c1", text: "x" }),
    ).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/issues/BC-9205/comments/c1");
  });

  it("updateIssue normalizes numeric id", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.updateIssue({ issueId: "9205", summary: "s" })).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/issues/BC-9205");
  });

  it("starIssue normalizes numeric id (first call hits getCurrentUser)", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.starIssue("9205")).rejects.toThrow();
    expect(cap.last()?.url).toBe("/api/users/me");
  });
});

describe("resolveIssueIds in bulk getters", () => {
  it("getIssues normalizes numeric ids in query", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.getIssues(["9205", "BC-1"])).rejects.toThrow();
    expect(cap.last()?.query).toBe("issue id: BC-9205 BC-1");
  });

  it("getIssuesDetails normalizes numeric ids", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.getIssuesDetails(["9205"])).rejects.toThrow();
    expect(cap.last()?.query).toBe("issue id: BC-9205");
  });

  it("getIssuesDetailsLight normalizes numeric ids", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.getIssuesDetailsLight(["9205"])).rejects.toThrow();
    expect(cap.last()?.query).toBe("issue id: BC-9205");
  });
});
