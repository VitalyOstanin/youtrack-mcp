import { describe, it, expect } from "vitest";
import { z } from "zod";

import { articlesSearchArgs } from "../article-search-tools.js";

const schema = z.object(articlesSearchArgs);

describe("articles_search input validation", () => {
  it("rejects '}' in query", () => {
    expect(() => schema.parse({ query: "abc}foo" })).toThrow();
  });

  it("rejects '{' in query", () => {
    expect(() => schema.parse({ query: "abc{foo" })).toThrow();
  });

  it("rejects '}' in projectId via projectIdSchema regex", () => {
    expect(() => schema.parse({ query: "abc", projectId: "BC}" })).toThrow();
  });

  it("rejects '{' in parentArticleId via articleIdSchema regex", () => {
    expect(() => schema.parse({ query: "abc", parentArticleId: "{1-1}" })).toThrow();
  });

  it("accepts a valid input", () => {
    const parsed = schema.parse({
      query: "API token",
      projectId: "BC",
      parentArticleId: "1-2",
      limit: 10,
      skip: 5,
    });

    expect(parsed.query).toBe("API token");
    expect(parsed.projectId).toBe("BC");
    expect(parsed.parentArticleId).toBe("1-2");
  });
});
