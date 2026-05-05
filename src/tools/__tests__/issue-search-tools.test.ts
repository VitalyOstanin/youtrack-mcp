import { describe, it, expect } from "vitest";

import { issuesSearchSchema, issuesSearchArgs } from "../issue-search-tools.js";

describe("issuesSearchArgs / issuesSearchSchema", () => {
  it("args object includes overwrite", () => {
    expect(issuesSearchArgs).toHaveProperty("overwrite");
  });

  it("schema accepts overwrite and applies defaults", () => {
    const parsed = issuesSearchSchema.parse({ overwrite: true });

    expect(parsed.overwrite).toBe(true);
    expect(parsed.limit).toBe(50);
    expect(parsed.skip).toBe(0);
  });

  it("schema parses an empty object via .default", () => {
    const parsed = issuesSearchSchema.parse(undefined);

    expect(parsed.limit).toBe(50);
    expect(parsed.skip).toBe(0);
  });

  it("schema is in sync with args (no missing keys)", () => {
    const argKeys = Object.keys(issuesSearchArgs).sort();
    const inner = issuesSearchSchema.removeDefault();
    const schemaKeys = Object.keys(inner.shape).sort();

    expect(schemaKeys).toEqual(argKeys);
  });
});
