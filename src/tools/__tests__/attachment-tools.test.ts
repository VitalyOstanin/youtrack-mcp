import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nock from "nock";

import type { YoutrackClient } from "../../youtrack-client.js";
import { issueAttachmentDownloadHandler } from "../attachment-tools.js";

interface TextContent {
  type: "text";
  text: string;
}

function firstTextPayload(result: { content?: unknown[]; isError?: boolean }): {
  isError: boolean;
  parsed: Record<string, unknown>;
} {
  const content = (result.content ?? []) as TextContent[];
  const text = content[0]?.text ?? "{}";

  return {
    isError: Boolean(result.isError),
    parsed: JSON.parse(text) as Record<string, unknown>,
  };
}

function fakeClient(root: string, attachment: { name?: string; url?: string }, downloadUrl: string): Partial<YoutrackClient> {
  return {
    getOutputDir: () => root,
    getBaseUrl: () => "https://example.com",
    getAttachmentDownloadInfo: vi.fn().mockResolvedValue({
      attachment: {
        id: "1-1",
        name: attachment.name,
        url: attachment.url,
        size: 5,
      },
      downloadUrl,
      issueId: "BC-1",
    }),
  };
}

describe("issueAttachmentDownloadHandler safety", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "yt-att-"));
    nock.cleanAll();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    nock.cleanAll();
  });

  it("rejects absolute downloadPath", async () => {
    const client = fakeClient(root, { name: "ok.bin" }, "https://example.com/files/1-1");
    const result = await issueAttachmentDownloadHandler(client as YoutrackClient, {
      issueId: "BC-1",
      attachmentId: "1-1",
      downloadToFile: true,
      downloadPath: "/etc/poc",
    });
    const { isError, parsed } = firstTextPayload(result);

    expect(isError).toBe(true);
    expect(JSON.stringify(parsed)).toMatch(/absolute/i);
  });

  it("rejects traversal in downloadPath", async () => {
    const client = fakeClient(root, { name: "ok.bin" }, "https://example.com/files/1-1");
    const result = await issueAttachmentDownloadHandler(client as YoutrackClient, {
      issueId: "BC-1",
      attachmentId: "1-1",
      downloadToFile: true,
      downloadPath: "../escape.bin",
    });
    const { isError, parsed } = firstTextPayload(result);

    expect(isError).toBe(true);
    expect(JSON.stringify(parsed)).toMatch(/traversal|escapes/i);
  });

  it("ignores .. in attachment.name when generating default path and writes inside root", async () => {
    nock("https://example.com").get("/files/1-1").reply(200, "binary-content");

    const client = fakeClient(root, { name: "../../etc/passwd" }, "https://example.com/files/1-1");
    const result = await issueAttachmentDownloadHandler(client as YoutrackClient, {
      issueId: "BC-1",
      attachmentId: "1-1",
      downloadToFile: true,
    });
    const { isError, parsed } = firstTextPayload(result);

    expect(isError).toBe(false);

    const { savedTo } = parsed.payload as { savedTo: string };

    expect(savedTo.startsWith(root)).toBe(true);
    expect(savedTo.includes("etc/passwd")).toBe(false);
    expect(existsSync(savedTo)).toBe(true);
  });

  it("sanitizes weird characters in attachment.name", async () => {
    nock("https://example.com").get("/files/1-1").reply(200, "x");

    const client = fakeClient(root, { name: "weird name?<>.bin" }, "https://example.com/files/1-1");
    const result = await issueAttachmentDownloadHandler(client as YoutrackClient, {
      issueId: "BC-1",
      attachmentId: "1-1",
      downloadToFile: true,
    });
    const { isError, parsed } = firstTextPayload(result);

    expect(isError).toBe(false);

    const {savedTo} = (parsed.payload as { savedTo: string });

    expect(savedTo).toMatch(/issues\/BC-1\/weird_name___\.bin$/);
  });
});
