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
    public readonly url: string,
    public readonly params: Record<string, unknown>,
  ) {
    super(`captured ${url}`);
  }
}

function captureRequest(client: YoutrackClient): { last: () => CapturedRequest | undefined } {
  let captured: CapturedRequest | undefined;
  const { http } = client as unknown as { http: AxiosInstance };

  http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    captured = new CapturedRequest(String(cfg.url ?? ""), (cfg.params ?? {}) as Record<string, unknown>);
    throw captured;
  });

  return { last: () => captured };
}

describe("read pagination forwarding", () => {
  it("getIssueComments forwards $top/$skip", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.getIssueComments("BC-1", { limit: 25, skip: 5 })).rejects.toThrow();

    const req = cap.last();

    expect(req?.url).toBe("/api/issues/BC-1/comments");
    expect(req?.params.$top).toBe(25);
    expect(req?.params.$skip).toBe(5);
  });

  it("getIssueLinks forwards $top/$skip", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.getIssueLinks("BC-1", { limit: 30, skip: 10 })).rejects.toThrow();

    const req = cap.last();

    expect(req?.url).toBe("/api/issues/BC-1/links");
    expect(req?.params.$top).toBe(30);
    expect(req?.params.$skip).toBe(10);
  });

  it("listUsers forwards $top/$skip", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.listUsers({ limit: 7, skip: 2 })).rejects.toThrow();

    const req = cap.last();

    expect(req?.url).toBe("/api/users");
    expect(req?.params.$top).toBe(7);
    expect(req?.params.$skip).toBe(2);
  });

  it("listProjects single-page mode forwards $top/$skip", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await expect(client.listProjects({ limit: 5, skip: 1 })).rejects.toThrow();

    const req = cap.last();

    expect(req?.url).toBe("/api/admin/projects");
    expect(req?.params.$top).toBe(5);
    expect(req?.params.$skip).toBe(1);
  });

  it("listArticles forwards $top/$skip", async () => {
    const client = new YoutrackClient({ ...baseConfig, defaultProject: undefined });
    const cap = captureRequest(client);

    await expect(client.listArticles({ limit: 12, skip: 3 })).rejects.toThrow();

    const req = cap.last();

    expect(req?.url).toBe("/api/articles");
    expect(req?.params.$top).toBe(12);
    expect(req?.params.$skip).toBe(3);
  });
});
