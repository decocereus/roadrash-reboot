import type { Centreline } from "./alignment.ts";
import type { RoadLevel } from "./road.ts";

const crossingArms = ["both", "left", "right"] as const;

type CrossingArms = (typeof crossingArms)[number];

const walkMarkings = ["zebra", "unmarked"] as const;

type WalkMarking = (typeof walkMarkings)[number];

export interface CrossRoad {
  readonly arms: CrossingArms;
  readonly lanesEachWay: 1 | 2;
  readonly laneWidth: number;
}

export interface Lights {
  readonly offsetTicks: number;
}

export interface CrossingRule {
  readonly id: string;
  readonly fromLevel: RoadLevel;
  readonly s: number;
  readonly lights: Lights | null;
  readonly road: CrossRoad | null;
  readonly walk: WalkMarking;
}

export interface TrackCrossing {
  readonly id: string;
  readonly s: number;
  readonly lights: Lights | null;
  readonly road: CrossRoad | null;
  readonly walk: WalkMarking;
  readonly boxHalfLength: number;
  readonly stopGap: number;
  readonly fromS: number;
  readonly toS: number;
}

export type ArmSide = -1 | 1;

export const ZEBRA_WIDTH = 4;
const ZEBRA_GAP = 1;
const STOP_LINE_GAP = 1.5;
export const ARM_LENGTH = 60;
const CROSS_SHOULDER = 0.5;
const APPROACH = 30;
const START_CLEARANCE = 300;
const FINISH_CLEARANCE = 100;
const LEAST_SPACING = 120;
const STRAIGHT_CURVATURE = 1 / 400;
const STEEPEST_SLOPE = 0.06;
const SHARPEST_SLOPE_RATE = 0.002;
const SURVEY_STEP = 1;

export const crossHalfWidthOf = (road: CrossRoad): number =>
  road.lanesEachWay * road.laneWidth + CROSS_SHOULDER;

export const armSidesOf = (road: CrossRoad): readonly ArmSide[] => {
  switch (road.arms) {
    case "both": {
      return [-1, 1];
    }
    case "left": {
      return [-1];
    }
    case "right": {
      return [1];
    }
    default: {
      return road.arms satisfies never;
    }
  }
};

const boxHalfLengthOf = (rule: CrossingRule): number =>
  rule.road ? crossHalfWidthOf(rule.road) : 0;

const zebraOffsetOf = (boxHalfLength: number): number =>
  boxHalfLength > 0 ? boxHalfLength + ZEBRA_GAP + ZEBRA_WIDTH / 2 : 0;

const stopGapOf = (rule: CrossingRule): number =>
  zebraOffsetOf(boxHalfLengthOf(rule)) + ZEBRA_WIDTH / 2 + STOP_LINE_GAP;

export const zebrasOf = (crossing: TrackCrossing): readonly number[] => {
  const offset = zebraOffsetOf(crossing.boxHalfLength);
  return offset > 0 ? [crossing.s - offset, crossing.s + offset] : [crossing.s];
};

export const crossingReservationOf = (
  rule: CrossingRule
): readonly [from: number, to: number] => {
  const reach = stopGapOf(rule) + APPROACH;
  return [rule.s - reach, rule.s + reach];
};

const reject = (rule: CrossingRule, reason: string): never => {
  throw new Error(`Crossing "${rule.id}" ${reason}.`);
};

const checkNumbers = (rule: CrossingRule): void => {
  const numbers = [
    rule.s,
    rule.lights?.offsetTicks ?? 0,
    rule.road?.laneWidth ?? 1,
  ];
  if (!numbers.every((value) => Number.isFinite(value))) {
    reject(rule, "has a number that is not finite");
  }
  if (rule.road && rule.road.laneWidth <= 0) {
    reject(rule, "needs a cross road with a positive lane width");
  }
  if (rule.lights && !Number.isInteger(rule.lights.offsetTicks)) {
    reject(rule, "needs a whole number of ticks for its light offset");
  }
};

const sampleIndexOf = (centreline: Centreline, s: number): number =>
  Math.min(
    centreline.sampleCount - 1,
    Math.max(0, Math.round(s - centreline.startS))
  );

const checkGround = (rule: CrossingRule, centreline: Centreline): void => {
  const [from, to] = crossingReservationOf(rule);
  for (let s = from; s <= to; s += SURVEY_STEP) {
    const at = sampleIndexOf(centreline, s);
    if (Math.abs(centreline.curvature[at] ?? 0) > STRAIGHT_CURVATURE) {
      reject(rule, "sits on a bend");
    }
    if (
      Math.abs(centreline.slope[at] ?? 0) > STEEPEST_SLOPE ||
      Math.abs(centreline.slopeRate[at] ?? 0) > SHARPEST_SLOPE_RATE
    ) {
      reject(rule, "sits on a hill or a crest");
    }
  }
};

const checkSpacing = (
  rules: readonly CrossingRule[],
  reserved: readonly (readonly [from: number, to: number])[]
): void => {
  const ordered = rules.toSorted((left, right) => left.s - right.s);
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1];
    const after = ordered[index];
    if (
      before &&
      after &&
      crossingReservationOf(after)[0] - crossingReservationOf(before)[1] <
        LEAST_SPACING
    ) {
      reject(after, `is too close to crossing "${before.id}"`);
    }
  }
  for (const rule of rules) {
    const [from, to] = crossingReservationOf(rule);
    if (reserved.some(([start, end]) => from < end && to > start)) {
      reject(rule, "sits in the approach or landing of a ramp");
    }
  }
};

export const compileCrossings = (
  rules: readonly CrossingRule[],
  centreline: Centreline,
  level: number,
  rampReservations: readonly (readonly [from: number, to: number])[]
): TrackCrossing[] => {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (rule.id === "" || seen.has(rule.id)) {
      reject(rule, "needs an id of its own");
    }
    seen.add(rule.id);
    checkNumbers(rule);
  }
  checkSpacing(rules, rampReservations);
  const active = rules.filter((rule) => rule.fromLevel <= level);
  for (const rule of active) {
    const [from, to] = crossingReservationOf(rule);
    if (from < START_CLEARANCE) {
      reject(rule, "is too close to the start");
    }
    if (to > centreline.length - FINISH_CLEARANCE) {
      reject(rule, "is too close to the finish");
    }
    checkGround(rule, centreline);
  }
  return active
    .map((rule) => {
      const [fromS, toS] = crossingReservationOf(rule);
      return {
        boxHalfLength: boxHalfLengthOf(rule),
        fromS,
        id: rule.id,
        lights: rule.lights,
        road: rule.road,
        s: rule.s,
        stopGap: stopGapOf(rule),
        toS,
        walk: rule.walk,
      };
    })
    .toSorted((left, right) => left.s - right.s);
};

export const armClaims = (
  crossings: readonly TrackCrossing[],
  fromS: number,
  toS: number,
  side: number,
  margin: number
): boolean =>
  crossings.some(
    (crossing) =>
      crossing.road !== null &&
      fromS < crossing.s + crossing.boxHalfLength + margin &&
      toS > crossing.s - crossing.boxHalfLength - margin &&
      armSidesOf(crossing.road).some((arm) => arm * side > 0)
  );
