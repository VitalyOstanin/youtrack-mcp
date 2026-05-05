import { describe, it, expect } from "vitest";
import type { AxiosInstance } from "axios";

import { YoutrackClient } from "../youtrack-client.js";

const baseConfig = {
  baseUrl: "https://yt.test",
  token: "perm:test-token",
  timezone: "UTC",
  outputDir: "/tmp",
};

describe("YoutrackClient HTTP defaults", () => {
  it("configures axios timeout to 30 seconds", () => {
    const client = new YoutrackClient(baseConfig);
    const {http} = (client as unknown as { http: AxiosInstance });

    expect(http.defaults.timeout).toBe(30_000);
  });

  it("disables redirects to avoid silent host changes", () => {
    const client = new YoutrackClient(baseConfig);
    const {http} = (client as unknown as { http: AxiosInstance });

    expect(http.defaults.maxRedirects).toBe(0);
  });

  it("caps response body at 50 MiB", () => {
    const client = new YoutrackClient(baseConfig);
    const {http} = (client as unknown as { http: AxiosInstance });

    expect(http.defaults.maxContentLength).toBe(50 * 1024 * 1024);
    expect(http.defaults.maxBodyLength).toBe(50 * 1024 * 1024);
  });
});
