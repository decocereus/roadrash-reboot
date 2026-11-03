import { stepRace } from "@racer/sim/race";
import { approach, curvePushOf, TICK_RATE } from "@racer/sim/state";
import type { BikeSpec } from "@racer/sim/state";
import { compileTrack, curvatureAt } from "@racer/track/track";
import type { Track, TrackPlan } from "@racer/track/track";

import { aloneRace, frameFor, KMH, playerOf, quietPlan } from "./course.ts";

const PROBE_SPEED = 190 / KMH;
const PROBE_TICKS = 3 * TICK_RATE;
const REACTION_TICKS = 15;
const DECISION_TICKS = 9;
const FORESIGHT_SECONDS = 0.65;
const CORRECTS_AT = 0.32;
const KEY_ATTACK = 9;
const KEY_RELEASE = 18;

interface Held {
  readonly widest: number;
  readonly offRoadSeconds: number;
}

export interface StagedRide {
  readonly bike: string;
  readonly course: string;
  readonly at: number;
  readonly centred: Held;
  readonly reacting: Held;
  readonly presses: number;
}

export const compileQuiet = (plan: TrackPlan): Track =>
  compileTrack(quietPlan(plan));

interface Seen {
  readonly x: number;
  readonly drift: number;
}

const ridden = (
  track: Track,
  on: BikeSpec,
  at: number,
  reacts: boolean
): Held & { readonly presses: number } => {
  const race = aloneRace(track, on);
  const rider = playerOf(race);
  rider.s = at;
  rider.bodyS = at;
  rider.speed = PROBE_SPEED;
  const line = rider.x;
  const seen: Seen[] = [];
  const input = {
    brake: 0,
    kick: false,
    punch: false,
    remount: false,
    steer: 0,
    throttle: 1,
  };
  let key = 0;
  let presses = 0;
  let widest = 0;
  let offRoadTicks = 0;
  for (let tick = 0; tick < PROBE_TICKS; tick += 1) {
    if (reacts && tick % DECISION_TICKS === 0) {
      const sight = seen[Math.max(0, tick - 1 - REACTION_TICKS)];
      const heading =
        (sight?.x ?? line) - line + (sight?.drift ?? 0) * FORESIGHT_SECONDS;
      const wanted = Math.abs(heading) > CORRECTS_AT ? -Math.sign(heading) : 0;
      presses += wanted !== 0 && wanted !== key ? 1 : 0;
      key = wanted;
    }
    input.steer = approach(
      input.steer,
      key,
      (key === 0 ? KEY_RELEASE : KEY_ATTACK) / TICK_RATE
    );
    seen.push({
      drift:
        rider.lateralSpeed -
        curvePushOf(on, curvatureAt(track, rider.s), rider.speed),
      x: rider.x,
    });
    stepRace(race, track, frameFor(input));
    widest = Math.max(widest, Math.abs(rider.x - line));
    offRoadTicks += rider.offRoad ? 1 : 0;
  }
  return { offRoadSeconds: offRoadTicks / TICK_RATE, presses, widest };
};

export const stagedRide = (
  course: string,
  track: Track,
  on: BikeSpec,
  at: number
): StagedRide => {
  const reacting = ridden(track, on, at, true);
  return {
    at,
    bike: on.id,
    centred: ridden(track, on, at, false),
    course,
    presses: reacting.presses,
    reacting,
  };
};
