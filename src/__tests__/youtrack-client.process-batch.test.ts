import { describe, it, expect } from "vitest";

import { YoutrackClient } from "../youtrack-client.js";

interface PrivateBatchClient {
  processBatch: <T, R>(items: T[], proc: (i: T) => Promise<R>, limit?: number) => Promise<R[]>;
}

function asPrivate(c: YoutrackClient): PrivateBatchClient {
  return c as unknown as PrivateBatchClient;
}

const config = {
  baseUrl: "https://yt.test",
  token: "perm:test-token",
  timezone: "UTC",
  outputDir: "/tmp",
};

describe("processBatch", () => {
  it("returns results in original order", async () => {
    const c = asPrivate(new YoutrackClient(config));
    const results = await c.processBatch([1, 2, 3], async (n) => n * 10);

    expect(results).toEqual([10, 20, 30]);
  });

  it("respects concurrency limit", async () => {
    const c = asPrivate(new YoutrackClient(config));
    let inFlight = 0;
    let maxInFlight = 0;

    await c.processBatch(
      Array.from({ length: 12 }, (_, i) => i),
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
      },
      3,
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("rethrows a single error directly", async () => {
    const c = asPrivate(new YoutrackClient(config));
    const err = new Error("boom");

    await expect(
      c.processBatch([1], async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });

  it("aggregates multiple errors into AggregateError", async () => {
    const c = asPrivate(new YoutrackClient(config));
    let i = 0;
    let caught: unknown;

    try {
      await c.processBatch([1, 2, 3], async () => {
        i += 1;
        throw new Error(`fail ${i}`);
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(3);
  });

  it("does not return partial results when one job fails", async () => {
    const c = asPrivate(new YoutrackClient(config));

    await expect(
      c.processBatch([1, 2, 3], async (n) => {
        if (n === 2) {
          throw new Error("middle failure");
        }

        return n;
      }),
    ).rejects.toThrow(/middle failure/);
  });
});
