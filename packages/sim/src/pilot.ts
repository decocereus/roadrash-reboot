import { flatFlightLength, lipOf } from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import { nextSeed, unitOf } from "@racer/track/random";
import { curvatureAt, slopeRateAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import { grudgeSide, nearestRival } from "./combat.ts";
import { topSpeedOf } from "./engine.ts";
import {
  brakeFor,
  CRUISE_THROTTLE,
  gatherObstructions,
  jumpAhead,
  safeLaunchSpeed,
  steerToward,
  weighLine,
} from "./forecast.ts";
import { isDown, onBeat, PATROL_SPEED, PULL_OVER } from "./police.ts";
import { towardBike } from "./rider.ts";
import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  GRAVITY,
  PLAYER_RIDER,
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
const THROTTLE_PER_EXCESS = 0.8;
const PACING_RANGE = 200;
const JUMP_SIGHT_SECONDS = 3.5;
const JUMP_SIGHT_EXTRA = 10;
const JUMP_PULL = 3.6;
const JUMP_LANDING_ROOM = 0.5;
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
const MOVE_COST = 0.05;
const LANE_RANK_COST = 1;
const OFF_LANE_COST = 0.2;
const PURSUIT_COST = -1;
const HYSTERESIS = 0.15;
const LINE_MATCH = 0.05;
const PASS_MARGIN = 0.3;
const RAMP_COST = -1;
const FOLLOW_COST = 5;
const SAME_LINE = 0.1;

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

const hazardSightOf = (rider: RiderState, jump?: TrackFeature): number =>
  jump
    ? Math.max(
        sightOf(rider),
        lipOf(jump) +
          flatFlightLength(jump, rider.speed) +
          HAZARD_SIGHT_EXTRA -
          rider.s
      )
    : sightOf(rider);

const inSight: number[] = [];

const gatherInSight = (
  state: RaceState,
  rider: RiderState,
  sight: number
): void => {
  inSight.length = 0;
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

const passable = (rider: RiderState, car: TrafficCar): boolean =>
  car.s > rider.s &&
  car.s - rider.s <= sightOf(rider) &&
  rider.speed > car.speed;

const passOffsetOf = (car: TrafficCar): number =>
  Math.max(car.halfWidth + BIKE_HALF_WIDTH + PASS_MARGIN, LANE_REACH);

type CandidateKind = "lane" | "between" | "free";

interface Candidate {
  x: number;
  speed: number;
  base: number;
  kind: CandidateKind;
  lane: number;
  blind: boolean;
}

const candidates: Candidate[] = [];
let candidateCount = 0;

const slotFor = (): Candidate => {
  let candidate = candidates[candidateCount];
  if (!candidate) {
    candidate = {
      base: 0,
      blind: false,
      kind: "free",
      lane: -1,
      speed: 0,
      x: 0,
    };
    candidates.push(candidate);
  }
  candidateCount += 1;
  return candidate;
};

const repeats = (x: number, base: number): boolean => {
  for (let index = 0; index < candidateCount; index += 1) {
    const other = candidates[index];
    if (other && !other.blind && Math.abs(other.x - x) < SAME_LINE) {
      if (other.kind === "between" && base < other.base) {
        other.x = x;
        other.base = base;
      }
      return true;
    }
  }
  return false;
};

const propose = (
  rider: RiderState,
  x: number,
  speed: number,
  cost: number,
  kind: CandidateKind,
  lane: number,
  blind: boolean
): void => {
  const base =
    cost +
    MOVE_COST * Math.abs(x - rider.x) -
    (Math.abs(x - rider.pilotLine) < LINE_MATCH ? HYSTERESIS : 0);
  if (kind === "between" && repeats(x, base)) {
    return;
  }
  const candidate = slotFor();
  candidate.x = x;
  candidate.speed = speed;
  candidate.base = base;
  candidate.kind = kind;
  candidate.lane = lane;
  candidate.blind = blind;
};

const ordered: Candidate[] = [];

const orderCandidates = (): readonly Candidate[] => {
  ordered.length = 0;
  for (let index = 0; index < candidateCount; index += 1) {
    const candidate = candidates[index];
    if (candidate) {
      let at = ordered.length;
      ordered.push(candidate);
      while (at > 0 && (ordered[at - 1]?.base ?? 0) > candidate.base) {
        ordered[at] = ordered[at - 1] ?? candidate;
        at -= 1;
      }
      ordered[at] = candidate;
    }
  }
  return ordered;
};

const followLine = (
  rider: RiderState,
  lanes: readonly number[],
  threatIn: (index: number) => Threat | undefined
): void => {
  const current = nearestLaneIndex(lanes, rider.x);
  const ahead = threatIn(current);
  const lane = lanes[current];
  if (ahead && lane !== undefined) {
    propose(
      rider,
      lane,
      Math.max(0, ahead.speed),
      LANE_RANK_COST * current + FOLLOW_COST,
      "free",
      current,
      false
    );
  }
};

const proposeAroundHazards = (
  state: RaceState,
  rider: RiderState,
  cruise: number,
  room: number,
  lanes: readonly number[]
): void => {
  const offLane = (x: number): void => {
    const line = clamp(x, -room, room);
    propose(
      rider,
      line,
      cruise,
      LANE_RANK_COST * nearestLaneIndex(lanes, line) + OFF_LANE_COST,
      "between",
      -1,
      false
    );
  };
  for (const index of inSight) {
    const hazard = state.hazards[index];
    if (hazard) {
      offLane(hazard.x + dodgeReach(hazard));
      offLane(hazard.x - dodgeReach(hazard));
    }
  }
  for (const car of state.cars) {
    if (passable(rider, car)) {
      offLane(car.x + passOffsetOf(car));
      offLane(car.x - passOffsetOf(car));
    }
  }
  if (Number.isFinite(rider.pilotLine)) {
    offLane(rider.pilotLine);
  }
};

const roll = (state: RaceState): number => {
  state.dice = nextSeed(state.dice);
  return unitOf(state.dice);
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

const proposeAroundRamp = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  jumpIndex: number,
  cruise: number,
  room: number,
  lanes: readonly number[]
): void => {
  const jump = track.features[jumpIndex];
  if (!jump) {
    return;
  }
  const drawn =
    Math.abs(rider.x - jump.x) < JUMP_PULL ||
    Math.abs(rider.pilotLine - jump.x) < JUMP_PULL;
  const landsOnRoad =
    Math.abs(jump.x) < track.roadHalfWidth - JUMP_LANDING_ROOM;
  if (drawn && landsOnRoad) {
    const misread = misreads(state, rider, jumpIndex);
    const deck = lineOnto(track, jump, riderIndex, rider, misread);
    propose(
      rider,
      deck,
      cruise,
      LANE_RANK_COST * nearestLaneIndex(lanes, rider.x) + RAMP_COST,
      "free",
      -1,
      misread
    );
  }
  const wall = jump.width / 2 + JUMP_WALL_CLEARANCE;
  for (const side of [-1, 1]) {
    const x = jump.x + side * wall;
    if (Math.abs(x) <= room) {
      propose(
        rider,
        x,
        cruise,
        LANE_RANK_COST * nearestLaneIndex(lanes, x) + OFF_LANE_COST,
        "between",
        -1,
        false
      );
    }
  }
};

const committedLine = (
  track: Track,
  riderIndex: number,
  rider: RiderState,
  jumpIndex: number,
  cruise: number
): Aim | undefined => {
  const jump = track.features[jumpIndex];
  if (!jump || jump.s > rider.s) {
    return undefined;
  }
  if (Math.abs(rider.x - jump.x) <= jump.width / 2) {
    return { speed: Math.min(cruise, safeLaunchSpeed(jump)), x: jump.x };
  }
  return rider.jumpSeen === jumpIndex && rider.jumpMisread
    ? { speed: cruise, x: lineOnto(track, jump, riderIndex, rider, true) }
    : undefined;
};

interface Choice {
  cost: number;
  kind: CandidateKind;
  speed: number;
  x: number;
}

const choice: Choice = {
  cost: Number.POSITIVE_INFINITY,
  kind: "lane",
  speed: 0,
  x: 0,
};

const pickLine = (
  track: Track,
  rider: RiderState,
  weighing: boolean,
  reference: number,
  open: (candidate: Candidate) => boolean
): Choice => {
  choice.cost = Number.POSITIVE_INFINITY;
  for (const candidate of orderCandidates()) {
    if (candidate.base >= choice.cost) {
      break;
    }
    if (open(candidate)) {
      const weighed = weighing
        ? weighLine(
            track,
            rider,
            candidate.x,
            candidate.speed,
            reference,
            candidate.blind,
            choice.cost - candidate.base
          )
        : { cost: 0, speed: candidate.speed };
      if (candidate.base + weighed.cost < choice.cost) {
        choice.cost = candidate.base + weighed.cost;
        choice.kind = candidate.kind;
        choice.speed = weighed.speed;
        choice.x = candidate.x;
      }
    }
  }
  return choice;
};

const chooseLine = (
  state: RaceState,
  track: Track,
  riderIndex: number,
  rider: RiderState,
  cruise: number,
  pursuit?: Aim
): Aim => {
  const jumpIndex = jumpAhead(
    track,
    rider,
    rider.speed * JUMP_SIGHT_SECONDS + JUMP_SIGHT_EXTRA
  );
  const committed = committedLine(track, riderIndex, rider, jumpIndex, cruise);
  if (committed) {
    rider.pilotLine = Number.NaN;
    return committed;
  }
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
  const open = (candidate: Candidate): boolean => {
    if (candidate.kind === "lane") {
      return !threatIn(candidate.lane) && !crossesBlocked(candidate.x);
    }
    return (
      candidate.kind === "free" ||
      (!laneThreat(state, riderIndex, rider, candidate.x) &&
        !crossesBlocked(candidate.x))
    );
  };
  gatherInSight(state, rider, hazardSightOf(rider, track.features[jumpIndex]));
  const obstructed =
    gatherObstructions(state, track, rider, inSight, jumpIndex) > 0;
  const weighing =
    obstructed || jumpIndex >= 0 || Number.isFinite(rider.pilotLine);
  const room = track.roadHalfWidth - BIKE_HALF_WIDTH - DODGE_EDGE;
  const reference = Math.min(cruise, topSpeedOf(rider.bike));
  candidateCount = 0;
  if (pursuit) {
    propose(rider, pursuit.x, pursuit.speed, PURSUIT_COST, "free", -1, false);
  }
  for (const [index, lane] of lanes.entries()) {
    propose(rider, lane, cruise, LANE_RANK_COST * index, "lane", index, false);
  }
  const current = nearestLaneIndex(lanes, rider.x);
  const neighbour = neighbourOf(lanes, sameWayLanes.length, current);
  const pace = threatIn(neighbour < sameWayLanes.length ? neighbour : current);
  propose(
    rider,
    seamOf(lanes, sameWayLanes.length, current, neighbour),
    Math.min(cruise, Math.max(0, pace?.speed ?? 0) + SPLITTING_SPEED),
    LANE_RANK_COST * lanes.length,
    "free",
    -1,
    false
  );
  if (weighing) {
    followLine(rider, lanes, threatIn);
    proposeAroundRamp(
      state,
      track,
      riderIndex,
      rider,
      jumpIndex,
      cruise,
      room,
      lanes
    );
    if (inSight.length > 0 || Number.isFinite(rider.pilotLine)) {
      proposeAroundHazards(state, rider, cruise, room, lanes);
    }
  }
  const chosen = pickLine(track, rider, weighing, reference, open);
  const stays =
    (chosen.kind === "between" ||
      Math.abs(chosen.x - rider.pilotLine) < LINE_MATCH) &&
    !lanes.some((lane, index) => !threatIn(index) && !crossesBlocked(lane));
  rider.pilotLine =
    inSight.length > 0 || jumpIndex >= 0 || stays ? chosen.x : Number.NaN;
  return { speed: chosen.speed, x: chosen.x };
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
  input.steer = steerToward(rider, aim.x, curvatureAt(track, rider.s));

  const skill = Math.min(1, rider.profile.skill + pace.lift);
  const targetSpeed = Math.min(
    aim.speed,
    cornerSpeedLimit(track, rider) * skill
  );
  const excess = rider.speed - targetSpeed;
  input.brake = brakeFor(excess);
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
    police
      ? copAim(state, track, riderIndex, rider)
      : chooseLine(state, track, riderIndex, rider, Number.POSITIVE_INFINITY)
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
