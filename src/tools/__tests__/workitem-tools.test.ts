import { describe, it, expect, vi } from "vitest";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { YoutrackClient } from "../../youtrack-client.js";
import { workitemsListHandler, workitemsAllUsersHandler } from "../workitem-tools.js";

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

describe("workitems_list pagination", () => {
  it("forwards limit and skip as $top/$skip", async () => {
    const client = new YoutrackClient(baseConfig);

    vi.spyOn(client, "getCurrentUser").mockResolvedValue({
      id: "u1",
      login: "tester",
      name: "Tester",
      email: "t@example.com",
    });

    const cap = captureRequest(client);

    await workitemsListHandler(client, { limit: 50, skip: 10 });

    const req = cap.last();

    expect(req?.url).toBe("/api/workItems");
    expect(req?.params.$top).toBe(50);
    expect(req?.params.$skip).toBe(10);
  });

  it("uses default limit 100 and skip 0 when not provided", async () => {
    const client = new YoutrackClient(baseConfig);

    vi.spyOn(client, "getCurrentUser").mockResolvedValue({
      id: "u1",
      login: "tester",
      name: "Tester",
      email: "t@example.com",
    });

    const cap = captureRequest(client);

    await workitemsListHandler(client, {});

    const req = cap.last();

    expect(req?.params.$top).toBe(100);
    expect(req?.params.$skip).toBe(0);
  });
});

describe("workitems_all_users pagination", () => {
  it("forwards limit/skip and does not require currentUser lookup", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await workitemsAllUsersHandler(client, { limit: 25, skip: 5 });

    const req = cap.last();

    expect(req?.url).toBe("/api/workItems");
    expect(req?.params.$top).toBe(25);
    expect(req?.params.$skip).toBe(5);
    expect(req?.params.author).toBeUndefined();
  });
});
