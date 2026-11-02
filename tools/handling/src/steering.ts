import {
  createRace,
  defaultSetup,
  emptyFrame,
  stepRace,
} from "@racer/sim/race";
import { TICK_RATE } from "@racer/sim/state";
import type { Track } from "@racer/track/track";

import type { Bend } from "./bends.ts";
import { bike, playerOf, RIDE_SEED } from "./course.ts";

const STEER_DEADBAND = 0.02;
const ACTIVE_STEER = 0.05;
const TICK_CAP = 20 * 60 * TICK_RATE;

export const fields = ["full", "alone"] as const;
export type Field = (typeof fields)[number];

export interface Steering {
  readonly field: Field;
  readonly km: number;
  readonly finished: boolean;
  readonly crashes: number;
  readonly ticks: number;
  readonly steerTravelPerKm: number;
  readonly reversalsPerKm: number;
  readonly cornerActiveShare: number;
  readonly straightActiveShare: number;
  readonly cornerMeanAbsSteer: number;
}

export const pilotSteering = (
  track: Track,
  bends: readonly Bend[],
  field: Field
): Steering => {
  const setup = defaultSetup(track, RIDE_SEED);
  const quiet =
    field === "alone"
      ? { police: { ...setup.police, count: 0 }, rivals: [] }
      : { police: setup.police, rivals: setup.rivals };
  const state = createRace({
    ...setup,
    ...quiet,
    player: { ...setup.player, bike, controller: "pilot" },
  });
  const rider = playerOf(state);
  const startS = rider.s;
  let travel = 0;
  let reversals = 0;
  let lastSteer: number | null = null;
  let lastSign = 0;
  let cornerTicks = 0;
  let cornerActive = 0;
  let cornerAbs = 0;
  let straightTicks = 0;
  let straightActive = 0;
  for (let tick = 0; tick < TICK_CAP && rider.finishTick < 0; tick += 1) {
    stepRace(state, track, emptyFrame);
    if (rider.mode !== "riding" || rider.airborne) {
      lastSteer = null;
    } else {
      const { steer } = rider.input;
      travel += lastSteer === null ? 0 : Math.abs(steer - lastSteer);
      lastSteer = steer;
      if (Math.abs(steer) > STEER_DEADBAND) {
        const sign = Math.sign(steer);
        reversals += lastSign !== 0 && sign !== lastSign ? 1 : 0;
        lastSign = sign;
      }
      const active = Math.abs(steer) > ACTIVE_STEER ? 1 : 0;
      if (bends.some((bend) => rider.s >= bend.from && rider.s < bend.to)) {
        cornerTicks += 1;
        cornerActive += active;
        cornerAbs += Math.abs(steer);
      } else {
        straightTicks += 1;
        straightActive += active;
      }
    }
  }
  const km = (rider.s - startS) / 1000;
  return {
    cornerActiveShare: cornerTicks > 0 ? cornerActive / cornerTicks : 0,
    cornerMeanAbsSteer: cornerTicks > 0 ? cornerAbs / cornerTicks : 0,
    crashes: rider.crashes,
    field,
    finished: rider.finishTick >= 0,
    km,
    reversalsPerKm: reversals / km,
    steerTravelPerKm: travel / km,
    straightActiveShare: straightTicks > 0 ? straightActive / straightTicks : 0,
    ticks: state.tick,
  };
};
