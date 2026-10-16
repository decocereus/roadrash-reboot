import { lipOf, lipSlopeOf, nextJumpFrom } from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import { nextSeed, unitOf } from "@racer/track/random";
import { curvatureAt, slopeRateAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { grudgeSide, nearestRival } from "./combat.ts";
import { topSpeedOf } from "./engine.ts";
import { rockUpsetShare } from "./hazards.ts";
import { isDown, onBeat, PATROL_SPEED, PULL_OVER } from "./police.ts";
import { HARD_LANDING, LANDING_SLIP, towardBike } from "./rider.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  curvePushOf,
  GRAVITY,
  lateralSpeedLimit,
  PLAYER_RIDER,
  TICK_SECONDS,
} from "./state.ts";
import type {
  BikeSpec,
  Hazard,
  RaceState,
  RiderInput,
  RiderState,
  TrafficCar,
} from "./state.ts";
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
const JUMP_SIGHT_SECONDS = 3.5;
const JUMP_SIGHT_EXTRA = 10;
const JUMP_PULL = 3.6;
const JUMP_ALIGN_SECONDS = 0.5;
const JUMP_ALIGN_PER_METRE = 0.45;
const JUMP_LANDING_ROOM = 0.5;
const JUMP_IMPACT_MARGIN = 0.9;
const JUMP_LINE_SPREAD = 1.2;
const JUMP_WALL_CLEARANCE = 1.2;
const MISREAD_SHARE = 0.8;
const MISREAD_EDGE = 0.15;
const MISREAD_REACH = 1.5;
const MISREAD_SLACK = 0.1;
const MISREAD_DIVE = 5;
const STRAIGHTEN_SECONDS = 0.6;
const STRAIGHTEN_SCAN_STEP = 2;
const HAZARD_SIGHT_SECONDS = 2.35;
const HAZARD_SIGHT_EXTRA = 15;
const DODGE_MARGIN = 0.45;
const DODGE_EDGE = 0.2;
const HAZARD_MISS_SHARE = 0.4;
const ROCK_THROUGH_SPEED = 150 / 3.6;
const MOVE_COST = 0.05;
const LANE_RANK_COST = 1;
const OFF_LANE_COST = 0.2;
const PURSUIT_COST = -1;
const HYSTERESIS = 0.15;
const LINE_MATCH = 0.05;
const POTHOLE_COST = 0.6;
const OIL_COST = 1;
const ROCK_COST = 2;
const ROCK_COST_PER_SPEED = 2;
const ROCK_FAST = 55.6;
const PASS_MARGIN = 0.3;
const CONTACT_MARGIN = 0.1;
const FORECAST_SECONDS = 3.5;
const CRASH_COST = 10;
const FOLLOW_COST = 5;
const ROCK_LANDING_SHARE = 0.85;
const LANDING_SEARCH_STEPS = 8;
const SLIPPING = 0.2;
const SLIPPING_STEER = 0.45;

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

const hazardRoll = (state: RaceState): number => {
  state.hazardDice = nextSeed(state.hazardDice);
  return unitOf(state.hazardDice);
};

const overlooks = (
  state: RaceState,
  rider: RiderState,
  hazardIndex: number
): boolean => {
  if (rider.hazardSeen !== hazardIndex) {
    rider.hazardSeen = hazardIndex;
    rider.hazardMissed =
      hazardRoll(state) < (1 - rider.profile.skill) * HAZARD_MISS_SHARE;
  }
  return rider.hazardMissed;
};

const dodgeReach = (hazard: Hazard): number =>
  hazard.halfWidth + BIKE_HALF_WIDTH + DODGE_MARGIN;

const metresToContact = (rider: RiderState, hazard: Hazard): number =>
  hazard.s - hazard.halfLength - BIKE_HALF_LENGTH - rider.s;

const sightOf = (rider: RiderState): number =>
  rider.speed * HAZARD_SIGHT_SECONDS + HAZARD_SIGHT_EXTRA;

const inSight: number[] = [];

const gatherInSight = (state: RaceState, rider: RiderState): void => {
  inSight.length = 0;
  const sight = sightOf(rider);
  let nearest = -1;
  for (const [index, hazard] of state.hazards.entries()) {
    const passed = hazard.s + hazard.halfLength + BIKE_HALF_LENGTH < rider.s;
    const ahead = metresToContact(rider, hazard);
    if (!passed && ahead <= sight) {
      inSight.push(index);
      const closest = state.hazards[nearest];
      if (!closest || ahead < metresToContact(rider, closest)) {
        nearest = index;
      }
    }
  }
  if (nearest >= 0 && overlooks(state, rider, nearest)) {
    inSight.splice(inSight.indexOf(nearest), 1);
  }
};

