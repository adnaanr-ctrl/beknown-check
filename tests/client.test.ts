import { describe, expect, it } from "vitest";
import { runPool } from "@/lib/client";

describe("runPool", () => {
  it("runs every item and keeps result order", async () => {
    const out = await runPool([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });
  it("never has more than `limit` tasks in flight", async () => {
    let live = 0;
    let peak = 0;
    await runPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });
  it("stops starting new tasks once shouldStop is true", async () => {
    let started = 0;
    let stop = false;
    await runPool(
      Array.from({ length: 12 }, (_, i) => i),
      4,
      async () => {
        started++;
        stop = true; // simulates "Start over" being clicked while the first calls run
        await new Promise((r) => setTimeout(r, 5));
      },
      () => stop,
    );
    expect(started).toBeLessThanOrEqual(4);
  });
});
