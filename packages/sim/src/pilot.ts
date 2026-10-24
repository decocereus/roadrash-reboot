import { nextSeed, unitOf } from "@racer/track/random";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { topSpeedOf } from "./engine.ts";
import { fight } from "./pilot-combat.ts";
import {
  askedLateral,
  BRAKE_SHARE,
  callCorners,
  CORNER_MARGIN,
  cornerMargin,
  crestSpeedLimit,
  riding,
  steeringPush,
} from "./pilot-corners.ts";
import { SLIPPING, SLIPPING_STEER } from "./pilot-forecast.ts";
import { jumpAim, straightened } from "./pilot-jumps.ts";
import { chooseLine, slickAhead } from "./pilot-lines.ts";
import type { Aim } from "./pilot-lines.ts";
import { copAim } from "./pilot-police.ts";
import { towardBike } from "./rider-recovery.ts";
import { clamp, PLAYER_RIDER, riderOf, steerFor } from "./state.ts";
import type {
  PilotHistory,
  RaceState,
  RiderInput,
  RiderState,
} from "./state.ts";

const MOST_BRAKE_SHARE = 0.98;
const CORNER_THROTTLE_GAIN = 4;
const CRUISE_THROTTLE = 0.6;
const THROTTLE_PER_EXCESS = 0.8;
const PACING_RANGE = 200;

interface Pace {
  readonly cap: number;
  readonly lift: number;
}

const freePace: Pace = { cap: Number.POSITIVE_INFINITY, lift: 0 };

const stillRacing = (rider: RiderState): boolean =>
  rider.finishTick < 0 && rider.mode !== "busted" && rider.mode !== "wrecked";

const paceOf = (state: RaceState, rider: RiderState): Pace => {
  const player = riderOf(state.riders, PLAYER_RIDER);
  if (
    rider.id === PLAYER_RIDER ||
    !player ||
    !stillRacing(player) ||
    !stillRacing(rider)
  ) {
    return freePace;
  }
  const gap = rider.s - player.s;
  const share = clamp(Math.abs(gap) / PACING_RANGE, 0, 1);
  if (gap > 0) {
    return {
      cap: topSpeedOf(rider.bike) * (1 - state.pacing.leadEase * share),
      lift: 0,
    };
  }
  return { cap: Number.POSITIVE_INFINITY, lift: state.pacing.catchUp * share };
};

const roll = (state: RaceState): number => {
  state.dice = nextSeed(state.dice);
  return unitOf(state.dice);
};

const ride = (
  history: PilotHistory,
  track: Track,
  rider: RiderState,
  aim: Aim,
  pace: Pace,
  input: RiderInput
): void => {
  const corners = callCorners(
    history,
    track,
    rider,
    riding.margin,
    aim.x,
    slickAhead
  );
  const push = steeringPush(history, track, rider);
  const lateralSpeed = askedLateral(track, rider, aim.x);
  const steerLimit = rider.slip > SLIPPING ? SLIPPING_STEER : 1;
  input.steer = clamp(
    steerFor(
      rider.bike,
      curvatureAt(track, rider.s),
      rider.speed,
      lateralSpeed + push
    ),
    -steerLimit,
    steerLimit
  );

  const skill = Math.min(1, rider.profile.skill + pace.lift);
  const targetSpeed = Math.min(
    aim.speed,
    crestSpeedLimit(track, rider) * skill
  );
  const excess = rider.speed - targetSpeed;
  input.brake = Math.max(
    corners.brake,
    excess > 1.5 ? clamp(excess / 6, 0.25, 1) : 0
  );
  const over = Math.max(excess, rider.speed - pace.cap);
  const cornerRoom = (corners.speed - rider.speed) * CORNER_THROTTLE_GAIN;
  input.throttle =
    targetSpeed > 0 && !corners.lift
      ? clamp(
          Math.min(CRUISE_THROTTLE - over * THROTTLE_PER_EXCESS, cornerRoom),
          0,
          1
        )
      : 0;
};

const walkToBike = (rider: RiderState, input: RiderInput): void => {
  const { across, along } =
    rider.mode === "running" ? towardBike(rider) : { across: 0, along: 0 };
  input.steer = across;
  input.throttle = Math.max(0, along);
  input.brake = Math.max(0, -along);
  input.punch = false;
  input.kick = false;
};

export const pilotRider = (
  state: RaceState,
  track: Track,
  rider: RiderState
): void => {
  const { input } = rider;
  if (rider.mode !== "riding") {
    walkToBike(rider, input);
    return;
  }
  const history = state.pilot;
  const police = rider.profile.role === "police";
  const pace = police ? freePace : paceOf(state, rider);
  riding.margin = Math.min(
    CORNER_MARGIN,
    cornerMargin(rider.profile.skill) + pace.lift
  );
  riding.brakeShare = Math.min(MOST_BRAKE_SHARE, BRAKE_SHARE + pace.lift);
  slickAhead.metres = Number.POSITIVE_INFINITY;
  slickAhead.speed = Number.POSITIVE_INFINITY;
  const aim = straightened(
    track,
    rider,
    jumpAim(
      state,
      track,
      rider,
      police
        ? copAim(history, state, track, rider)
        : chooseLine(history, state, track, rider, Number.POSITIVE_INFINITY),
      roll
    )
  );
  ride(history, track, rider, aim, pace, input);
  fight(state, rider, input, roll);
};
