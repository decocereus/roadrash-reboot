import { compileFeatures, indexFeatures } from "./features.ts";
import type { FeatureIndex, FeatureRule, TrackFeature } from "./features.ts";
import { placeHazards } from "./hazards.ts";
import type { HazardPlacement } from "./hazards.ts";
import { createRandom, nextSeed } from "./random.ts";
import { regions } from "./regions.ts";
import type { RegionId } from "./regions.ts";

export interface TrackSection {
  readonly length: number;
  readonly turnDegrees: number;
  readonly climb: number;
}

export interface TrackPlan {
  readonly id: string;
  readonly name: string;
  readonly region: RegionId;
  readonly level: number;
  readonly seed: number;
  readonly lanesEachWay: 1 | 2;
  readonly laneWidth: number;
  readonly shoulderWidth: number;
  readonly vergeWidth: number;
  readonly leadInLength: number;
  readonly runoffLength: number;
  readonly trafficPerKilometre: number;
  readonly hazardsPerKilometre: number;
  readonly roadblocks: readonly number[];
  readonly sections: readonly TrackSection[];
  readonly features: readonly FeatureRule[];
}

export type TrackPropKind = "tree" | "pole" | "chevron" | "rock" | "gate";

export interface TrackProp {
  readonly kind: TrackPropKind;
  readonly s: number;
  readonly x: number;
  readonly radius: number;
  readonly scale: number;
}

export interface Track {
  readonly plan: TrackPlan;
  readonly length: number;
  readonly startS: number;
  readonly endS: number;
  readonly roadHalfWidth: number;
  readonly vergeHalfWidth: number;
  readonly sameWayLanes: readonly number[];
  readonly oncomingLanes: readonly number[];
  readonly sampleCount: number;
  readonly worldX: Float64Array;
  readonly worldY: Float64Array;
  readonly worldZ: Float64Array;
  readonly heading: Float64Array;
  readonly curvature: Float64Array;
  readonly slope: Float64Array;
  readonly slopeRate: Float64Array;
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

const CURVE_RAMP = 0.3;
const SHARP_CURVATURE = 1 / 420;
const ROCK_SEED_SALT = 0x70_c5;

const smoothstep = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
};

const roadHalfWidthOf = (plan: TrackPlan): number =>
  plan.lanesEachWay * plan.laneWidth + plan.shoulderWidth;

const laneCentres = (plan: TrackPlan, side: number): number[] => {
  const centres: number[] = [];
  for (let lane = 0; lane < plan.lanesEachWay; lane += 1) {
    centres.push(side * (lane + 0.5) * plan.laneWidth);
  }
  return centres;
};

const curveWeight = (progress: number): number => {
  if (progress < CURVE_RAMP) {
    return smoothstep(progress / CURVE_RAMP);
  }
  if (progress > 1 - CURVE_RAMP) {
    return smoothstep((1 - progress) / CURVE_RAMP);
  }
  return 1;
};

