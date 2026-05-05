import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loadConfig, enrichConfigWithRedaction } from "../config.js";

describe("loadConfig", () => {
  let tmp: string;
  const oldEnv = { ...process.env };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "yt-cfg-"));
    process.env = {
      YOUTRACK_URL: "https://yt.example.com",
      YOUTRACK_TOKEN: "perm:test-token",
    };
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    process.env = { ...oldEnv };
  });

  it("uses cwd by default for outputDir", () => {
    const cfg = loadConfig();

    expect(cfg.outputDir).toBe(resolve(process.cwd()));
  });

  it("honors YOUTRACK_OUTPUT_DIR", () => {
    process.env.YOUTRACK_OUTPUT_DIR = tmp;

    const cfg = loadConfig();

    expect(cfg.outputDir).toBe(resolve(tmp));
  });

  it("creates outputDir if missing", () => {
    const sub = join(tmp, "missing-subdir");

    process.env.YOUTRACK_OUTPUT_DIR = sub;
    loadConfig();
    expect(existsSync(sub)).toBe(true);
  });

  it("throws when YOUTRACK_TOKEN is missing", () => {
    delete process.env.YOUTRACK_TOKEN;
    expect(() => loadConfig()).toThrow();
  });

  it("redacts token via enrichConfigWithRedaction", () => {
    const cfg = loadConfig();
    const redacted = enrichConfigWithRedaction(cfg);

    expect(redacted.hasToken).toBe(true);
    expect((redacted as Record<string, unknown>).token).toBeUndefined();
    expect(redacted.outputDir).toBe(cfg.outputDir);
  });
});
