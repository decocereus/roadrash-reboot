import { nextSeed, unitOf } from "@racer/track/random";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { grudgeSide, nearestRival } from "./combat.ts";
import { isDown, PATROL_SPEED, PULL_OVER } from "./police.ts";
import {
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  lateralSpeedLimit,
} from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";
import { kick, weapons } from "./weapons.ts";
import type { StrikeSpec } from "./weapons.ts";

const CORNER_CONFIDENCE = 0.72;
const PLANNED_BRAKING = 6.5;
const SCAN_STEP = 10;
const LANE_CHANGE_RATE = 1.2;
const MAX_LATERAL_SPEED = 5;
const FOLLOW_SECONDS = 2.4;
const ONCOMING_SECONDS = 4.5;
const LANE_REACH = 1.7;
const SPLITTING_SPEED = 8;
const RIDER_FOLLOW_SECONDS = 1.2;
const ATTACK_CHANCE_PER_SECOND = 1.4;
const TRUCE_TICKS = 180;
const CATCH_UP_RATE = 0.8;
const ALONGSIDE = 1.5;
const ENGAGE_RANGE = 20;
const BODY_CREEP_SPEED = 3;
const PATROL_END_MARGIN = 80;
const PULL_OVER_CRAWL = 6;

const cornerSpeedLimit = (track: Track, rider: RiderState): number => {
  const lateralLimit =
    lateralSpeedLimit(rider.bike, 60) *
    rider.bike.curvePush *
    CORNER_CONFIDENCE;
  const horizon = (rider.speed * rider.speed) / (2 * PLANNED_BRAKING) + 40;
  let limit = Number.POSITIVE_INFINITY;
  for (let ahead = 0; ahead < horizon; ahead += SCAN_STEP) {
    const bend = Math.abs(curvatureAt(track, rider.s + ahead));
    if (bend > 1e-5) {
      const cornerSpeed = Math.sqrt(lateralLimit / bend);
      limit = Math.min(
        limit,
        Math.sqrt(cornerSpeed * cornerSpeed + 2 * PLANNED_BRAKING * ahead)
      );
    }
  }
  return limit;
};

interface Threat {
  readonly seconds: number;
  readonly speed: number;
}

interface Obstacle {
  readonly s: number;
  readonly x: number;
  readonly speed: number;
  readonly halfLength: number;
}

const secondsUntilContact = (rider: RiderState, obstacle: Obstacle): number => {
  const gap = obstacle.s - rider.s - obstacle.halfLength - 1;
  const closingSpeed = rider.speed - obstacle.speed;
  if (gap < -2 * obstacle.halfLength - 2 || closingSpeed <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, gap) / closingSpeed;
};

const riderObstacle = (other: RiderState): Obstacle => ({
  halfLength: 1,
  s: other.mode === "riding" ? other.s : other.bodyS,
  speed: other.mode === "riding" ? other.speed : 0,
  x: other.mode === "riding" ? other.x : other.bodyX,
});

const threatFrom = (
  rider: RiderState,
  laneX: number,
  obstacle: Obstacle,
  horizon: number
): Threat | undefined => {
  if (Math.abs(obstacle.x - laneX) >= LANE_REACH) {
    return undefined;
  }
  const seconds = secondsUntilContact(rider, obstacle);
  return seconds < horizon ? { seconds, speed: obstacle.speed } : undefined;
};

const sooner = (
  first: Threat | undefined,
  second: Threat | undefined
): Threat | undefined =>
  first && (!second || first.seconds <= second.seconds) ? first : second;

const carThreat = (
  state: RaceState,
  rider: RiderState,
  laneX: number,
  within: number
): Threat | undefined => {
  let threat: Threat | undefined;
  for (const car of state.cars) {
    if (car.s - rider.s < within) {
      const horizon = car.cruiseSpeed < 0 ? ONCOMING_SECONDS : FOLLOW_SECONDS;
      threat = sooner(threat, threatFrom(rider, laneX, car, horizon));
    }
  }
  return threat;
};

const laneThreat = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  laneX: number
): Threat | undefined => {
  let threat = carThreat(state, rider, laneX, Number.POSITIVE_INFINITY);
  for (const [index, other] of state.riders.entries()) {
    if (index !== riderIndex && other.mode !== "wrecked") {
      threat = sooner(
        threat,
        threatFrom(rider, laneX, riderObstacle(other), RIDER_FOLLOW_SECONDS)
      );
    }
  }
  return threat;
};

interface Aim {
  readonly speed: number;
  readonly x: number;
}

const laneAim = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  ownLane: number,
  cruise: number
): Aim => {
  const ahead = laneThreat(state, riderIndex, rider, ownLane);
  if (!ahead) {
    return { speed: cruise, x: ownLane };
  }
  if (laneThreat(state, riderIndex, rider, -ownLane)) {
    return {
      speed: Math.min(cruise, Math.max(0, ahead.speed) + SPLITTING_SPEED),
      x: 0,
    };
  }
  return { speed: cruise, x: -ownLane };
};

interface Pursuit extends Aim {
  readonly engaged: boolean;
  readonly within: number;
}

