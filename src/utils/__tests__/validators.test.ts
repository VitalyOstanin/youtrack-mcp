import { describe, it, expect } from "vitest";

import {
  issueIdSchema,
  attachmentIdSchema,
  commentIdSchema,
  workItemIdSchema,
  linkIdSchema,
  customFieldIdSchema,
  projectIdSchema,
  userLoginSchema,
  yqlIdentifierSchema,
  yqlQuerySchema,
} from "../validators.js";

describe("issueIdSchema", () => {
  it("accepts conventional issue ids", () => {
    expect(issueIdSchema.parse("BC-123")).toBe("BC-123");
    expect(issueIdSchema.parse("ABC123-9999")).toBe("ABC123-9999");
  });

  it("accepts numeric-only issue ids", () => {
    expect(issueIdSchema.parse("123")).toBe("123");
  });

  it("rejects empty strings", () => {
    expect(() => issueIdSchema.parse("")).toThrow();
  });

  it("rejects ids with /, ?, #", () => {
    expect(() => issueIdSchema.parse("BC-1/comments")).toThrow();
    expect(() => issueIdSchema.parse("BC-1?fields=x")).toThrow();
    expect(() => issueIdSchema.parse("BC-1#frag")).toThrow();
  });

  it("rejects NUL bytes", () => {
    expect(() => issueIdSchema.parse("BC-1\x00")).toThrow();
  });
});

describe("attachment/comment/workitem/link id schemas", () => {
  it("accept alnum and dot/dash/underscore", () => {
    expect(attachmentIdSchema.parse("1-1")).toBe("1-1");
    expect(commentIdSchema.parse("4-12")).toBe("4-12");
    expect(workItemIdSchema.parse("4-12345")).toBe("4-12345");
    expect(linkIdSchema.parse("99-1")).toBe("99-1");
    expect(customFieldIdSchema.parse("11-22")).toBe("11-22");
  });

  it("reject /, ?, #, NUL in attachment id", () => {
    expect(() => attachmentIdSchema.parse("1-1/foo")).toThrow();
    expect(() => attachmentIdSchema.parse("1-1?bar")).toThrow();
    expect(() => attachmentIdSchema.parse("1-1#frag")).toThrow();
    expect(() => attachmentIdSchema.parse("1-1\x00")).toThrow();
  });

  it("reject empty strings", () => {
    expect(() => attachmentIdSchema.parse("")).toThrow();
    expect(() => commentIdSchema.parse("")).toThrow();
    expect(() => workItemIdSchema.parse("")).toThrow();
    expect(() => linkIdSchema.parse("")).toThrow();
  });
});

describe("projectIdSchema", () => {
  it("accepts alnum + underscore + dash", () => {
    expect(projectIdSchema.parse("BC")).toBe("BC");
    expect(projectIdSchema.parse("Some_project-1")).toBe("Some_project-1");
  });

  it("rejects spaces and slashes", () => {
    expect(() => projectIdSchema.parse("a b")).toThrow();
    expect(() => projectIdSchema.parse("a/b")).toThrow();
  });
});

describe("userLoginSchema", () => {
  it("accepts logins with dots, dashes, @ and underscores", () => {
    expect(userLoginSchema.parse("john.doe")).toBe("john.doe");
    expect(userLoginSchema.parse("admin_1")).toBe("admin_1");
    expect(userLoginSchema.parse("user@example.com")).toBe("user@example.com");
  });

  it("rejects spaces and slashes", () => {
    expect(() => userLoginSchema.parse("john doe")).toThrow();
    expect(() => userLoginSchema.parse("a/b")).toThrow();
  });
});

describe("yqlIdentifierSchema", () => {
  it("accepts plain values, including spaces and unicode", () => {
    expect(yqlIdentifierSchema.parse("Open")).toBe("Open");
    expect(yqlIdentifierSchema.parse("In Progress")).toBe("In Progress");
    expect(yqlIdentifierSchema.parse("Кор")).toBe("Кор");
  });

  it("rejects { and } so callers can safely wrap as {value}", () => {
    expect(() => yqlIdentifierSchema.parse("foo}")).toThrow();
    expect(() => yqlIdentifierSchema.parse("{foo")).toThrow();
  });

  it("rejects control characters and empty strings", () => {
    expect(() => yqlIdentifierSchema.parse("a\x00b")).toThrow();
    expect(() => yqlIdentifierSchema.parse("a\nb")).toThrow();
    expect(() => yqlIdentifierSchema.parse("")).toThrow();
  });
});

describe("yqlQuerySchema", () => {
  it("accepts free-text YQL with multi-word value braces", () => {
    expect(yqlQuerySchema.parse("tag: {Technical debt}")).toBe("tag: {Technical debt}");
    expect(yqlQuerySchema.parse("State: {In Progress} #Unresolved")).toBe(
      "State: {In Progress} #Unresolved",
    );
    expect(
      yqlQuerySchema.parse(
        "tag: {Technical debt}, {Technical task} State: -Done",
      ),
    ).toBe("tag: {Technical debt}, {Technical task} State: -Done");
  });

  it("accepts empty queries", () => {
    expect(yqlQuerySchema.parse("")).toBe("");
  });

  it("rejects control characters", () => {
    expect(() => yqlQuerySchema.parse("foo\x00bar")).toThrow();
    expect(() => yqlQuerySchema.parse("foo\x07bar")).toThrow();
    expect(() => yqlQuerySchema.parse("foo\x7Fbar")).toThrow();
  });
});
