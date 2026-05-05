import { describe, it, expect, vi } from "vitest";

import { YoutrackClient } from "../youtrack-client.js";
import type { IssueLinksPayload } from "../types.js";

const config = {
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

describe("deleteIssueLink subtask fallback", () => {
  it("uses linkToDelete.issue.idReadable when targetId is missing", async () => {
    const client = new YoutrackClient(config);
    const http = getHttp(client);

    vi.spyOn(http, "delete").mockRejectedValue(methodNotAllowed());
    vi.spyOn(client, "getIssueLinks").mockResolvedValue({
      issueId: "BC-1",
      links: [
        {
          id: "L1",
          direction: "OUTWARD",
          linkType: { name: "Subtask", id: "lt-sub" },
          issue: { idReadable: "BC-99", id: "1-99", summary: "s" },
        },
      ],
    } as unknown as IssueLinksPayload);

    let captured: { url: string; body: Record<string, unknown> } | undefined;

    vi.spyOn(http, "post").mockImplementation((...args: unknown[]) => {
      captured = { url: String(args[0]), body: args[1] as Record<string, unknown> };

      return Promise.resolve({ data: {} });
    });

    await client.deleteIssueLink({ issueId: "BC-1", linkId: "L1" });

    expect(captured?.url).toBe("/api/commands");
    expect(captured?.body.query).toBe("remove subtask of BC-99");

    const issues = captured?.body.issues as Array<{ idReadable: string }>;

    expect(issues[0].idReadable).toBe("BC-1");
  });

  it("uses provided targetId when given (regular link)", async () => {
    const client = new YoutrackClient(config);
    const http = getHttp(client);

    vi.spyOn(http, "delete").mockRejectedValue(methodNotAllowed());
    vi.spyOn(client, "getIssueLinks").mockResolvedValue({
      issueId: "BC-1",
      links: [
        {
          id: "L1",
          direction: "OUTWARD",
          linkType: {
            name: "Relates",
            id: "lt-rel",
            outwardName: "relates to",
            inwardName: "relates to",
          },
          issue: { idReadable: "BC-99", id: "1-99", summary: "s" },
        },
      ],
    } as unknown as IssueLinksPayload);

    let captured: { body: Record<string, unknown> } | undefined;

    vi.spyOn(http, "post").mockImplementation((...args: unknown[]) => {
      captured = { body: args[1] as Record<string, unknown> };

      return Promise.resolve({ data: {} });
    });

    await client.deleteIssueLink({ issueId: "BC-1", linkId: "L1", targetId: "BC-7" });

    expect(String(captured?.body.query)).toContain("BC-7");
  });

  it("throws when neither input.targetId nor link payload provide a target", async () => {
    const client = new YoutrackClient(config);
    const http = getHttp(client);

    vi.spyOn(http, "delete").mockRejectedValue(methodNotAllowed());
    vi.spyOn(client, "getIssueLinks").mockResolvedValue({
      issueId: "BC-1",
      links: [
        {
          id: "L1",
          direction: "OUTWARD",
          linkType: { name: "Subtask", id: "lt-sub" },
          issue: { idReadable: "", id: "1-99", summary: "s" },
        },
      ],
    } as unknown as IssueLinksPayload);

    await expect(client.deleteIssueLink({ issueId: "BC-1", linkId: "L1" })).rejects.toThrow(
      /Cannot determine target issue id/,
    );
  });
});
