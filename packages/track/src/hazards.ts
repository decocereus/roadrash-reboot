import { reservationOf } from "./features.ts";
import { createRandom, nextSeed } from "./random.ts";
import type { Random } from "./random.ts";
import { regions } from "./regions.ts";
import type { RoadLevel } from "./road.ts";
import type { Track } from "./track.ts";

export type HazardKind = "oil" | "rock" | "pothole";

export interface HazardSize {
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly height: number;
}

export const hazardSizes = {
  oil: { halfLength: 2.6, halfWidth: 1.1, height: 0 },
  pothole: { halfLength: 0.5, halfWidth: 0.6, height: 0 },
  rock: { halfLength: 0.45, halfWidth: 0.45, height: 0.45 },
} as const satisfies Record<HazardKind, HazardSize>;

export interface HazardPlacement {
  readonly id: string;
  readonly kind: HazardKind;
  readonly fromLevel: RoadLevel;
  readonly s: number;
  readonly x: number;
}

export const HAZARD_SIGHT = 170;
export const HAZARD_START_CLEARANCE = 450;
export const HAZARD_FINISH_CLEARANCE = 150;
export const HAZARD_RAMP_CLEARANCE = 30;
const SIGHT_EYES = [HAZARD_SIGHT, 130, 90, 50] as const;
const SIGHT_STEP = 5;
const EYE_HEIGHT = 1.2;
const TARGET_HEIGHT = 0.1;
const SIGHT_GROUND_CLEARANCE = 0.05;
const HAZARD_SEED_SALT = 0x4a_7d;
const SHORTEST_GAP_SHARE = 0.6;
const GAP_SPREAD_SHARE = 0.8;
const SAME_WAY_SHARE = 0.7;
const EDGE_MARGIN = 0.05;
const LANE_SPREAD = {
  oil: 0.5,
  pothole: 0.9,
  rock: 0,
} as const satisfies Record<HazardKind, number>;
const LEVEL_SHARES: readonly (readonly [RoadLevel, number])[] = [
  [1, 0.55],
  [2, 0.66],
  [3, 0.77],
  [4, 0.88],
  [5, 1],
];

type Road = Omit<Track, "hazards">;

const levelOf = (roll: number): RoadLevel =>
  LEVEL_SHARES.find(([, share]) => roll < share)?.[0] ?? 5;

const kindOf = (road: Road, roll: number): HazardKind => {
  const mix = regions[road.plan.region].hazardMix;
  const total = mix.oil + mix.rock + mix.pothole;
  if (roll * total < mix.oil) {
    return "oil";
  }
  return roll * total < mix.oil + mix.rock ? "rock" : "pothole";
};

export const rockLines = (road: Road): readonly number[] => {
  const edge = road.roadHalfWidth - hazardSizes.rock.halfWidth - EDGE_MARGIN;
  const dividers =
    road.plan.lanesEachWay === 2
      ? [road.plan.laneWidth, -road.plan.laneWidth]
      : [];
  return [0, ...dividers, edge, -edge];
};

const laneOf = (road: Road, roll: number): number => {
  const sameWay = roll < SAME_WAY_SHARE;
  const lanes = sameWay ? road.sameWayLanes : road.oncomingLanes;
  const share = sameWay
    ? roll / SAME_WAY_SHARE
    : (roll - SAME_WAY_SHARE) / (1 - SAME_WAY_SHARE);
  return (
    lanes[Math.min(lanes.length - 1, Math.floor(share * lanes.length))] ?? 0
  );
};

const acrossOf = (
  road: Road,
  kind: HazardKind,
  laneRoll: number,
  offsetRoll: number
): number => {
  if (kind === "rock") {
    const lines = rockLines(road);
    return (
      lines[Math.min(lines.length - 1, Math.floor(laneRoll * lines.length))] ??
      0
    );
  }
  const reach = road.roadHalfWidth - hazardSizes[kind].halfWidth - EDGE_MARGIN;
  const x = laneOf(road, laneRoll) + (offsetRoll * 2 - 1) * LANE_SPREAD[kind];
  return Math.min(reach, Math.max(-reach, x));
};

