import { nextSeed, unitOf } from "@racer/track/random";
import { curvatureAt, slopeRateAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { grudgeSide, nearestRival } from "./combat.ts";
import { topSpeedOf } from "./engine.ts";
import { isDown, onBeat, PATROL_SPEED, PULL_OVER } from "./police.ts";
import { towardBike } from "./rider.ts";
import {
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  GRAVITY,
  lateralSpeedLimit,
  PLAYER_RIDER,
} from "./state.ts";
import type { BikeSpec, RaceState, RiderInput, RiderState } from "./state.ts";
import { kick, weapons } from "./weapons.ts";
import type { StrikeSpec } from "./weapons.ts";

const CORNER_CONFIDENCE = 0.8;
const CREST_MARGIN = 1.15;
const PLANNED_BRAKING = 6.5;
const PLANNED_LIFT = 3.5;
const SCAN_STEP = 10;
const LANE_CHANGE_RATE = 1.2;
const MAX_LATERAL_SPEED = 5;
const FOLLOW_SECONDS = 2.4;
const ONCOMING_SECONDS = 4.5;
const ONCOMING_ENTRY_SECONDS = 8;
const START_TICKS = 600;
const START_ONCOMING_ENTRY_SECONDS = 12;
const CENTRE_SEAM_BIAS = 0.6;
const LANE_REACH = 1.7;
const SPLITTING_SPEED = 8;
const RIDER_FOLLOW_SECONDS = 1.2;
const ATTACK_CHANCE_PER_SECOND = 1.4;
const TRUCE_TICKS = 420;
const CATCH_UP_RATE = 0.8;
const ALONGSIDE = 1.5;
const ENGAGE_RANGE = 20;
const BODY_CREEP_SPEED = 3;
const PATROL_END_MARGIN = 80;
const PULL_OVER_CRAWL = 6;
const CROSSING_SECONDS = 1.5;
const OWN_LANE_REACH = 1;
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

const paceOf = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): Pace => {
  const player = state.riders[PLAYER_RIDER];
  if (
    riderIndex === PLAYER_RIDER ||
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

const letGoSpeed = (bike: BikeSpec, bend: number): number => {
  const push = bend / bike.curvePush;
  const held = bike.lateralSpeedPerSpeed * CORNER_CONFIDENCE;
  const grip = bike.lateralSpeed * CORNER_CONFIDENCE;
  return (held + Math.sqrt(held * held + 4 * push * grip)) / (2 * push);
};

const cornerSpeedLimit = (track: Track, rider: RiderState): number => {
  const horizon = (rider.speed * rider.speed) / (2 * PLANNED_BRAKING) + 40;
  let limit = Number.POSITIVE_INFINITY;
  const slowFor = (speed: number, ahead: number, planned: number) => {
    limit = Math.min(limit, Math.sqrt(speed * speed + 2 * planned * ahead));
  };
  for (let ahead = 0; ahead < horizon; ahead += SCAN_STEP) {
    const bend = Math.abs(curvatureAt(track, rider.s + ahead));
    if (bend > 1e-5) {
      slowFor(letGoSpeed(rider.bike, bend), ahead, PLANNED_BRAKING);
    }
    const drop = slopeRateAt(track, rider.s + ahead);
    if (drop < 0) {
      slowFor(Math.sqrt(-GRAVITY / drop) * CREST_MARGIN, ahead, PLANNED_LIFT);
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
  if (gap < -2 * obstacle.halfLength - 2) {
    return Number.POSITIVE_INFINITY;
  }
  if (gap <= 0) {
    return 0;
  }
  return closingSpeed > 0 ? gap / closingSpeed : Number.POSITIVE_INFINITY;
};

const oncomingHorizon = (
  state: RaceState,
  rider: RiderState,
  laneX: number
): number => {
  if (Math.abs(laneX - rider.x) < OWN_LANE_REACH) {
    return ONCOMING_SECONDS;
  }
  return state.tick < START_TICKS
    ? START_ONCOMING_ENTRY_SECONDS
    : ONCOMING_ENTRY_SECONDS;
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
  let seconds = Number.POSITIVE_INFINITY;
  let speed = 0;
  for (const car of state.cars) {
    const oncoming = car.cruiseSpeed < 0;
    if (
      (oncoming || car.s - rider.s < within) &&
      Math.abs(car.x - laneX) < LANE_REACH &&
      rider.speed > car.speed
    ) {
      const horizon = oncoming
        ? oncomingHorizon(state, rider, laneX)
        : FOLLOW_SECONDS;
      const contact = secondsUntilContact(rider, car);
      if (contact < horizon && contact < seconds) {
        seconds = contact;
        ({ speed } = car);
      }
    }
  }
  return seconds < Number.POSITIVE_INFINITY ? { seconds, speed } : undefined;
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

const nearestLaneIndex = (lanes: readonly number[], x: number): number => {
  let nearest = 0;
  for (const [index, lane] of lanes.entries()) {
    if (Math.abs(lane - x) < Math.abs((lanes[nearest] ?? 0) - x)) {
      nearest = index;
    }
  }
  return nearest;
};

const neighbourOf = (
  lanes: readonly number[],
  sameWayCount: number,
  current: number
): number => {
  const here = lanes[current] ?? 0;
  let neighbour = current;
  for (const [index, lane] of lanes.entries()) {
    if (index === current) {
      continue;
    }
    const apart = Math.abs(lane - here);
    const nearestSoFar = Math.abs((lanes[neighbour] ?? here) - here);
    if (
      neighbour === current ||
      apart < nearestSoFar ||
      (apart === nearestSoFar && index < sameWayCount)
    ) {
      neighbour = index;
    }
  }
  return neighbour;
};

const between = (x: number, target: number, lane: number): boolean =>
  (lane - x) * (lane - target) < 0;

const seamOf = (
  lanes: readonly number[],
  sameWayCount: number,
  current: number,
  neighbour: number
): number => {
  const middle = ((lanes[current] ?? 0) + (lanes[neighbour] ?? 0)) / 2;
  const straddlesCentre = current < sameWayCount !== neighbour < sameWayCount;
  return straddlesCentre ? middle + CENTRE_SEAM_BIAS : middle;
};

const laneAim = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  cruise: number
): Aim => {
  const { oncomingLanes, sameWayLanes } = track;
  const lanes = [...sameWayLanes, ...oncomingLanes];
  const threats: (Threat | undefined)[] = [];
  const checked: boolean[] = [];
  const threatIn = (index: number): Threat | undefined => {
    if (!checked[index]) {
      checked[index] = true;
      threats[index] = laneThreat(state, riderIndex, rider, lanes[index] ?? 0);
    }
    return threats[index];
  };
  const crossesBlocked = (target: number): boolean =>
    lanes.some((lane, index) => {
      if (
        !between(rider.x, target, lane) ||
        Math.abs(lane - rider.x) < OWN_LANE_REACH
      ) {
        return false;
      }
      const crossed = threatIn(index);
      return crossed !== undefined && crossed.seconds < CROSSING_SECONDS;
    });
  for (const [index, lane] of lanes.entries()) {
    if (!threatIn(index) && !crossesBlocked(lane)) {
      return { speed: cruise, x: lane };
    }
  }
  const current = nearestLaneIndex(lanes, rider.x);
  const neighbour = neighbourOf(lanes, sameWayLanes.length, current);
  const pace = threats[neighbour < sameWayLanes.length ? neighbour : current];
  return {
    speed: Math.min(cruise, Math.max(0, pace?.speed ?? 0) + SPLITTING_SPEED),
    x: seamOf(lanes, sameWayLanes.length, current, neighbour),
  };
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

const carOnTheWay = (
  state: RaceState,
  track: Track,
  cop: RiderState,
  toX: number,
  within: number
): boolean => {
  if (carThreat(state, cop, toX, within)) {
    return true;
  }
  return [...track.sameWayLanes, ...track.oncomingLanes].some(
    (lane) =>
      between(cop.x, toX, lane) &&
      carThreat(state, cop, lane, within) !== undefined
  );
};

const copAim = (
  state: RaceState,
  track: Track,
  copIndex: number,
  cop: RiderState
): Aim => {
  if (cop.parked) {
    return { speed: 0, x: cop.x };
  }
  const target = state.riders[cop.chase];
  const offDuty = !(target || onBeat(state, cop));
  if (offDuty || cop.s > track.length - PATROL_END_MARGIN) {
    const offRoad = cop.x > track.roadHalfWidth + BIKE_HALF_WIDTH;
    return {
      speed: offRoad ? 0 : PULL_OVER_CRAWL,
      x: track.roadHalfWidth + PULL_OVER,
    };
  }
  if (!target) {
    return laneAim(state, track, copIndex, cop, PATROL_SPEED);
  }
  const pursuit = pursuitOf(state, cop, target);
  if (
    pursuit.engaged &&
    !carOnTheWay(state, track, cop, pursuit.x, pursuit.within)
  ) {
    return pursuit;
  }
  return laneAim(state, track, copIndex, cop, pursuit.speed);
};

const ride = (
  track: Track,
  rider: RiderState,
  aim: Aim,
  pace: Pace,
  input: RiderInput
): void => {
  const settling =
    (rider.lateralSpeed * Math.abs(rider.lateralSpeed)) /
    (2 * rider.bike.steerRate);
  const lateralSpeed = clamp(
    (aim.x - rider.x - settling) * LANE_CHANGE_RATE,
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

  const skill = Math.min(1, rider.profile.skill + pace.lift);
  const targetSpeed = Math.min(
    aim.speed,
    cornerSpeedLimit(track, rider) * skill
  );
  const excess = rider.speed - targetSpeed;
  input.brake = excess > 1.5 ? clamp(excess / 6, 0.25, 1) : 0;
  const over = Math.max(excess, rider.speed - pace.cap);
  input.throttle =
    targetSpeed > 0
      ? clamp(CRUISE_THROTTLE - over * THROTTLE_PER_EXCESS, 0, 1)
      : 0;
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
    target === state.riders[PLAYER_RIDER] ? rider.aggressionBoost : 0;
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
  if (state.tick <= TRUCE_TICKS || rider.attackCooldown > 0) {
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

const walkToBike = (rider: RiderState, input: RiderInput): void => {
  const { across, along } =
    rider.mode === "running" ? towardBike(rider) : { across: 0, along: 0 };
  input.steer = across;
  input.throttle = Math.max(0, along);
  input.brake = Math.max(0, -along);
  input.punch = false;
  input.kick = false;
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
  if (rider.mode !== "riding") {
    walkToBike(rider, input);
    return;
  }
  const police = rider.profile.role === "police";
  const aim = police
    ? copAim(state, track, riderIndex, rider)
    : laneAim(state, track, riderIndex, rider, Number.POSITIVE_INFINITY);
  ride(
    track,
    rider,
    aim,
    police ? freePace : paceOf(state, riderIndex, rider),
    input
  );
  fight(state, riderIndex, rider, input);
};
