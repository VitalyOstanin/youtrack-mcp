import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { resolveOutputPath, sanitizeFilename, UnsafePathError } from "../path-safety.js";

describe("resolveOutputPath", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-mcp-test-"));

  it("resolves a relative path inside root", () => {
    const result = resolveOutputPath("foo/bar.txt", { rootDir: root });

    expect(result).toBe(`${root}${sep}foo${sep}bar.txt`);
  });

  it("rejects absolute paths", () => {
    expect(() => resolveOutputPath("/etc/passwd", { rootDir: root })).toThrow(UnsafePathError);
  });

  it("rejects paths starting with ..", () => {
    expect(() => resolveOutputPath("../escape", { rootDir: root })).toThrow(UnsafePathError);
  });

  it("rejects paths with .. segment in the middle", () => {
    expect(() => resolveOutputPath("foo/../../bar", { rootDir: root })).toThrow(UnsafePathError);
  });

  it("rejects empty string", () => {
    expect(() => resolveOutputPath("", { rootDir: root })).toThrow(UnsafePathError);
  });

  it("rejects NUL bytes", () => {
    expect(() => resolveOutputPath("foo\x00bar", { rootDir: root })).toThrow(UnsafePathError);
  });

  it("accepts deeply nested relative path", () => {
    const result = resolveOutputPath("a/b/c/d.txt", { rootDir: root });

    expect(result.startsWith(root + sep)).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  it("strips control characters", () => {
    expect(sanitizeFilename("foo\x01bar.txt")).toBe("foobar.txt");
  });

  it("replaces unsafe characters with underscore", () => {
    expect(sanitizeFilename("a/b\\c?d.txt")).toBe("c_d.txt");
  });

  it("uses basename", () => {
    expect(sanitizeFilename("/tmp/etc/passwd")).toBe("passwd");
  });

  it("returns 'unnamed' for empty result", () => {
    expect(sanitizeFilename("")).toBe("unnamed");
  });

  it("preserves dots, hyphens, underscores", () => {
    expect(sanitizeFilename("foo-bar_baz.tar.gz")).toBe("foo-bar_baz.tar.gz");
  });
});