const contactReach = (hazard: Hazard): number =>
  hazard.halfWidth + BIKE_HALF_WIDTH + CONTACT_MARGIN;

const hazardCost = (hazard: Hazard, speed: number): number => {
  if (hazard.kind === "rock") {
    return ROCK_COST + ROCK_COST_PER_SPEED * (speed / ROCK_FAST) ** 2;
  }
  return hazard.kind === "oil" ? OIL_COST : POTHOLE_COST;
};

interface Obstruction {
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly reach: number;
  readonly cost: number;
  readonly rock: boolean;
  readonly curvature: number;
  readonly metres: number;
  readonly traffic: boolean;
}

const obstructions: Obstruction[] = [];
const struck: boolean[] = [];

const gatherObstructions = (
  state: RaceState,
  track: Track,
  rider: RiderState
): void => {
  obstructions.length = 0;
  const pace = Math.max(1, rider.speed);
  for (const index of inSight) {
    const hazard = state.hazards[index];
    if (hazard) {
      obstructions.push({
        cost: hazardCost(hazard, rider.speed),
        curvature: curvatureAt(track, hazard.s),
        end: (hazard.s + hazard.halfLength + BIKE_HALF_LENGTH - rider.s) / pace,
        metres: Math.max(0, metresToContact(rider, hazard)),
        reach: contactReach(hazard),
        rock: hazard.kind === "rock",
        start: metresToContact(rider, hazard) / pace,
        traffic: false,
        x: hazard.x,
      });
    }
  }
  for (const car of state.cars) {
    const closing = rider.speed - car.speed;
    const start =
      (car.s - car.halfLength - BIKE_HALF_LENGTH - rider.s) / closing;
    const end = (car.s + car.halfLength + BIKE_HALF_LENGTH - rider.s) / closing;
    if (closing > 0 && end >= 0 && start <= FORECAST_SECONDS) {
      obstructions.push({
        cost: CRASH_COST,
        curvature: 0,
        end,
        metres: 0,
        reach: car.halfWidth + BIKE_HALF_WIDTH,
        rock: false,
        start,
        traffic: true,
        x: car.x,
      });
    }
  }
};

const toll = { cost: 0, rock: false, speed: Number.POSITIVE_INFINITY };

const throwsOnRock = (
  bike: BikeSpec,
  lateralSpeed: number,
  curvature: number,
  speed: number
): boolean =>
  Math.abs(lateralSpeed + curvePushOf(bike, curvature, speed)) /
    Math.max(1, lateralSpeedLimit(bike, speed)) +
    rockUpsetShare(speed) >
  LANDING_SLIP * ROCK_LANDING_SHARE;

