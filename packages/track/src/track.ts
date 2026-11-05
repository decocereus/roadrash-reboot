import { sampleAlignment, sampleAlong } from "./alignment.ts";
import type { Alignment, Centreline } from "./alignment.ts";
import { armClaims, compileCrossings } from "./crossings.ts";
import type { CrossingRule, TrackCrossing } from "./crossings.ts";
import {
  checkCrossingsOffTapers,
  checkDistricts,
  roadHalfWidthAt,
  roadWidthsOf,
  tapersOf,
  vergeHalfWidthAt,
  widestLanes,
} from "./districts.ts";
import type {
  Districts,
  LaneCentres,
  LaneCount,
  RoadWidths,
} from "./districts.ts";
import { placeHazards } from "./hazards.ts";
import type { HazardPlacement } from "./hazards.ts";
import { cos, sin } from "./math.ts";
import { createRandom, nextSeed } from "./random.ts";
import { regions } from "./regions.ts";
import type { RegionId } from "./regions.ts";
import { placeStalls, stallClaims } from "./stalls.ts";
import type { Bazaar, StallFootprint } from "./stalls.ts";
import { placeWalkSites } from "./walk-sites.ts";
import type { WalkSite } from "./walk-sites.ts";

export type GroundPoint = readonly [x: number, z: number];

export type GroundCover = "grass" | "paving";

export interface SceneryBlock {
  readonly height: number;
  readonly lift: number;
  readonly ring: readonly GroundPoint[];
}

export interface SceneryPatch {
  readonly cover: GroundCover;
  readonly ring: readonly GroundPoint[];
}

export interface SceneryWater {
  readonly level: number;
  readonly ring: readonly GroundPoint[];
}

export interface Scenery {
  readonly blocks: readonly SceneryBlock[];
  readonly cover: GroundCover;
  readonly patches: readonly SceneryPatch[];
  readonly water: readonly SceneryWater[];
}

interface Crowd {
  readonly from: number;
  readonly to: number;
  readonly sites: number;
}

export interface TrackPlan extends Alignment {
  readonly bazaars: readonly Bazaar[];
  readonly id: string;
  readonly chevrons: readonly ChevronRun[];
  readonly crossings: readonly CrossingRule[];
  readonly crowds: readonly Crowd[];
  readonly districts: Districts;
  readonly name: string;
  readonly region: RegionId;
  readonly seed: number;
  readonly laneWidth: number;
  readonly trafficPerKilometre: number;
  readonly hazardsPerKilometre: number;
  readonly carriers: readonly number[];
  readonly scenery?: Scenery;
}

export interface ChevronRun {
  readonly from: number;
  readonly to: number;
  readonly side: -1 | 1;
}

export type TrackPropKind = "tree" | "pole" | "chevron" | "rock" | "gate";

export interface TrackProp {
  readonly kind: TrackPropKind;
  readonly s: number;
  readonly x: number;
  readonly radius: number;
  readonly scale: number;
}

export interface Track extends Centreline, RoadWidths {
  readonly plan: TrackPlan;
  readonly sameWayLanes: LaneCentres;
  readonly oncomingLanes: LaneCentres;
  readonly props: readonly TrackProp[];
  readonly solidProps: readonly TrackProp[];
  readonly stalls: readonly StallFootprint[];
  readonly carrierStarts: readonly number[];
  readonly hazards: readonly HazardPlacement[];
  readonly crossings: readonly TrackCrossing[];
  readonly walkSites: readonly WalkSite[];
}

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  heading: number;
  slope: number;
}

const ROCK_SEED_SALT = 0x70_c5;
const ARM_PROP_MARGIN = 3;
const CARRIER_START_CLEARANCE = 300;

const laneCentres = (
  laneWidth: number,
  lanes: LaneCount,
  side: number
): LaneCentres => {
  const centre = (lane: number): number => side * (lane + 0.5) * laneWidth;
  switch (lanes) {
    case 1: {
      return [centre(0)];
    }
    case 2: {
      return [centre(0), centre(1)];
    }
    case 3: {
      return [centre(0), centre(1), centre(2)];
    }
    default: {
      return lanes satisfies never;
    }
  }
};

