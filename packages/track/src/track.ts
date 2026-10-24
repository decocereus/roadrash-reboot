import { sampleAlignment } from "./alignment.ts";
import type { Alignment, Centreline } from "./alignment.ts";
import { compileFeatures, indexFeatures } from "./features.ts";
import type { FeatureIndex, FeatureRule, TrackFeature } from "./features.ts";
import { placeHazards } from "./hazards.ts";
import type { HazardPlacement } from "./hazards.ts";
import { cos, sin } from "./math.ts";
import { createRandom, nextSeed } from "./random.ts";
import { regions } from "./regions.ts";
import type { RegionId } from "./regions.ts";

export type GroundPoint = readonly [x: number, z: number];

export interface SceneryBlock {
  readonly height: number;
  readonly ring: readonly GroundPoint[];
}

export interface Lake {
  readonly level: number;
  readonly ring: readonly GroundPoint[];
}

export interface Scenery {
  readonly blocks: readonly SceneryBlock[];
  readonly lake: Lake;
}

export interface TrackPlan extends Alignment {
  readonly id: string;
  readonly chevrons: readonly ChevronRun[];
  readonly name: string;
  readonly region: RegionId;
  readonly level: number;
  readonly seed: number;
  readonly lanesEachWay: 1 | 2;
  readonly laneWidth: number;
  readonly shoulderWidth: number;
  readonly vergeWidth: number;
  readonly trafficPerKilometre: number;
  readonly hazardsPerKilometre: number;
  readonly roadblocks: readonly number[];
  readonly features: readonly FeatureRule[];
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

export type LaneCentres = readonly [number] | readonly [number, number];

export interface Track extends Centreline {
  readonly plan: TrackPlan;
  readonly roadHalfWidth: number;
  readonly vergeHalfWidth: number;
  readonly sameWayLanes: LaneCentres;
  readonly oncomingLanes: LaneCentres;
  readonly props: readonly TrackProp[];
  readonly solidProps: readonly TrackProp[];
  readonly features: readonly TrackFeature[];
  readonly featureIndex: FeatureIndex;
  readonly hazards: readonly HazardPlacement[];
}

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  heading: number;
  slope: number;
}

const ROCK_SEED_SALT = 0x70_c5;

const roadHalfWidthOf = (plan: TrackPlan): number =>
  plan.lanesEachWay * plan.laneWidth + plan.shoulderWidth;

const laneCentre = (plan: TrackPlan, side: number, lane: number): number =>
  side * (lane + 0.5) * plan.laneWidth;

const laneCentres = (plan: TrackPlan, side: number): LaneCentres =>
  plan.lanesEachWay === 2
    ? [laneCentre(plan, side, 0), laneCentre(plan, side, 1)]
    : [laneCentre(plan, side, 0)];

const scatterProps = (plan: TrackPlan, length: number): TrackProp[] => {
  const props: TrackProp[] = [];
  const mix = regions[plan.region].propMix;
  const random = createRandom(plan.seed);
  const rockRandom = createRandom(nextSeed(plan.seed + ROCK_SEED_SALT));
  const roadHalfWidth = roadHalfWidthOf(plan);
  const startS = -plan.leadInLength;
  const endS = length + plan.runoffLength;

  for (let s = startS; s < endS; s += 6) {
    const grove = 0.55 + 0.4 * sin(s / 140) * sin(s / 53 + 1.7);
    for (const side of [-1, 1]) {
      if (random() < grove * mix.tree) {
        const spread = random();
        props.push({
          kind: "tree",
          radius: 0.4,
          s: s + random() * 5,
          scale: 0.8 + random() * 0.9,
          x: side * (roadHalfWidth + 4 + spread * spread * 60),
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
        x: roadHalfWidth + 2.4,
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
          x: run.side * (roadHalfWidth + 1.8),
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
        x: side * (roadHalfWidth + 2.5 + rockRandom() * 5),
      });
    }
  }

  props.push(
    { kind: "gate", radius: 0, s: 0, scale: 1, x: 0 },
    { kind: "gate", radius: 0, s: length, scale: 1, x: 0 }
  );

  return props.toSorted((left, right) => left.s - right.s);
};

export const compileTrack = (plan: TrackPlan): Track => {
  const centreline = sampleAlignment(plan);
  const { endS, length, startS } = centreline;
  const props = scatterProps(plan, length);
  const roadHalfWidth = roadHalfWidthOf(plan);
  const vergeHalfWidth = roadHalfWidth + plan.vergeWidth;
  const features = compileFeatures(plan.features, {
    length,
    level: plan.level,
    roadHalfWidth,
  });

  const road = {
    ...centreline,
    featureIndex: indexFeatures(features, startS, endS),
    features,
    oncomingLanes: laneCentres(plan, -1),
    plan,
    props,
    roadHalfWidth,
    sameWayLanes: laneCentres(plan, 1),
    solidProps: props.filter(
      (prop) => prop.radius > 0 && Math.abs(prop.x) < vergeHalfWidth + 1
    ),
    vergeHalfWidth,
  };
  return { ...road, hazards: placeHazards(road) };
};

const sampleAt = (track: Track, values: Float64Array, s: number): number => {
  const position = Math.min(
    track.sampleCount - 1,
    Math.max(0, s - track.startS)
  );
  const index = Math.min(track.sampleCount - 2, Math.floor(position));
  const blend = position - index;
  const from = values[index] ?? 0;
  const to = values[index + 1] ?? from;
  return from + (to - from) * blend;
};

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

export const firstSolidPropFrom = (track: Track, s: number): number => {
  let low = 0;
  let high = track.solidProps.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const prop = track.solidProps[middle];
    if (prop && prop.s < s) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};