const sampleOf = (road: Road, values: Float64Array, s: number): number => {
  const position = Math.min(road.sampleCount - 1, Math.max(0, s - road.startS));
  const index = Math.min(road.sampleCount - 2, Math.floor(position));
  const from = values[index] ?? 0;
  return from + ((values[index + 1] ?? from) - from) * (position - index);
};

interface Spot {
  x: number;
  y: number;
  z: number;
}

const spotOf = (road: Road, s: number, x: number, lift: number, out: Spot) => {
  const heading = sampleOf(road, road.heading, s);
  out.x = sampleOf(road, road.worldX, s) + Math.cos(heading) * x;
  out.y = sampleOf(road, road.worldY, s) + lift;
  out.z = sampleOf(road, road.worldZ, s) + Math.sin(heading) * x;
};

const eye: Spot = { x: 0, y: 0, z: 0 };
const target: Spot = { x: 0, y: 0, z: 0 };

const seenFrom = (road: Road, s: number, x: number, distance: number) => {
  const from = s - distance;
  spotOf(road, from, x, EYE_HEIGHT, eye);
  spotOf(road, s, x, TARGET_HEIGHT, target);
  const steps = Math.ceil(distance / SIGHT_STEP);
  for (let step = 1; step < steps; step += 1) {
    const share = step / steps;
    const along = from + distance * share;
    const heading = sampleOf(road, road.heading, along);
    const chordX = eye.x + (target.x - eye.x) * share;
    const chordY = eye.y + (target.y - eye.y) * share;
    const chordZ = eye.z + (target.z - eye.z) * share;
    const across =
      (chordX - sampleOf(road, road.worldX, along)) * Math.cos(heading) +
      (chordZ - sampleOf(road, road.worldZ, along)) * Math.sin(heading);
    const ground = sampleOf(road, road.worldY, along) + SIGHT_GROUND_CLEARANCE;
    if (Math.abs(across) > road.vergeHalfWidth || chordY < ground) {
      return false;
    }
  }
  return true;
};

export const inSight = (road: Road, s: number, x: number): boolean =>
  SIGHT_EYES.every((distance) => seenFrom(road, s, x, distance));

const clearOfRamps = (road: Road, s: number, halfLength: number): boolean =>
  road.plan.features.every((rule) => {
    const [from, to] = reservationOf(rule);
    return (
      s + halfLength < from - HAZARD_RAMP_CLEARANCE ||
      s - halfLength > to + HAZARD_RAMP_CLEARANCE
    );
  });

const fits = (road: Road, kind: HazardKind, s: number, x: number): boolean =>
  s >= HAZARD_START_CLEARANCE &&
  s <= road.length - HAZARD_FINISH_CLEARANCE &&
  clearOfRamps(road, s, hazardSizes[kind].halfLength) &&
  inSight(road, s, x);

const gapOf = (rate: number, random: Random): number =>
  (1000 / rate) * (SHORTEST_GAP_SHARE + GAP_SPREAD_SHARE * random());

export const placeHazards = (road: Road): HazardPlacement[] => {
  const rate = road.plan.hazardsPerKilometre;
  if (rate <= 0) {
    return [];
  }
  const random = createRandom(nextSeed(road.plan.seed + HAZARD_SEED_SALT));
  const placed: HazardPlacement[] = [];
  let candidate = 0;
  for (
    let s = HAZARD_START_CLEARANCE + gapOf(rate, random) / 2;
    s < road.length;
    s += gapOf(rate, random)
  ) {
    candidate += 1;
    const kind = kindOf(road, random());
    const laneRoll = random();
    const offsetRoll = random();
    const fromLevel = levelOf(random());
    const x = acrossOf(road, kind, laneRoll, offsetRoll);
    if (fromLevel <= road.plan.level && fits(road, kind, s, x)) {
      placed.push({ fromLevel, id: `hazard-${candidate}`, kind, s, x });
    }
  }
  return placed;
};