const scatterProps = (
  plan: TrackPlan,
  road: Centreline & RoadWidths
): TrackProp[] => {
  const { length } = road;
  const props: TrackProp[] = [];
  const mix = regions[plan.region].propMix;
  const random = createRandom(plan.seed);
  const rockRandom = createRandom(nextSeed(plan.seed + ROCK_SEED_SALT));
  const startS = -plan.leadInLength;
  const endS = length + plan.runoffLength;

  for (let s = startS; s < endS; s += 6) {
    const grove = 0.55 + 0.4 * sin(s / 140) * sin(s / 53 + 1.7);
    for (const side of [-1, 1]) {
      if (random() < grove * mix.tree) {
        const spread = random();
        const at = s + random() * 5;
        props.push({
          kind: "tree",
          radius: 0.4,
          s: at,
          scale: 0.8 + random() * 0.9,
          x: side * (roadHalfWidthAt(road, at) + 4 + spread * spread * 60),
        });
      }
    }
  }

  if (mix.pole > 0) {
    for (let s = startS + 20; s < endS; s += 45 / mix.pole) {
      props.push({
        kind: "pole",
        radius: 0.18,
        s,
        scale: 1,
        x: roadHalfWidthAt(road, s) + 2.4,
      });
    }
  }

  if (mix.chevron > 0) {
    for (const run of plan.chevrons.filter((each) => each.to < length)) {
      for (let s = run.from; s <= run.to; s += 18 / mix.chevron) {
        props.push({
          kind: "chevron",
          radius: 0.2,
          s,
          scale: 1,
          x: run.side * (roadHalfWidthAt(road, s) + 1.8),
        });
      }
    }
  }

  if (mix.rock > 0) {
    for (let s = 180; s < length; s += (70 + rockRandom() * 90) / mix.rock) {
      const side = rockRandom() < 0.5 ? -1 : 1;
      props.push({
        kind: "rock",
        radius: 0.75,
        s,
        scale: 0.8 + rockRandom() * 0.7,
        x: side * (roadHalfWidthAt(road, s) + 2.5 + rockRandom() * 5),
      });
    }
  }

  props.push(
    { kind: "gate", radius: 0, s: 0, scale: 1, x: 0 },
    { kind: "gate", radius: 0, s: length, scale: 1, x: 0 }
  );

  return props.toSorted((left, right) => left.s - right.s);
};

const givesWayToStall = (
  stalls: readonly StallFootprint[],
  { kind, radius, s, x }: TrackProp
): boolean =>
  (kind === "tree" || kind === "rock") && stallClaims(stalls, s, x, radius);

const carrierStartsOf = (
  plan: TrackPlan,
  length: number
): readonly number[] => {
  if (plan.trafficPerKilometre <= 0) {
    return [];
  }
  const starts = plan.carriers.toSorted((left, right) => left - right);
  for (const s of starts) {
    if (s < CARRIER_START_CLEARANCE || s > length) {
      throw new Error(`A carrier on ${plan.name} starts off the road at ${s}.`);
    }
  }
  return starts;
};

export const compileTrack = (plan: TrackPlan): Track => {
  const centreline = sampleAlignment(plan);
  const { length } = centreline;
  const tapers = tapersOf(plan);
  checkDistricts(plan, tapers, length);
  const along = {
    ...centreline,
    ...roadWidthsOf(plan, tapers, centreline),
  };
  const crossings = compileCrossings(plan.crossings, centreline);
  checkCrossingsOffTapers(plan, crossings, tapers);
  const widest = widestLanes(plan.districts);
  const stalls = placeStalls(plan, along, crossings);
  const props = scatterProps(plan, along).filter(
    (prop) =>
      !armClaims(crossings, prop.s, prop.s, prop.x, ARM_PROP_MARGIN) &&
      !givesWayToStall(stalls, prop)
  );

  const road = {
    ...along,
    carrierStarts: carrierStartsOf(plan, length),
    crossings,
    oncomingLanes: laneCentres(plan.laneWidth, widest, -1),
    plan,
    props,
    sameWayLanes: laneCentres(plan.laneWidth, widest, 1),
    solidProps: props.filter(
      (prop) =>
        prop.radius > 0 &&
        Math.abs(prop.x) < vergeHalfWidthAt(along, prop.s) + 1
    ),
    stalls,
  };
  const placed = { ...road, hazards: placeHazards(road) };
  return { ...placed, walkSites: placeWalkSites(placed) };
};

const sampleAt = sampleAlong;

export const curvatureAt = (track: Track, s: number): number =>
  sampleAt(track, track.curvature, s);

export const heightAt = (track: Track, s: number): number =>
  sampleAt(track, track.worldY, s);

export const slopeAt = (track: Track, s: number): number =>
  sampleAt(track, track.slope, s);

export const slopeRateAt = (track: Track, s: number): number =>
  sampleAt(track, track.slopeRate, s);

const headingAt = (track: Track, s: number): number =>
  sampleAt(track, track.heading, s);

export const placeOnTrack = (
  track: Track,
  s: number,
  x: number,
  point: TrackPoint
): void => {
  const heading = headingAt(track, s);
  point.heading = heading;
  point.slope = slopeAt(track, s);
  point.x = sampleAt(track, track.worldX, s) + cos(heading) * x;
  point.y = heightAt(track, s);
  point.z = sampleAt(track, track.worldZ, s) + sin(heading) * x;
};

export const firstAlong = (
  list: readonly { readonly s: number }[],
  s: number
): number => {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const entry = list[middle];
    if (entry && entry.s < s) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};
