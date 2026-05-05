import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nock from "nock";

import { downloadFileFromUrl, extractFilenameFromUrlOrHeader } from "../file-download.js";

describe("downloadFileFromUrl", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "yt-dl-"));
    nock.cleanAll();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    nock.cleanAll();
  });

  it("rejects absolute target paths", async () => {
    await expect(
      downloadFileFromUrl({
        url: "https://example.com/x",
        targetRel: "/etc/passwd",
        rootDir: root,
      }),
    ).rejects.toThrow(/absolute/i);
  });

  it("rejects path traversal", async () => {
    await expect(
      downloadFileFromUrl({
        url: "https://example.com/x",
        targetRel: "../escape",
        rootDir: root,
      }),
    ).rejects.toThrow(/traversal|escapes/i);
  });

  it("writes file inside root on success", async () => {
    nock("https://example.com").get("/file.txt").reply(200, "hello");

    const path = await downloadFileFromUrl({
      url: "https://example.com/file.txt",
      targetRel: "out.txt",
      rootDir: root,
    });

    expect(path.startsWith(root)).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe("hello");
  });

  it("removes partial file on stream error", async () => {
    nock("https://example.com").get("/broken").replyWithError("network down");

    await expect(
      downloadFileFromUrl({
        url: "https://example.com/broken",
        targetRel: "broken.bin",
        rootDir: root,
      }),
    ).rejects.toThrow();

    expect(existsSync(join(root, "broken.bin"))).toBe(false);
  });

  it("rejects existing file without overwrite", async () => {
    nock("https://example.com").get("/file.txt").reply(200, "hello");
    await downloadFileFromUrl({
      url: "https://example.com/file.txt",
      targetRel: "x.txt",
      rootDir: root,
    });

    nock("https://example.com").get("/file.txt").reply(200, "again");
    await expect(
      downloadFileFromUrl({
        url: "https://example.com/file.txt",
        targetRel: "x.txt",
        rootDir: root,
      }),
    ).rejects.toThrow(/already exists/i);
  });
});

describe("extractFilenameFromUrlOrHeader", () => {
  it("extracts from Content-Disposition", () => {
    expect(extractFilenameFromUrlOrHeader("https://example.com/x", 'attachment; filename="report.pdf"')).toBe(
      "report.pdf",
    );
  });

  it("falls back to URL path", () => {
    expect(extractFilenameFromUrlOrHeader("https://example.com/files/data.json")).toBe("data.json");
  });

  it("returns default when nothing usable", () => {
    expect(extractFilenameFromUrlOrHeader("not a url")).toBe("downloaded_file");
  });
});
