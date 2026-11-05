import { TICK_SECONDS } from "@racer/sim/state";
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

const acceptedTicks = (host: Host): number =>
  host.frame.last / 1000 / TICK_SECONDS;

const expectProgress = (host: Host) => {
  const ticks = host.digests.length;
  const accepted = acceptedTicks(host);
  expect(ticks, "completed ticks").toBeGreaterThanOrEqual(LEAST_TICKS);
  expect(ticks, "completed ticks for the accepted time").toBeGreaterThanOrEqual(
    accepted - 1
  );
  expect(ticks, "completed ticks for the accepted time").toBeLessThanOrEqual(
    accepted
  );
};

type Callbacks = "reference" | "own";

const expectSameRace = (host: Host, reference: Host, callbacks: Callbacks) => {
  expectProgress(host);
  if (callbacks === "reference") {
    expect(host.digests, "completed ticks against the reference").toHaveLength(
      reference.digests.length
    );
  }
  const length = Math.min(host.digests.length, reference.digests.length);
  expect(host.digests.slice(0, length)).toStrictEqual(
    reference.digests.slice(0, length)
  );
};

describe("render quality never changes the race", () => {
  let reference: Host;

  beforeAll(() => {
    reference = rideThrough({}, callbacksEvery(VSYNC_MS));
  }, QUALITY_TIMEOUT_MS);

  it("the reference ride steps one tick per 60 Hz frame", () => {
    expectProgress(reference);
    expect(reference.quality.preset.id).toBe("full");
    expect(reference.seen.presents).toBeGreaterThan(LEAST_TICKS);
  });

  it(
    "the lean preset draws fewer pixels and rides the same ticks",
    () => {
      const lean = rideThrough(
        { dpr: 2, pinnedPreset: "lean" },
        callbacksEvery(VSYNC_MS)
      );
      expect(lean.quality.preset.samples).toBe(0);
      expect(lean.quality.preset.shadowMap).toBe(2048);
      expect(lean.quality.pixelRatio).toBeCloseTo(1.05, 5);
      expectSameRace(lean, reference, "reference");
    },
    QUALITY_TIMEOUT_MS
  );

  it(
    "slow frames change nothing about the picture and ride the same ticks",
    () => {
      const slow = rideThrough({}, callbacksEvery(VSYNC_MS * 2));
      expect(slow.quality.preset.id).toBe("full");
      expect(slow.quality.pixelRatio).toBe(1);
      expect(slow.quality.pace).toBe(60);
      expect(slow.seen.resizes).toStrictEqual(["1280x720@1"]);
      expectSameRace(slow, reference, "own");
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
      expectSameRace(sharp, reference, "reference");
      expectSameRace(changed, reference, "reference");
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
      expectSameRace(thirty, reference, "own");
      expectSameRace(fortyFive, reference, "own");
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
      expect(heard.seen.drives).toBeGreaterThan(LEAST_TICKS);
      expect(heard.seen.profiled).toBeGreaterThan(LEAST_TICKS);
      expect(reference.seen.drives).toBe(0);
      expectSameRace(heard, reference, "reference");
    },
    QUALITY_TIMEOUT_MS
  );

  it.each([
    ["ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified)", "full"],
    [
      "ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650 Ti, OpenGL 4.6)",
      "full",
    ],
    ["ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified)", "balanced"],
    ["Apple GPU", "balanced"],
    [
      "ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)",
      "lean",
    ],
    ["ANGLE (AMD, AMD Radeon Graphics, OpenGL 4.6)", "lean"],
    [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)",
      "lean",
    ],
    ["", "lean"],
  ])("the renderer %j starts on the %s preset", (gpu, preset) => {
    expect(createHost({ gpu }).quality.preset.id).toBe(preset);
  });
});
