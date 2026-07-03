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
  post: (...args: unknown[]) => Promise<unknown>;
}

function getHttp(client: YoutrackClient): AxiosLike {
  return (client as unknown as { http: AxiosLike }).http;
}

function badRequest(): unknown {
  return {
    isAxiosError: true,
    message: "Request failed with status code 400",
    response: { status: 400, data: { error_description: "no such type" } },
  };
}

describe("changeIssueType", () => {
  it("posts a SingleEnum customFields payload and returns previous/new type", async () => {
    const client = new YoutrackClient(config);
    const http = getHttp(client);

    vi.spyOn(client, "getIssueCustomFields").mockResolvedValue([
      {
        id: "f-type",
        name: "Type",
        $type: "SingleEnumIssueCustomField",
        value: { id: "v-bug", name: "Bug" },
      },
    ]);

    let captured: { url: string; body: Record<string, unknown> } | undefined;

    vi.spyOn(http, "post").mockImplementation((...args: unknown[]) => {
      captured = { url: String(args[0]), body: args[1] as Record<string, unknown> };

      return Promise.resolve({ data: {} });
    });

    const result = await client.changeIssueType({ issueId: "BC-1", typeName: "Task" });

    expect(captured?.url).toBe("/api/issues/BC-1");

    const customFields = captured?.body.customFields as Array<Record<string, unknown>>;

    expect(customFields[0]).toMatchObject({
      name: "Type",
      $type: "SingleEnumIssueCustomField",
      value: { name: "Task", $type: "EnumBundleElement" },
    });
    expect(result).toMatchObject({ issueId: "BC-1", previousType: "Bug", newType: "Task" });
  });

  it("wraps a 400 response in a descriptive error", async () => {
    const client = new YoutrackClient(config);
    const http = getHttp(client);

    vi.spyOn(client, "getIssueCustomFields").mockResolvedValue([
      { id: "f-type", name: "Type", $type: "SingleEnumIssueCustomField", value: { name: "Bug" } },
    ]);
    vi.spyOn(http, "post").mockRejectedValue(badRequest());

    await expect(client.changeIssueType({ issueId: "BC-1", typeName: "Nope" })).rejects.toThrow(
      /Failed to set type to 'Nope'.*may not exist/,
    );
  });
});
