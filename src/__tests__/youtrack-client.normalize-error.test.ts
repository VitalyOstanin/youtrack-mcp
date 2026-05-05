import { describe, it, expect, vi } from "vitest";

import { YoutrackClient } from "../youtrack-client.js";

const config = {
  baseUrl: "https://yt.test",
  token: "perm:test",
  defaultProject: "BC",
  outputDir: "/tmp",
  timezone: "UTC",
};

interface AxiosLike {
  get: (...args: unknown[]) => Promise<unknown>;
}

function getHttp(client: YoutrackClient): AxiosLike {
  return (client as unknown as { http: AxiosLike }).http;
}

function makeAxiosError(status: number, data: Record<string, unknown>): unknown {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: { status, data },
  };
}

describe("normalizeError details whitelist", () => {
  it("strips unknown keys (stack, pii) from response.data", async () => {
    const client = new YoutrackClient(config);

    vi.spyOn(getHttp(client), "get").mockRejectedValue(
      makeAxiosError(400, {
        error: "bad_request",
        error_description: "issue not found",
        stack: "internal: org.youtrack...",
        pii: "user@example.com",
      }),
    );

    let captured: { details?: Record<string, unknown>; status?: number; message?: string } | undefined;

    try {
      await client.getIssue("BC-1");
      throw new Error("expected failure");
    } catch (err) {
      captured = err as typeof captured;
    }

    expect(captured?.status).toBe(400);
    expect(captured?.details).toEqual({
      error: "bad_request",
      error_description: "issue not found",
    });
    expect(captured?.details).not.toHaveProperty("stack");
    expect(captured?.details).not.toHaveProperty("pii");
  });

  it("returns undefined details when nothing in the whitelist matches", async () => {
    const client = new YoutrackClient(config);

    vi.spyOn(getHttp(client), "get").mockRejectedValue(
      makeAxiosError(500, { stack: "x", trace: "y" }),
    );

    try {
      await client.getIssue("BC-1");
      throw new Error("expected failure");
    } catch (err) {
      const e = err as { details?: Record<string, unknown>; status?: number };

      expect(e.status).toBe(500);
      expect(e.details).toBeUndefined();
    }
  });

  it("keeps numeric code and message strings", async () => {
    const client = new YoutrackClient(config);

    vi.spyOn(getHttp(client), "get").mockRejectedValue(
      makeAxiosError(403, { code: 403, message: "forbidden", debug: { ip: "1.2.3.4" } }),
    );

    try {
      await client.getIssue("BC-1");
      throw new Error("expected failure");
    } catch (err) {
      const e = err as { details?: Record<string, unknown> };

      expect(e.details).toEqual({ code: 403, message: "forbidden" });
    }
  });
});
