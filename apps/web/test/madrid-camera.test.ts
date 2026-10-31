import { bikes } from "@racer/sim/bikes";
import {
  createRace,
  defaultSetup,
  emptyFrame,
  stepRace,
} from "@racer/sim/race";
import { player } from "@racer/sim/race-fixtures";
import { TICK_RATE } from "@racer/sim/state";
import { roadAtLevel, roadIds } from "@racer/track/road";
import { roads } from "@racer/track/roads";
import { stretches, stretchIds } from "@racer/track/stretches";
import { compileTrack } from "@racer/track/track";
import type { Track, TrackPlan } from "@racer/track/track";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createChaseCamera } from "../src/game/chase-camera.ts";

const SECONDS = 1 / TICK_RATE;
const SETTLE_TICKS = TICK_RATE * 2;
const STRAIGHT_REACH_M = 50;
const STRAIGHT_TURN = 0.05;
const STRAIGHT_CURVATURE = 1 / 100;
const WOBBLE_REACH = TICK_RATE / 2;
const RIDE_LIMIT = TICK_RATE * 400;
const LEAST_STRAIGHT_SECONDS = 3;

interface Steadiness {
  readonly finished: boolean;
  readonly straightSeconds: number;
  readonly heightAcceleration: number;
  readonly yawWobble: number;
}

const rms = (values: readonly number[]): number =>
  Math.sqrt(
    values.reduce((total, value) => total + value * value, 0) /
      Math.max(1, values.length)
  );

const isStraight = (track: Track, s: number): boolean => {
  const at = Math.round(s - track.startS);
  const from = Math.max(0, at - STRAIGHT_REACH_M);
  const to = Math.min(track.sampleCount - 1, at + STRAIGHT_REACH_M);
  let tightest = 0;
  for (let sample = from; sample <= to; sample += 1) {
    tightest = Math.max(tightest, Math.abs(track.curvature[sample] ?? 0));
  }
  return (
    Math.abs((track.heading[to] ?? 0) - (track.heading[from] ?? 0)) <
      STRAIGHT_TURN && tightest < STRAIGHT_CURVATURE
  );
};

const wobble = (values: readonly number[], keep: readonly boolean[]) => {
  const kept: number[] = [];
  for (let at = WOBBLE_REACH; at < values.length - WOBBLE_REACH; at += 1) {
    if (keep[at] === true) {
      let sum = 0;
      for (let near = at - WOBBLE_REACH; near <= at + WOBBLE_REACH; near += 1) {
        sum += values[near] ?? 0;
      }
      kept.push((values[at] ?? 0) - sum / (2 * WOBBLE_REACH + 1));
    }
  }
  return rms(kept);
};

const steadinessOn = (
  plan: TrackPlan,
  bikeId: keyof typeof bikes
): Steadiness => {
  const track = compileTrack({ ...plan, trafficPerKilometre: 0 });
  const setup = defaultSetup(track, 31);
  const race = createRace({
    ...setup,
    player: { ...setup.player, bike: bikes[bikeId], controller: "pilot" },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
  const rider = player(race);
  const chase = createChaseCamera();
  const subject = { air: 0, s: 0, speed: 0, tuck: 0, x: 0 };
  const heights: number[] = [];
  const yaws: number[] = [];
  const straight: boolean[] = [];
  for (let tick = 0; tick < RIDE_LIMIT && rider.finishTick < 0; tick += 1) {
    stepRace(race, track, emptyFrame);
    subject.s = rider.s;
    subject.x = rider.x;
    subject.air = rider.air;
    subject.speed = rider.speed;
    subject.tuck = rider.tuck;
    chase.update(track, subject, SECONDS);
    if (tick >= SETTLE_TICKS) {
      heights.push(chase.camera.position.y);
      yaws.push(chase.camera.rotation.y);
      straight.push(isStraight(track, rider.s));
    }
  }
  const heightAccelerations: number[] = [];
  const yawAccelerations: number[] = [];
  for (let at = 1; at < heights.length - 1; at += 1) {
    const height =
      (heights[at + 1] ?? 0) - 2 * (heights[at] ?? 0) + (heights[at - 1] ?? 0);
    const yaw = (yaws[at + 1] ?? 0) - 2 * (yaws[at] ?? 0) + (yaws[at - 1] ?? 0);
    if (straight[at] === true) {
      heightAccelerations.push(height / SECONDS ** 2);
    }
    yawAccelerations.push(yaw / SECONDS ** 2);
  }
  return {
    finished: rider.finishTick >= 0,
    heightAcceleration: rms(heightAccelerations),
    straightSeconds: heightAccelerations.length * SECONDS,
    yawWobble: wobble(yawAccelerations, straight.slice(1, -1)),
  };
};

describe("the chase camera on the Madrid stretches", () => {
  beforeAll(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it.each(
    stretchIds.flatMap((id) =>
      (["ostra-sesta-600", "halden-wren-400"] as const).map(
        (bikeId) => [id, bikeId] as const
      )
    )
  )(
    "holds %s as steady on the straights as the shakiest existing road, on the %s",
    (id, bikeId) => {
      const existing = roadIds.map((roadId) =>
        steadinessOn(roadAtLevel(roads[roadId], 1), bikeId)
      );
      const stretch = steadinessOn(stretches[id], bikeId);
      for (const ride of [...existing, stretch]) {
        expect(ride.finished).toBeTruthy();
        expect(ride.straightSeconds).toBeGreaterThanOrEqual(
          LEAST_STRAIGHT_SECONDS
        );
      }
      expect(stretch.heightAcceleration).toBeLessThanOrEqual(
        Math.max(...existing.map((road) => road.heightAcceleration))
      );
      expect(stretch.yawWobble).toBeLessThanOrEqual(
        Math.max(...existing.map((road) => road.yawWobble))
      );
    }
  );
});
