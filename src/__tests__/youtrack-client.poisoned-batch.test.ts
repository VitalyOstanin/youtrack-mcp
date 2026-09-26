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

function httpError(status: number, data: unknown): Error {
  const error = new Error(`Request failed with status code ${status}`) as Error & {
    response: { status: number; data: unknown };
    isAxiosError: boolean;
  };

  error.isAxiosError = true;
  error.response = { status, data };

  return error;
}

function notFound(issueId: string): Error {
  return httpError(404, { error: "Not Found", error_description: `Entity with id ${issueId} not found` });
}

function invalidQuery(issueId: string): Error {
  return httpError(400, {
    error: "invalid_query",
    error_description: `The value "${issueId}" isn't used for the issue id field.`,
  });
}

/**
 * Reproduces the real YouTrack behaviour (checked against 2026.3): a search
 * query built as `issue id: A B C` answers 200 with an EMPTY array as soon as
 * ONE of the ids cannot be resolved, and 400 `invalid_query` when NONE of them
 * resolve. Ids are matched case-insensitively and come back in canonical case.
 * Direct `GET /api/issues/<id>` answers per issue; `failing` ids make it fail
 * with the given status instead of 404.
 */
function mockPoisonedSearch(
  client: YoutrackClient,
  live: Record<string, { idReadable: string }>,
  failing: Record<string, number> = {},
): ReturnType<typeof vi.spyOn> {
  const lookup = (id: string): { idReadable: string } | undefined => live[id.toUpperCase()];

  return vi.spyOn(getHttp(client), "get").mockImplementation((...args: unknown[]) => {
    const url = String(args[0]);
    const config = (args[1] ?? {}) as { params?: Record<string, unknown> };

    if (url === "/api/issues") {
      const query = String(config.params?.query ?? "");
      const ids = query.replace("issue id: ", "").split(" ").filter(Boolean);
      const resolved = ids.map(lookup);

      if (resolved.every((issue) => issue === undefined)) {
        return Promise.reject(invalidQuery(ids[0] ?? ""));
      }

      return Promise.resolve({ data: resolved.every(Boolean) ? resolved : [] });
    }

    const directId = decodeURIComponent(url.startsWith("/api/issues/") ? url.slice("/api/issues/".length) : "");
    const status = failing[directId];

    if (status !== undefined) {
      return Promise.reject(httpError(status, { error: "server_error", error_description: `status ${status}` }));
    }

    const issue = lookup(directId);

    return issue ? Promise.resolve({ data: issue }) : Promise.reject(notFound(directId));
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
    expect(result.errors).toEqual([{ issueId: "BC-9999", error: "Issue 'BC-9999' not found" }]);
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

  it("reports every id in errors when none of them resolve (search answers 400)", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live);

    const result = await client.getIssuesDetails(["BC-9998", "BC-9999"]);

    expect(result.issues).toHaveLength(0);
    expect(result.errors?.map((e) => e.issueId)).toEqual(["BC-9998", "BC-9999"]);
  });

  it("reports a failure other than 404 with its own message, not as 'not found'", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live, { "BC-3": 503 });

    const result = await client.getIssuesDetails(["BC-1", "BC-3"]);

    expect(result.issues.map((i) => i.idReadable)).toEqual(["BC-1"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.issueId).toBe("BC-3");
    expect(result.errors?.[0]?.error).toContain("status 503");
    expect(result.errors?.[0]?.error).not.toContain("not found");
  });

  it("matches ids case-insensitively and does not duplicate issues", async () => {
    const client = new YoutrackClient(baseConfig);
    const get = mockPoisonedSearch(client, live);
    const result = await client.getIssuesDetails(["bc-1", "BC-2"]);

    expect(result.issues.map((i) => i.idReadable).sort()).toEqual(["BC-1", "BC-2"]);
    expect(result.errors).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate an issue recovered under a different case", async () => {
    const client = new YoutrackClient(baseConfig);

    mockPoisonedSearch(client, live);

    const result = await client.getIssuesDetails(["BC-1", "bc-1", "BC-9999"]);

    expect(result.issues.map((i) => i.idReadable)).toEqual(["BC-1"]);
    expect(result.errors?.map((e) => e.issueId)).toEqual(["BC-9999"]);
  });

  it("still throws when the search fails for a reason other than unresolvable ids", async () => {
    const client = new YoutrackClient(baseConfig);

    vi.spyOn(getHttp(client), "get").mockRejectedValue(httpError(500, { error: "server_error" }));

    await expect(client.getIssuesDetails(["BC-1"])).rejects.toThrow();
  });
});
