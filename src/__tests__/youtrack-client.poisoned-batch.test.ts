import { describe, it, expect, vi } from "vitest";

import { YoutrackClient } from "../youtrack-client.js";

const baseConfig = {
  baseUrl: "https://yt.test",
  token: "perm:test",
  outputDir: "/tmp",
  timezone: "UTC",
};

interface AxiosLike {
  get: (...args: unknown[]) => Promise<unknown>;
}

function getHttp(client: YoutrackClient): AxiosLike {
  return (client as unknown as { http: AxiosLike }).http;
}

function notFound(issueId: string): Error & { response: { status: number; data: unknown } } {
  const error = new Error(`Request failed with status code 404`) as Error & {
    response: { status: number; data: unknown };
    isAxiosError: boolean;
  };

  error.isAxiosError = true;
  error.response = {
    status: 404,
    data: { error: "Not Found", error_description: `Entity with id ${issueId} not found` },
  };

  return error;
}

/**
 * Reproduces the real YouTrack behaviour: a search query built as
 * `issue id: A B C` answers 200 with an EMPTY array as soon as ONE of the ids
 * cannot be resolved — it does not degrade to the resolvable subset. Direct
 * `GET /api/issues/<id>` still answers per issue.
 */
function mockPoisonedSearch(client: YoutrackClient, live: Record<string, unknown>): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(getHttp(client), "get").mockImplementation((...args: unknown[]) => {
    const url = String(args[0]);
    const config = (args[1] ?? {}) as { params?: Record<string, unknown> };

    if (url === "/api/issues") {
      const query = String(config.params?.query ?? "");
      const ids = query.replace("issue id: ", "").split(" ").filter(Boolean);
      const allResolvable = ids.every((id) => id in live);

      return Promise.resolve({ data: allResolvable ? ids.map((id) => live[id]) : [] });
    }

    const directId = url.startsWith("/api/issues/") ? url.slice("/api/issues/".length) : "";

    if (directId && directId in live) {
      return Promise.resolve({ data: live[directId] });
    }

    return Promise.reject(notFound(directId));
  });
}

const live = {
  "BC-1": { id: "1", idReadable: "BC-1", summary: "first", customFields: [] },
  "BC-2": { id: "2", idReadable: "BC-2", summary: "second", customFields: [] },
};

describe("a single unresolvable id must not empty the whole batch", () => {
  it("getIssuesDetails returns the existing issues and reports only the dead id", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live);

    const result = await client.getIssuesDetails(["BC-1", "BC-2", "BC-9999"]);

    expect(result.issues.map((i) => i.idReadable).sort()).toEqual(["BC-1", "BC-2"]);
    expect(result.errors?.map((e) => e.issueId)).toEqual(["BC-9999"]);
  });

  it("getIssues returns the existing issues and reports only the dead id", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live);

    const result = await client.getIssues(["BC-1", "BC-2", "BC-9999"]);

    expect(result.issues.map((i) => i.idReadable).sort()).toEqual(["BC-1", "BC-2"]);
    expect(result.errors?.map((e) => e.issueId)).toEqual(["BC-9999"]);
  });

  it("getIssuesState returns the existing states and reports only the dead id", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live);

    const result = await client.getIssuesState(["BC-1", "BC-2", "BC-9999"]);

    expect(result.states.map((s) => s.issueId).sort()).toEqual(["BC-1", "BC-2"]);
    expect(result.errors?.map((e) => e.issueId)).toEqual(["BC-9999"]);
  });

  it("getIssuesDetailsLight recovers the existing issues (it reports no errors at all)", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live);

    const issues = await client.getIssuesDetailsLight(["BC-1", "BC-2", "BC-9999"]);

    expect(issues.map((i) => i.idReadable).sort()).toEqual(["BC-1", "BC-2"]);
  });

  it("spends no extra request when every id resolves", async () => {
    const client = new YoutrackClient(baseConfig);
    const get = mockPoisonedSearch(client, live);
    const result = await client.getIssuesDetails(["BC-1", "BC-2"]);

    expect(result.issues).toHaveLength(2);
    expect(result.errors).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reports a genuinely missing id when it travels alone", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live);

    const result = await client.getIssuesDetails(["BC-9999"]);

    expect(result.issues).toHaveLength(0);
    expect(result.errors?.map((e) => e.issueId)).toEqual(["BC-9999"]);
  });
});