const scatterProps = (
  plan: TrackPlan,
  length: number,
  curvature: Float64Array
): TrackProp[] => {
  const props: TrackProp[] = [];
  const mix = regions[plan.region].propMix;
  const random = createRandom(plan.seed);
  const rockRandom = createRandom(nextSeed(plan.seed + ROCK_SEED_SALT));
  const roadHalfWidth = roadHalfWidthOf(plan);
  const startS = -plan.leadInLength;
  const endS = length + plan.runoffLength;
  const curvatureNear = (s: number): number =>
    curvature[Math.round(s - startS)] ?? 0;

  for (let s = startS; s < endS; s += 6) {
    const grove = 0.55 + 0.4 * Math.sin(s / 140) * Math.sin(s / 53 + 1.7);
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
    for (let s = 40; s < length; s += 18 / mix.chevron) {
      const bend = curvatureNear(s);
      if (Math.abs(bend) > SHARP_CURVATURE) {
        props.push({
          kind: "chevron",
          radius: 0.2,
          s,
          scale: 1,
          x: -Math.sign(bend) * (roadHalfWidth + 1.8),
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
  let length = 0;
  for (const section of plan.sections) {
    length += section.length;
  }
  const startS = -plan.leadInLength;
  const endS = length + plan.runoffLength;
  const sampleCount = Math.round(endS - startS) + 1;
  const worldX = new Float64Array(sampleCount);
  const worldY = new Float64Array(sampleCount);
  const worldZ = new Float64Array(sampleCount);
  const heading = new Float64Array(sampleCount);
  const curvature = new Float64Array(sampleCount);
  const slope = new Float64Array(sampleCount);
  const slopeRate = new Float64Array(sampleCount);

  let sectionIndex = 0;
  let sectionStart = 0;
  let sectionBaseHeight = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const s = startS + index;
    if (s >= 0 && s < length) {
      let section = plan.sections[sectionIndex];
      while (section && s >= sectionStart + section.length) {
        sectionStart += section.length;
        sectionBaseHeight += section.climb;
        sectionIndex += 1;
        section = plan.sections[sectionIndex];
      }
      if (section) {
        const progress = (s - sectionStart) / section.length;
        const turn = (section.turnDegrees * Math.PI) / 180;
        curvature[index] =
          (turn / (section.length * (1 - CURVE_RAMP))) * curveWeight(progress);
        worldY[index] =
          sectionBaseHeight +
          (section.climb * (1 - Math.cos(Math.PI * progress))) / 2;
        slope[index] =
          ((section.climb / section.length) *
            Math.PI *
            Math.sin(Math.PI * progress)) /
          2;
        slopeRate[index] =
          ((section.climb / (section.length * section.length)) *
            Math.PI *
            Math.PI *
            Math.cos(Math.PI * progress)) /
          2;
      }
    } else if (s >= length) {
      let finalHeight = 0;
      for (const section of plan.sections) {
        finalHeight += section.climb;
      }
      worldY[index] = finalHeight;
    }
  }

  const startIndex = plan.leadInLength;
  for (let index = startIndex + 1; index < sampleCount; index += 1) {
    const previous = index - 1;
    const meanCurvature =
      ((curvature[previous] ?? 0) + (curvature[index] ?? 0)) / 2;
    const previousHeading = heading[previous] ?? 0;
    const nextHeading = previousHeading + meanCurvature;
    const midHeading = (previousHeading + nextHeading) / 2;
    heading[index] = nextHeading;
    worldX[index] = (worldX[previous] ?? 0) + Math.sin(midHeading);
    worldZ[index] = (worldZ[previous] ?? 0) - Math.cos(midHeading);
  }
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    worldZ[index] = (worldZ[index + 1] ?? 0) + 1;
  }

  const props = scatterProps(plan, length, curvature);
  const roadHalfWidth = roadHalfWidthOf(plan);
  const vergeHalfWidth = roadHalfWidth + plan.vergeWidth;
  const features = compileFeatures(plan.features, {
    length,
    level: plan.level,
    roadHalfWidth,
  });

  const road = {
    curvature,
    endS,
    featureIndex: indexFeatures(features, startS, endS),
    features,
    heading,
    length,
    oncomingLanes: laneCentres(plan, -1),
    plan,
    props,
    roadHalfWidth,
    sameWayLanes: laneCentres(plan, 1),
    sampleCount,
    slope,
    slopeRate,
    solidProps: props.filter(
      (prop) => prop.radius > 0 && Math.abs(prop.x) < vergeHalfWidth + 1
    ),
    startS,
    vergeHalfWidth,
    worldX,
    worldY,
    worldZ,
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
  point.x = sampleAt(track, track.worldX, s) + Math.cos(heading) * x;
  point.y = heightAt(track, s);
  point.z = sampleAt(track, track.worldZ, s) + Math.sin(heading) * x;
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
