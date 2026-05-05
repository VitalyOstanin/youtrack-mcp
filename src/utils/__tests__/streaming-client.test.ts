import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { streamArrayToFile } from "../streaming-client.js";

const baseUrl = "http://yt.test";

describe("streamArrayToFile (jsonl)", () => {
  let root: string;

  beforeEach(() => {
    nock.cleanAll();
    root = mkdtempSync(join(tmpdir(), "yt-stream-"));
  });

  afterEach(() => {
    nock.cleanAll();
    rmSync(root, { recursive: true, force: true });
  });

  it("writes one JSON object per line", async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

    nock(baseUrl).get("/api/items").reply(200, JSON.stringify(items), {
      "content-type": "application/json",
    });

    const path = await streamArrayToFile(`${baseUrl}/api/items`, "items.jsonl", "perm:t", {
      rootDir: root,
      format: "jsonl",
    });
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toEqual({ id: 1 });
    expect(JSON.parse(lines[2])).toEqual({ id: 3 });
  });

  it("handles a 50-element array correctly", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));

    nock(baseUrl).get("/api/items").reply(200, JSON.stringify(items));

    const path = await streamArrayToFile(`${baseUrl}/api/items`, "many.jsonl", "perm:t", {
      rootDir: root,
      format: "jsonl",
    });
    const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);

    expect(lines).toHaveLength(50);
    expect(JSON.parse(lines[49])).toEqual({ id: 49 });
  });

  it("removes file on transport error", async () => {
    nock(baseUrl).get("/api/broken").replyWithError("boom");
    await expect(
      streamArrayToFile(`${baseUrl}/api/broken`, "broken.jsonl", "perm:t", {
        rootDir: root,
        format: "jsonl",
      }),
    ).rejects.toThrow();
    expect(existsSync(join(root, "broken.jsonl"))).toBe(false);
  });

  it("removes file on non-2xx status", async () => {
    nock(baseUrl).get("/api/forbidden").reply(403, "no");
    await expect(
      streamArrayToFile(`${baseUrl}/api/forbidden`, "forbidden.jsonl", "perm:t", {
        rootDir: root,
        format: "jsonl",
      }),
    ).rejects.toThrow(/HTTP 403/);
    expect(existsSync(join(root, "forbidden.jsonl"))).toBe(false);
  });

  it("rejects when target file already exists and overwrite is false", async () => {
    const target = join(root, "existing.jsonl");

    writeFileSync(target, "old");
    await expect(
      streamArrayToFile(`${baseUrl}/api/items`, "existing.jsonl", "perm:t", {
        rootDir: root,
        format: "jsonl",
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("streamArrayToFile (json passthrough)", () => {
  let root: string;

  beforeEach(() => {
    nock.cleanAll();
    root = mkdtempSync(join(tmpdir(), "yt-stream-json-"));
  });

  afterEach(() => {
    nock.cleanAll();
    rmSync(root, { recursive: true, force: true });
  });

  it("writes raw response body for format=json", async () => {
    const items = [{ id: 7 }];

    nock(baseUrl).get("/api/items").reply(200, JSON.stringify(items));

    const path = await streamArrayToFile(`${baseUrl}/api/items`, "items.json", "perm:t", {
      rootDir: root,
      format: "json",
    });
    const content = readFileSync(path, "utf-8");

    expect(JSON.parse(content)).toEqual(items);
  });
});
