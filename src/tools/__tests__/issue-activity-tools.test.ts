import { describe, it, expect } from "vitest";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { YoutrackClient } from "../../youtrack-client.js";
import { issueActivitiesHandler, issueActivitiesSchema } from "../issue-activity-tools.js";

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

describe("issue_activities schema", () => {
  it("accepts categories as enum array and applies pagination defaults", () => {
    const parsed = issueActivitiesSchema.parse({
      issueId: "BC-1",
      categories: ["LinksCategory", "CommentsCategory"],
    });

    expect(parsed.limit).toBe(100);
    expect(parsed.skip).toBe(0);
    expect(parsed.categories).toEqual(["LinksCategory", "CommentsCategory"]);
  });

  it("rejects unknown categories", () => {
    expect(() =>
      issueActivitiesSchema.parse({ issueId: "BC-1", categories: ["NotARealCategory"] }),
    ).toThrow();
  });
});

describe("issue_activities handler forwards categories and pagination", () => {
  it("passes $top, $skip and joined categories to the server", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await issueActivitiesHandler(client, {
      issueId: "BC-1",
      categories: ["LinksCategory"],
      limit: 10,
      skip: 20,
    });

    const req = cap.last();

    expect(req?.url).toBe("/api/issues/BC-1/activities");
    expect(req?.params.$top).toBe(10);
    expect(req?.params.$skip).toBe(20);
    expect(req?.params.categories).toBe("LinksCategory");
  });

  it("falls back to default categories when not provided", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureRequest(client);

    await issueActivitiesHandler(client, { issueId: "BC-1" });

    const req = cap.last();

    expect(req?.params.categories).toBe("CustomFieldCategory,CommentsCategory");
    expect(req?.params.$top).toBe(100);
    expect(req?.params.$skip).toBe(0);
  });
});