const rockLandingSpeed = (
  bike: BikeSpec,
  lateralSpeed: number,
  curvature: number,
  speed: number
): number => {
  if (!throwsOnRock(bike, lateralSpeed, curvature, speed)) {
    return speed;
  }
  let low = 0;
  let high = speed;
  for (let step = 0; step < LANDING_SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (throwsOnRock(bike, lateralSpeed, curvature, middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return low;
};

const landOnRock = (
  rider: RiderState,
  obstruction: Obstruction,
  lateralSpeed: number
): void => {
  const landing = rockLandingSpeed(
    rider.bike,
    lateralSpeed,
    obstruction.curvature,
    rider.speed
  );
  if (
    rider.speed ** 2 - landing ** 2 >
    2 * PLANNED_BRAKING * obstruction.metres
  ) {
    toll.cost += CRASH_COST;
  }
  toll.speed = Math.min(toll.speed, landing);
};

const tally = (
  rider: RiderState,
  x: number,
  seconds: number,
  lateralSpeed: number,
  braking: boolean
): void => {
  for (const [index, obstruction] of obstructions.entries()) {
    if (
      !struck[index] &&
      !(braking && obstruction.traffic) &&
      seconds >= obstruction.start &&
      seconds <= obstruction.end &&
      Math.abs(x - obstruction.x) < obstruction.reach
    ) {
      struck[index] = true;
      toll.cost += obstruction.cost;
      if (obstruction.rock) {
        toll.rock = true;
        landOnRock(rider, obstruction, lateralSpeed);
      }
    }
  }
};

const weigh = (
  track: Track,
  rider: RiderState,
  line: number,
  braking: boolean
): void => {
  toll.cost = 0;
  toll.rock = false;
  toll.speed = Number.POSITIVE_INFINITY;
  struck.length = 0;
  let horizon = 0;
  for (const obstruction of obstructions) {
    horizon = Math.max(horizon, obstruction.end);
  }
  horizon = Math.min(FORECAST_SECONDS, horizon);
  const { bike } = rider;
  const limit = Math.min(
    MAX_LATERAL_SPEED,
    lateralSpeedLimit(bike, rider.speed)
  );
  const turn =
    bike.steerRate *
    weapons[rider.weapon].steerFactor *
    (1 - rider.slip) *
    TICK_SECONDS;
  let { x } = rider;
  let lateralSpeed =
    rider.lateralSpeed -
    curvePushOf(bike, curvatureAt(track, rider.s), rider.speed);
  tally(rider, x, 0, lateralSpeed, braking);
  for (let tick = 1; tick * TICK_SECONDS <= horizon; tick += 1) {
    const settling =
      (lateralSpeed * Math.abs(lateralSpeed)) / (2 * bike.steerRate);
    const wanted = clamp(
      (line - x - settling) * LANE_CHANGE_RATE,
      -limit,
      limit
    );
    lateralSpeed += clamp(wanted - lateralSpeed, -turn, turn);
    x += lateralSpeed * TICK_SECONDS;
    tally(rider, x, tick * TICK_SECONDS, lateralSpeed, braking);
  }
};

const straddlesRamp = (track: Track, rider: RiderState, x: number): boolean => {
  const jump = track.features[nextJumpFrom(track, rider.s)];
  if (!jump || jump.s - rider.s > sightOf(rider)) {
    return false;
  }
  const across = Math.abs(x - jump.x);
  return (
    across > jump.width / 2 - BIKE_HALF_WIDTH &&
    across < jump.width / 2 + JUMP_WALL_CLEARANCE
  );
};

const passable = (rider: RiderState, car: TrafficCar): boolean =>
  car.cruiseSpeed >= 0 &&
  car.s > rider.s &&
  car.s - rider.s <= sightOf(rider) &&
  rider.speed > car.speed;

const offLane: number[] = [];

const offLaneLines = (
  state: RaceState,
  rider: RiderState
): readonly number[] => {
  offLane.length = 0;
  for (const index of inSight) {
    const hazard = state.hazards[index];
    if (hazard) {
      const side = Math.sign(rider.x - hazard.x) || 1;
      offLane.push(
        hazard.x + side * dodgeReach(hazard),
        hazard.x - side * dodgeReach(hazard)
      );
    }
  }
  for (const car of state.cars) {
    if (passable(rider, car)) {
      const pass = car.halfWidth + BIKE_HALF_WIDTH + PASS_MARGIN;
      offLane.push(car.x + pass, car.x - pass);
    }
  }
  if (Number.isFinite(rider.pilotLine)) {
    offLane.push(rider.pilotLine);
  }
  return offLane;
};

interface Line extends Aim {
  readonly cost: number;
}

const followLine = (
  rider: RiderState,
  lanes: readonly number[],
  threatIn: (index: number) => Threat | undefined
): Line | undefined => {
  const current = nearestLaneIndex(lanes, rider.x);
  const ahead = threatIn(current);
  const lane = lanes[current];
  if (
    !ahead ||
    lane === undefined ||
    ahead.seconds * 2 * PLANNED_BRAKING < rider.speed - ahead.speed
  ) {
    return undefined;
  }
  return {
    cost: LANE_RANK_COST * current + FOLLOW_COST,
    speed: Math.max(0, ahead.speed),
    x: lane,
  };
};

const choice = { cost: Number.POSITIVE_INFINITY, speed: 0, x: 0 };

const chooseLine = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  cruise: number,
  pursuit?: Aim
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
  gatherInSight(state, rider);
  const kept = rider.pilotLine;
  const weighing = inSight.length > 0 || Number.isFinite(kept);
  const room = track.roadHalfWidth - BIKE_HALF_WIDTH - DODGE_EDGE;
  choice.cost = Number.POSITIVE_INFINITY;
  if (weighing) {
    gatherObstructions(state, track, rider);
  }
  const offer = (
    x: number,
    speed: number,
    cost: number,
    braking: boolean
  ): void => {
    let total = cost + MOVE_COST * Math.abs(x - rider.x);
    let lineSpeed = speed;
    if (weighing) {
      weigh(track, rider, x, braking);
      total += toll.cost;
      lineSpeed = Math.min(
        speed,
        toll.speed,
        toll.rock ? ROCK_THROUGH_SPEED : Number.POSITIVE_INFINITY
      );
      if (Math.abs(x - kept) < LINE_MATCH) {
        total -= HYSTERESIS;
      }
    }
    if (total < choice.cost) {
      choice.cost = total;
      choice.speed = lineSpeed;
      choice.x = x;
    }
  };
  const offerBetweenLanes = (x: number): void => {
    if (
      Math.abs(x) <= room &&
      !straddlesRamp(track, rider, x) &&
      !laneThreat(state, riderIndex, rider, x) &&
      !crossesBlocked(x)
    ) {
      offer(
        x,
        cruise,
        LANE_RANK_COST * nearestLaneIndex(lanes, x) + OFF_LANE_COST,
        false
      );
    }
  };
  if (pursuit) {
    offer(pursuit.x, pursuit.speed, PURSUIT_COST, false);
  }
  for (const [index, lane] of lanes.entries()) {
    if (!threatIn(index) && !crossesBlocked(lane)) {
      offer(lane, cruise, LANE_RANK_COST * index, false);
    }
  }
  if (weighing) {
    const follow = followLine(rider, lanes, threatIn);
    if (follow) {
      offer(follow.x, follow.speed, follow.cost, true);
    }
    for (const x of offLaneLines(state, rider)) {
      offerBetweenLanes(x);
    }
  }
  if (choice.cost < Number.POSITIVE_INFINITY) {
    const stays = Math.abs(choice.x - kept) < LINE_MATCH;
    rider.pilotLine = inSight.length > 0 || stays ? choice.x : Number.NaN;
    return { speed: choice.speed, x: choice.x };
  }
  rider.pilotLine = Number.NaN;
  const current = nearestLaneIndex(lanes, rider.x);
  const neighbour = neighbourOf(lanes, sameWayLanes.length, current);
  const pace = threats[neighbour < sameWayLanes.length ? neighbour : current];
  return {
    speed: Math.min(cruise, Math.max(0, pace?.speed ?? 0) + SPLITTING_SPEED),
    x: seamOf(lanes, sameWayLanes.length, current, neighbour),
  };
};

const roll = (state: RaceState): number => {
  state.dice = nextSeed(state.dice);
  return unitOf(state.dice);
};

const safeLaunchSpeed = (jump: TrackFeature): number => {
  const impact = -HARD_LANDING * JUMP_IMPACT_MARGIN;
  const fall = 2 * GRAVITY * jump.rise;
  return impact * impact > fall
    ? Math.sqrt(impact * impact - fall) / lipSlopeOf(jump)
    : 0;
};

const misreads = (
  state: RaceState,
  rider: RiderState,
  jumpIndex: number
): boolean => {
  if (rider.jumpSeen !== jumpIndex) {
    rider.jumpSeen = jumpIndex;
    rider.jumpMisread = roll(state) < (1 - rider.profile.skill) * MISREAD_SHARE;
  }
  return rider.jumpMisread;
};

const roadSide = (
  track: Track,
  jump: TrackFeature,
  side: number,
  reach: number
): number =>
  Math.abs(jump.x + side * reach) > track.roadHalfWidth - BIKE_HALF_WIDTH
    ? -side
    : side;

const lineOnto = (
  track: Track,
  jump: TrackFeature,
  riderIndex: number,
  rider: RiderState,
  misread: boolean
): number => {
  const side = riderIndex % 2 === 0 ? 1 : -1;
  if (misread) {
    const across = rider.x - jump.x;
    const gap = Math.abs(across) - jump.width / 2;
    const toLip = (lipOf(jump) - rider.s) / Math.max(1, rider.speed);
    const dives =
      gap > 0 &&
      gap < MISREAD_REACH &&
      toLip < Math.sqrt((2 * gap) / rider.bike.steerRate) + MISREAD_SLACK;
    return dives
      ? jump.x - Math.sign(across) * MISREAD_DIVE
      : jump.x +
          roadSide(track, jump, side, jump.width / 2 + MISREAD_EDGE) *
            (jump.width / 2 + MISREAD_EDGE);
  }
  const spread = (1 - rider.profile.skill) * JUMP_LINE_SPREAD;
  return jump.x + side * Math.min(spread, jump.width / 2 - BIKE_HALF_WIDTH);
};

const clearOfWall = (
  track: Track,
  jump: TrackFeature,
  rider: RiderState,
  aim: Aim
): Aim => {
  const wall = jump.width / 2 + JUMP_WALL_CLEARANCE;
  if (Math.abs(aim.x - jump.x) >= wall) {
    return aim;
  }
  const side = roadSide(track, jump, Math.sign(rider.x - jump.x) || 1, wall);
  return { speed: aim.speed, x: jump.x + side * wall };
};

const jumpAim = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  aim: Aim
): Aim => {
  const jumpIndex = nextJumpFrom(track, rider.s);
  const jump = track.features[jumpIndex];
  if (!jump) {
    return aim;
  }
  const toToe = jump.s - rider.s;
  const offset = Math.abs(rider.x - jump.x);
  if (toToe <= 0) {
    if (offset <= jump.width / 2) {
      return { speed: aim.speed, x: jump.x };
    }
    return rider.jumpSeen === jumpIndex && rider.jumpMisread
      ? { speed: aim.speed, x: lineOnto(track, jump, riderIndex, rider, true) }
      : clearOfWall(track, jump, rider, aim);
  }
  if (toToe > rider.speed * JUMP_SIGHT_SECONDS + JUMP_SIGHT_EXTRA) {
    return aim;
  }
  const drawn =
    Math.abs(aim.x - jump.x) < JUMP_PULL ||
    offset < jump.width / 2 + BIKE_HALF_WIDTH;
  if (!drawn) {
    return aim;
  }
  const lined = offset <= jump.width / 2 - BIKE_HALF_WIDTH;
  const committed = rider.jumpSeen === jumpIndex && rider.jumpMisread;
  const reachable =
    lined ||
    committed ||
    toToe / Math.max(1, rider.speed) >
      JUMP_ALIGN_SECONDS + JUMP_ALIGN_PER_METRE * offset;
  const landsOnRoad =
    Math.abs(jump.x) < track.roadHalfWidth - JUMP_LANDING_ROOM;
  if (reachable && landsOnRoad) {
    return {
      speed: Math.min(aim.speed, safeLaunchSpeed(jump)),
      x: lineOnto(
        track,
        jump,
        riderIndex,
        rider,
        misreads(state, rider, jumpIndex)
      ),
    };
  }
  return clearOfWall(track, jump, rider, aim);
};

const launchesSoon = (track: Track, rider: RiderState): boolean => {
  const reach = rider.speed * STRAIGHTEN_SECONDS;
  const lift = -GRAVITY / (rider.speed * rider.speed);
  for (let ahead = 0; ahead <= reach; ahead += STRAIGHTEN_SCAN_STEP) {
    if (slopeRateAt(track, rider.s + ahead) < lift) {
      return true;
    }
  }
  return false;
};

const straightened = (track: Track, rider: RiderState, aim: Aim): Aim => {
  if (rider.speed <= 0 || !launchesSoon(track, rider)) {
    return aim;
  }
  const settling =
    (rider.lateralSpeed * Math.abs(rider.lateralSpeed)) /
    (2 * rider.bike.steerRate);
  return { speed: aim.speed, x: rider.x + settling };
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
    return chooseLine(state, track, copIndex, cop, PATROL_SPEED);
  }
  const pursuit = pursuitOf(state, cop, target);
  const open =
    pursuit.engaged &&
    !carOnTheWay(state, track, cop, pursuit.x, pursuit.within);
  return chooseLine(
    state,
    track,
    copIndex,
    cop,
    pursuit.speed,
    open ? pursuit : undefined
  );
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
  const steerLimit = rider.slip > SLIPPING ? SLIPPING_STEER : 1;
  input.steer = clamp(
    (lateralSpeed + push) /
      Math.max(1, lateralSpeedLimit(rider.bike, rider.speed)),
    -steerLimit,
    steerLimit
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
  const aim = straightened(
    track,
    rider,
    jumpAim(
      state,
      track,
      riderIndex,
      rider,
      police
        ? copAim(state, track, riderIndex, rider)
        : chooseLine(state, track, riderIndex, rider, Number.POSITIVE_INFINITY)
    )
  );
  ride(
    track,
    rider,
    aim,
    police ? freePace : paceOf(state, riderIndex, rider),
    input
  );
  fight(state, riderIndex, rider, input);
};
