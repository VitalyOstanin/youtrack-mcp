import { describe, it, expect, vi } from "vitest";

import { YoutrackClient } from "../youtrack-client.js";

const baseConfig = {
  baseUrl: "https://yt.test",
  token: "perm:test",
  outputDir: "/tmp",
  timezone: "UTC",
};

interface AxiosLike {
  get: (...args: unknown[]) => Promise<unknown>;
}

function getHttp(client: YoutrackClient): AxiosLike {
  return (client as unknown as { http: AxiosLike }).http;
}

describe("listProjects single-flight (auto-paginated)", () => {
  it("issues a single HTTP request for parallel callers", async () => {
    const client = new YoutrackClient(baseConfig);
    const get = vi.spyOn(getHttp(client), "get").mockResolvedValue({
      data: [
        { id: "0-0", shortName: "BC", name: "Base" },
        { id: "0-1", shortName: "AB", name: "Alpha" },
      ],
    });
    const [a, b, c] = await Promise.all([
      client.listProjects(),
      client.listProjects(),
      client.listProjects(),
    ]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(a.projects).toHaveLength(2);
    expect(b.projects).toHaveLength(2);
    expect(c.projects).toHaveLength(2);
  });

  it("serves subsequent calls from cache without hitting the network again", async () => {
    const client = new YoutrackClient(baseConfig);
    const get = vi.spyOn(getHttp(client), "get").mockResolvedValue({
      data: [{ id: "0-0", shortName: "BC", name: "Base" }],
    });

    await client.listProjects();
    await client.listProjects();
    await client.listProjects();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does NOT use single-flight when explicit limit/skip is set", async () => {
    const client = new YoutrackClient(baseConfig);
    const get = vi.spyOn(getHttp(client), "get").mockResolvedValue({
      data: [{ id: "0-0", shortName: "BC", name: "Base" }],
    });

    await Promise.all([
      client.listProjects({ limit: 5 }),
      client.listProjects({ limit: 5 }),
    ]);

    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("listLinkTypes single-flight", () => {
  it("issues a single HTTP request for parallel callers", async () => {
    const client = new YoutrackClient(baseConfig);
    const get = vi.spyOn(getHttp(client), "get").mockResolvedValue({
      data: [
        { id: "1", name: "Subtask", directed: true },
        { id: "2", name: "Relates", directed: false },
      ],
    });
    const [a, b, c] = await Promise.all([
      client.listLinkTypes(),
      client.listLinkTypes(),
      client.listLinkTypes(),
    ]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(a.types).toHaveLength(2);
    expect(b.types).toHaveLength(2);
    expect(c.types).toHaveLength(2);
  });

  it("serves subsequent calls from cache", async () => {
    const client = new YoutrackClient(baseConfig);
    const get = vi.spyOn(getHttp(client), "get").mockResolvedValue({
      data: [{ id: "1", name: "Subtask", directed: true }],
    });

    await client.listLinkTypes();
    await client.listLinkTypes();

    expect(get).toHaveBeenCalledTimes(1);
  });
});
