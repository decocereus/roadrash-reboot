import { beforeAll, describe, expect, it } from "vitest";

import { createHost, VSYNC_MS } from "./hosts.ts";
import type { Host, HostOptions } from "./hosts.ts";

const RIDE_MS = 6000;
const LEAST_TICKS = 340;
const QUALITY_TIMEOUT_MS = 120_000;

const callbacksEvery = (gap: number): number[] =>
  Array.from(
    { length: Math.floor(RIDE_MS / gap) },
    (_, index) => (index + 1) * gap
  );

const rideThrough = (
  options: HostOptions,
  schedule: readonly number[],
  during?: (host: Host, at: number) => void
): Host => {
  const host = createHost(options);
  for (const [at, now] of schedule.entries()) {
    during?.(host, at);
    host.at(now);
  }
  return host;
};

const sharedTicks = (host: Host, reference: Host) => {
  const length = Math.min(host.digests.length, reference.digests.length);
  return {
    length,
    reference: reference.digests.slice(0, length),
    ridden: host.digests.slice(0, length),
  };
};

describe("render quality never changes the race", () => {
  let reference: Host;

  beforeAll(() => {
    reference = rideThrough({}, callbacksEvery(VSYNC_MS));
  }, QUALITY_TIMEOUT_MS);

  it("the reference ride steps one tick per 60 Hz frame", () => {
    expect(reference.digests.length).toBeGreaterThanOrEqual(LEAST_TICKS);
    expect(reference.quality.rung).toBe(0);
    expect(reference.seen.presents).toBeGreaterThan(LEAST_TICKS);
  });

  it(
    "a low rung renders less and rides the same ticks",
    () => {
      const low = rideThrough({ pinnedRung: 3 }, callbacksEvery(VSYNC_MS));
      const shared = sharedTicks(low, reference);
      expect(low.quality.rung).toBe(3);
      expect(low.seen.samples).toContain(0);
      expect(low.seen.shadowMaps).toContain(2048);
      expect(shared.length).toBeGreaterThanOrEqual(LEAST_TICKS);
      expect(shared.ridden).toStrictEqual(shared.reference);
    },
    QUALITY_TIMEOUT_MS
  );

  it(
    "slow frames step the governor down and ride the same ticks",
    () => {
      const slow = rideThrough({}, callbacksEvery(VSYNC_MS * 2));
      const shared = sharedTicks(slow, reference);
      expect(slow.quality.rung).toBeGreaterThan(0);
      expect(slow.seen.shadowMaps.length).toBeGreaterThan(0);
      expect(shared.length).toBeGreaterThanOrEqual(LEAST_TICKS);
      expect(shared.ridden).toStrictEqual(shared.reference);
    },
    QUALITY_TIMEOUT_MS
  );

  it(
    "pixel ratio 2, a mid-race drop to 1 and a canvas resize ride the same ticks",
    () => {
      const sharp = rideThrough({ dpr: 2 }, callbacksEvery(VSYNC_MS));
      const changed = rideThrough(
        { dpr: 2 },
        callbacksEvery(VSYNC_MS),
        (host, at) => {
          if (at === 120) {
            host.setDpr(1);
          }
          if (at === 200) {
            host.canvas.clientWidth = 800;
            host.canvas.clientHeight = 600;
            host.resize();
          }
        }
      );
      expect(sharp.seen.pixelRatios).toStrictEqual([2, 2]);
      expect(changed.seen.pixelRatios).toStrictEqual([2, 2, 1, 1]);
      expect(changed.seen.resizes).toStrictEqual([
        "1280x720@2",
        "1280x720@1",
        "800x600@1",
      ]);
      expect(sharedTicks(sharp, reference).ridden).toStrictEqual(
        sharedTicks(sharp, reference).reference
      );
      expect(sharedTicks(changed, reference).ridden).toStrictEqual(
        sharedTicks(changed, reference).reference
      );
    },
    QUALITY_TIMEOUT_MS
  );

  it(
    "a pinned rung at pixel ratio 2 sizes the canvas down and rides the same ticks",
    () => {
      const pinned = rideThrough(
        { dpr: 2, pinnedRung: 5 },
        callbacksEvery(VSYNC_MS)
      );
      const shared = sharedTicks(pinned, reference);
      expect(pinned.quality.pixelRatio).toBe(1.8);
      expect(pinned.seen.pixelRatios).toStrictEqual([2, 1.8]);
      expect(pinned.seen.sizes).toStrictEqual(["1280x720"]);
      expect(shared.ridden).toStrictEqual(shared.reference);
    },
    QUALITY_TIMEOUT_MS
  );

  it(
    "30 and 45 frames a second present fewer frames and ride the same ticks",
    () => {
      const thirty = rideThrough({}, callbacksEvery(VSYNC_MS), (host, at) => {
        if (at === 0) {
          host.frameRate("30");
        }
      });
      const fortyFive = rideThrough(
        { pinnedRefresh: 90 },
        callbacksEvery(1000 / 90)
      );
      expect(thirty.seen.presents).toBeLessThan(reference.seen.presents * 0.55);
      expect(fortyFive.seen.presents).toBeGreaterThan(260);
      expect(fortyFive.seen.presents).toBeLessThan(280);
      expect(sharedTicks(thirty, reference).ridden).toStrictEqual(
        sharedTicks(thirty, reference).reference
      );
      expect(sharedTicks(fortyFive, reference).ridden).toStrictEqual(
        sharedTicks(fortyFive, reference).reference
      );
    },
    QUALITY_TIMEOUT_MS
  );

  it(
    "sound and the profiler on ride the same ticks as both off",
    () => {
      const heard = rideThrough(
        { profiled: true, sounded: true },
        callbacksEvery(VSYNC_MS)
      );
      const shared = sharedTicks(heard, reference);
      expect(heard.seen.drives).toBeGreaterThan(LEAST_TICKS);
      expect(heard.seen.profiled).toBeGreaterThan(LEAST_TICKS);
      expect(reference.seen.drives).toBe(0);
      expect(shared.length).toBeGreaterThanOrEqual(LEAST_TICKS);
      expect(shared.ridden).toStrictEqual(shared.reference);
    },
    QUALITY_TIMEOUT_MS
  );
});