const pursuitOf = (
  state: RaceState,
  cop: RiderState,
  target: RiderState
): Pursuit => {
  if (isDown(target)) {
    const within = target.bodyS - cop.s;
    return {
      engaged: true,
      speed: Math.min(
        state.police.topSpeed,
        Math.max(
          BODY_CREEP_SPEED,
          Math.sqrt(2 * PLANNED_BRAKING * Math.max(0, within - 1))
        )
      ),
      within,
      x: target.bodyX,
    };
  }
  const ahead = target.s - cop.s;
  const side = cop.x < target.x ? -1 : 1;
  return {
    engaged: Math.abs(ahead) < ENGAGE_RANGE,
    speed: Math.min(
      state.police.topSpeed,
      target.speed + clamp(ahead * CATCH_UP_RATE, -6, 14)
    ),
    within: Number.POSITIVE_INFINITY,
    x: target.x + side * ALONGSIDE,
  };
};

const copAim = (
  state: RaceState,
  track: Track,
  copIndex: number,
  cop: RiderState,
  ownLane: number
): Aim => {
  if (cop.parked) {
    return { speed: 0, x: cop.x };
  }
  if (cop.s > track.length - PATROL_END_MARGIN) {
    const offRoad = cop.x > track.roadHalfWidth + BIKE_HALF_WIDTH;
    return {
      speed: offRoad ? 0 : PULL_OVER_CRAWL,
      x: track.roadHalfWidth + PULL_OVER,
    };
  }
  const target = state.riders[cop.chase];
  if (!target) {
    return laneAim(state, copIndex, cop, ownLane, PATROL_SPEED);
  }
  const pursuit = pursuitOf(state, cop, target);
  if (pursuit.engaged && !carThreat(state, cop, pursuit.x, pursuit.within)) {
    return pursuit;
  }
  return laneAim(state, copIndex, cop, ownLane, pursuit.speed);
};

const ride = (
  track: Track,
  rider: RiderState,
  aim: Aim,
  input: RiderInput
): void => {
  const lateralSpeed = clamp(
    (aim.x - rider.x) * LANE_CHANGE_RATE,
    -MAX_LATERAL_SPEED,
    MAX_LATERAL_SPEED
  );
  const push = curvePushOf(
    rider.bike,
    curvatureAt(track, rider.s),
    rider.speed
  );
  input.steer = clamp(
    (lateralSpeed + push) /
      Math.max(1, lateralSpeedLimit(rider.bike, rider.speed)),
    -1,
    1
  );

  const targetSpeed = Math.min(
    aim.speed,
    cornerSpeedLimit(track, rider) * rider.profile.skill
  );
  const excess = rider.speed - targetSpeed;
  input.brake = excess > 1.5 ? clamp(excess / 6, 0.25, 1) : 0;
  if (excess < -1) {
    input.throttle = 1;
  } else {
    input.throttle = excess < 0 ? 0.4 : 0;
  }
};

const roll = (state: RaceState): number => {
  state.dice = nextSeed(state.dice);
  return unitOf(state.dice);
};

const rivalWithin = (
  state: RaceState,
  riderIndex: number,
  strike: StrikeSpec
): RiderState | undefined => {
  if (grudgeSide(state, riderIndex, strike) !== 0) {
    return state.riders[state.riders[riderIndex]?.grudge ?? -1];
  }
  const left = nearestRival(state, riderIndex, -1, strike);
  return state.riders[
    left >= 0 ? left : nearestRival(state, riderIndex, 1, strike)
  ];
};

const aggressionToward = (
  state: RaceState,
  rider: RiderState,
  target: RiderState | undefined
): number => {
  if (!target) {
    return 0;
  }
  const boost =
    target === state.riders[rider.grudge] ? rider.aggressionBoost : 0;
  return rider.profile.aggression + boost;
};

const fight = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  input: RiderInput
): void => {
  input.punch = false;
  input.kick = false;
  if (state.tick <= TRUCE_TICKS || rider.attack !== "none") {
    return;
  }
  const inHandReach = rivalWithin(state, riderIndex, weapons[rider.weapon]);
  const inKickReach = rivalWithin(state, riderIndex, kick);
  const aggression = aggressionToward(state, rider, inHandReach ?? inKickReach);
  if (aggression <= 0) {
    return;
  }
  const chance = (aggression * ATTACK_CHANCE_PER_SECOND) / 60;
  const chosen = roll(state);
  if (chosen >= chance) {
    return;
  }
  const covetsWeapon =
    rider.weapon === "none" &&
    inKickReach !== undefined &&
    inKickReach.weapon !== "none";
  const kickShare = covetsWeapon ? 0.7 : 1 / 3;
  input.kick =
    inKickReach !== undefined &&
    (inHandReach === undefined || chosen < chance * kickShare);
  input.punch = !input.kick;
};

export const pilotInput = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  input: RiderInput
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  const ownLane = track.plan.laneWidth / 2;
  const aim =
    rider.profile.role === "police"
      ? copAim(state, track, riderIndex, rider, ownLane)
      : laneAim(state, riderIndex, rider, ownLane, Number.POSITIVE_INFINITY);
  ride(track, rider, aim, input);
  fight(state, riderIndex, rider, input);
};
