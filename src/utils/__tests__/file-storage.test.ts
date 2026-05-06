import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { processWithFileStorage } from "../file-storage.js";

describe("processWithFileStorage", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "yt-fs-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns data without writing when saveToFile is false", async () => {
    const result = await processWithFileStorage(
      { saveToFile: false },
      { id: 1 },
      root,
    );

    expect(result.data).toEqual({ id: 1 });
    expect(result.savedToFile).toBeUndefined();
    expect(result.savedTo).toBeUndefined();
  });

  it("rejects absolute filePath", async () => {
    await expect(
      processWithFileStorage(
        { saveToFile: true, filePath: "/etc/passwd", format: "json" },
        { id: 1 },
        root,
      ),
    ).rejects.toThrow(/absolute/i);
  });

  it("rejects path traversal", async () => {
    await expect(
      processWithFileStorage(
        { saveToFile: true, filePath: "../escape.json", format: "json" },
        { id: 1 },
        root,
      ),
    ).rejects.toThrow(/traversal|escapes/i);
  });

  it("writes JSON file inside root", async () => {
    const result = await processWithFileStorage(
      { saveToFile: true, filePath: "out.json", format: "json" },
      { hello: "world" },
      root,
    );

    expect(result.savedTo).toBeDefined();
    expect(result.savedTo?.startsWith(root)).toBe(true);
    expect(JSON.parse(readFileSync(result.savedTo!, "utf-8"))).toEqual({ hello: "world" });
  });

  it("writes JSON array when data is array", async () => {
    const result = await processWithFileStorage(
      { saveToFile: true, filePath: "arr.json", format: "json" },
      [{ a: 1 }, { a: 2 }],
      root,
    );

    expect(result.savedTo).toBeDefined();
    expect(JSON.parse(readFileSync(result.savedTo!, "utf-8"))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("writes JSONL when format is jsonl", async () => {
    const result = await processWithFileStorage(
      { saveToFile: true, filePath: "out.jsonl", format: "jsonl" },
      [{ a: 1 }, { a: 2 }],
      root,
    );

    expect(result.savedTo).toBeDefined();

    const content = readFileSync(result.savedTo!, "utf-8");
    const lines = content.split("\n").filter((l) => l.length > 0);

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ a: 1 });
    expect(JSON.parse(lines[1]!)).toEqual({ a: 2 });
  });

  it("rejects existing file without overwrite flag", async () => {
    await processWithFileStorage(
      { saveToFile: true, filePath: "exists.json", format: "json" },
      { v: 1 },
      root,
    );

    await expect(
      processWithFileStorage(
        { saveToFile: true, filePath: "exists.json", format: "json" },
        { v: 2 },
        root,
      ),
    ).rejects.toThrow(/already exists/i);
  });

  it("overwrites existing file when overwrite=true", async () => {
    await processWithFileStorage(
      { saveToFile: true, filePath: "rew.json", format: "json" },
      { v: 1 },
      root,
    );

    const result = await processWithFileStorage(
      { saveToFile: true, filePath: "rew.json", format: "json", overwrite: true },
      { v: 2 },
      root,
    );

    expect(JSON.parse(readFileSync(result.savedTo!, "utf-8"))).toEqual({ v: 2 });
  });

  it("auto-generates filename inside root when filePath is omitted", async () => {
    const result = await processWithFileStorage(
      { saveToFile: true, format: "json" },
      { auto: true },
      root,
    );

    expect(result.savedTo).toBeDefined();
    expect(result.savedTo?.startsWith(root)).toBe(true);
  });
});
