import { describe, it, expect, vi } from "vitest";

import { YoutrackClient } from "../youtrack-client.js";
import type { IssueLinksPayload, YoutrackConfig } from "../types.js";

const baseConfig: YoutrackConfig = {
  baseUrl: "https://yt.test",
  token: "perm:test",
  defaultProject: "BC",
  outputDir: "/tmp",
  timezone: "UTC",
};

interface AxiosLike {
  delete: (...args: unknown[]) => Promise<unknown>;
  post: (...args: unknown[]) => Promise<unknown>;
}

function getHttp(client: YoutrackClient): AxiosLike {
  return (client as unknown as { http: AxiosLike }).http;
}

function methodNotAllowed(): unknown {
  return {
    isAxiosError: true,
    message: "Request failed with status code 405",
    response: { status: 405, data: { error: "method_not_allowed" } },
  };
}

async function captureCommandSilent(config: YoutrackConfig): Promise<unknown> {
  const client = new YoutrackClient(config);
  const http = getHttp(client);

  vi.spyOn(http, "delete").mockRejectedValue(methodNotAllowed());
  vi.spyOn(client, "getIssueLinks").mockResolvedValue({
    issueId: "BC-1",
    links: [
      {
        id: "L1",
        direction: "OUTWARD",
        linkType: { name: "Relates", id: "lt-rel", outwardName: "relates to", inwardName: "relates to" },
        issue: { idReadable: "BC-99", id: "1-99", summary: "s" },
      },
    ],
  } as unknown as IssueLinksPayload);

  let captured: Record<string, unknown> | undefined;

  vi.spyOn(http, "post").mockImplementation((...args: unknown[]) => {
    captured = args[1] as Record<string, unknown>;

    return Promise.resolve({ data: {} });
  });

  await client.deleteIssueLink({ issueId: "BC-1", linkId: "L1", targetId: "BC-99" });

  return captured?.silent;
}

describe("command silent flag", () => {
  it("defaults to silent:false in the command fallback", async () => {
    expect(await captureCommandSilent(baseConfig)).toBe(false);
  });

  it("uses silent:true when config.silentCommands is enabled", async () => {
    expect(await captureCommandSilent({ ...baseConfig, silentCommands: true })).toBe(true);
  });
});
