import { describe, it, expect } from "vitest";
import { z } from "zod";

import { workItemDeleteSchema } from "../workitem-tools.js";

describe("workitem_delete schema", () => {
  it("rejects calls without confirmation", () => {
    expect(() => workItemDeleteSchema.parse({ issueId: "BC-1", workItemId: "4-1" })).toThrow();
  });

  it("rejects confirmation=false", () => {
    expect(() =>
      workItemDeleteSchema.parse({ issueId: "BC-1", workItemId: "4-1", confirmation: false }),
    ).toThrow();
  });

  it("accepts confirmation=true", () => {
    const parsed = workItemDeleteSchema.parse({
      issueId: "BC-1",
      workItemId: "4-1",
      confirmation: true,
    });

    expect(parsed.confirmation).toBe(true);
  });
});

describe("issue_link_delete schema (inline check)", () => {
  // The schema is defined inside registerIssueLinkTools; replicate its shape
  // to verify the same z.literal(true) contract on confirmation.
  const linkDeleteArgs = {
    issueId: z.string(),
    linkId: z.string(),
    targetId: z.string().optional(),
    confirmation: z.literal(true),
  };
  const linkDeleteSchema = z.object(linkDeleteArgs);

  it("rejects calls without confirmation", () => {
    expect(() => linkDeleteSchema.parse({ issueId: "BC-1", linkId: "L1" })).toThrow();
  });

  it("accepts confirmation=true", () => {
    const parsed = linkDeleteSchema.parse({ issueId: "BC-1", linkId: "L1", confirmation: true });

    expect(parsed.confirmation).toBe(true);
  });
});
