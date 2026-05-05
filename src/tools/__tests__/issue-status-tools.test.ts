import { describe, it, expect, vi } from "vitest";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { YoutrackClient } from "../../youtrack-client.js";
import { issueStatusHandler, issuesStatusHandler } from "../issue-status-tools.js";

const baseConfig = {
  baseUrl: "https://yt.test",
  token: "perm:test",
  defaultProject: "BC",
  outputDir: "/tmp",
  timezone: "UTC",
};

interface TextContent { type: "text"; text: string }

function parsePayload(result: { content?: unknown[]; isError?: boolean }): {
  isError: boolean;
  parsed: Record<string, unknown>;
} {
  const content = (result.content ?? []) as TextContent[];
  const text = content[0]?.text ?? "{}";
  const wrapped = JSON.parse(text) as { success?: boolean; payload?: Record<string, unknown> };

  return {
    isError: Boolean(result.isError),
    parsed: wrapped.payload ?? (wrapped as Record<string, unknown>),
  };
}

class CapturedRequest extends Error {
  constructor(public readonly method: string, public readonly url: string, public readonly fields: string) {
    super(`captured ${method} ${url} fields=${fields}`);
  }
}

function captureFields(client: YoutrackClient): { last: () => CapturedRequest | undefined } {
  let captured: CapturedRequest | undefined;
  const { http } = client as unknown as { http: AxiosInstance };

  http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const params = (cfg.params ?? {}) as Record<string, unknown>;

    captured = new CapturedRequest(String(cfg.method ?? "get"), String(cfg.url ?? ""), String(params.fields ?? ""));
    throw captured;
  });

  return { last: () => captured };
}

describe("getIssueState minimal fields", () => {
  it("requests customFields without possibleEvents", async () => {
    const client = new YoutrackClient(baseConfig);
    const cap = captureFields(client);

    await expect(client.getIssueState("BC-1")).rejects.toThrow();

    const fields = cap.last()?.fields ?? "";

    expect(fields).toContain("customFields(");
    expect(fields).not.toContain("possibleEvents");
    expect(cap.last()?.url).toBe("/api/issues/BC-1");
  });
});

describe("issue_status handler", () => {
  it("maps state.presentation to status and reports state", async () => {
    const client = new YoutrackClient(baseConfig);

    vi.spyOn(client, "getIssueState").mockResolvedValue({
      issueId: "BC-1",
      state: { id: "s-1", name: "Open", presentation: "In Progress" },
    });

    const result = await issueStatusHandler(client, { issueId: "BC-1" });
    const { isError, parsed } = parsePayload(result);

    expect(isError).toBe(false);
    expect(parsed.issueId).toBe("BC-1");
    expect(parsed.status).toBe("In Progress");
    expect(parsed.state).toMatchObject({ id: "s-1", name: "Open", presentation: "In Progress" });
  });

  it("returns Unknown when state is null", async () => {
    const client = new YoutrackClient(baseConfig);

    vi.spyOn(client, "getIssueState").mockResolvedValue({ issueId: "BC-2", state: null });

    const result = await issueStatusHandler(client, { issueId: "BC-2" });
    const { parsed } = parsePayload(result);

    expect(parsed.status).toBe("Unknown");
    expect(parsed.state).toBeNull();
  });
});

describe("issues_status handler", () => {
  it("maps batch state results and surfaces errors", async () => {
    const client = new YoutrackClient(baseConfig);

    vi.spyOn(client, "getIssuesState").mockResolvedValue({
      states: [
        { issueId: "BC-1", state: { id: "s-1", name: "Open", presentation: "Open" } },
        { issueId: "BC-3", state: null },
      ],
      errors: [{ issueId: "BC-2", error: "Issue 'BC-2' not found" }],
    });

    const result = await issuesStatusHandler(client, { issueIds: ["BC-1", "BC-2", "BC-3"] });
    const { isError, parsed } = parsePayload(result);

    expect(isError).toBe(false);

    const statuses = parsed.statuses as Array<{ issueId: string; status: string }>;

    expect(statuses).toEqual([
      { issueId: "BC-1", status: "Open", state: { id: "s-1", name: "Open", presentation: "Open" } },
      { issueId: "BC-3", status: "Unknown", state: null },
    ]);

    const errors = parsed.errors as Array<{ issueId: string }>;

    expect(errors).toHaveLength(1);
    expect(errors[0].issueId).toBe("BC-2");
  });
});
