import type { RoadLevel } from "./road.ts";
import type { Track } from "./track.ts";

export interface Ramp {
  readonly kind: "jump";
  readonly length: number;
  readonly width: number;
  readonly rise: number;
}

export type FeatureSpec = Ramp;

export interface FeatureRule {
  readonly placement: "fixed";
  readonly id: string;
  readonly fromLevel: RoadLevel;
  readonly s: number;
  readonly x: number;
  readonly feature: FeatureSpec;
}

interface Placed {
  readonly id: string;
  readonly s: number;
  readonly x: number;
  readonly fromS: number;
  readonly toS: number;
}

export type TrackFeature = FeatureSpec & Placed;

export interface FeatureIndex {
  readonly originS: number;
  readonly cellLength: number;
  readonly offsets: Uint32Array;
  readonly featureIndices: Uint32Array;
}

export interface Support {
  height: number;
  slope: number;
  slopeRate: number;
  feature: number;
}

export const FEATURE_CELL_LENGTH = 32;
export const START_CLEARANCE = 300;
export const JUMP_APPROACH = 80;
export const FASTEST_LAUNCH = 85;
const LANDING_MARGIN = 25;
const GRAVITY = 9.81;

export const lipOf = (jump: Ramp & Placed): number => jump.s + jump.length;

export const lipSlopeOf = (jump: Ramp): number => (2 * jump.rise) / jump.length;

export const flatFlightLength = (jump: Ramp, speed: number): number => {
  const climb = lipSlopeOf(jump) * speed;
  const seconds =
    (climb + Math.sqrt(climb * climb + 2 * GRAVITY * jump.rise)) / GRAVITY;
  return speed * seconds;
};

export const landingCorridorOf = (jump: Ramp): number =>
  flatFlightLength(jump, FASTEST_LAUNCH) + LANDING_MARGIN;

export interface FeatureBounds {
  readonly roadHalfWidth: number;
  readonly length: number;
  readonly level: number;
}

const reject = (rule: FeatureRule, reason: string): never => {
  throw new Error(`Track feature "${rule.id}" ${reason}.`);
};

const place = (rule: FeatureRule): TrackFeature => {
  const { feature } = rule;
  return {
    ...feature,
    fromS: rule.s - JUMP_APPROACH,
    id: rule.id,
    s: rule.s,
    toS: rule.s + feature.length + landingCorridorOf(feature),
    x: rule.x,
  };
};

const checkSize = (rule: FeatureRule, roadHalfWidth: number): void => {
  const { feature } = rule;
  const numbers = [rule.s, rule.x, feature.length, feature.width, feature.rise];
  if (!numbers.every((value) => Number.isFinite(value))) {
    reject(rule, "has a number that is not finite");
  }
  if (feature.length <= 0 || feature.width <= 0 || feature.rise <= 0) {
    reject(rule, "needs a positive length, width, and rise");
  }
  if (Math.abs(rule.x) + feature.width / 2 > roadHalfWidth) {
    reject(rule, "hangs over the edge of the road");
  }
};

const checkOverlaps = (placed: readonly TrackFeature[]): void => {
  const ordered = placed.toSorted((left, right) => left.fromS - right.fromS);
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1];
    const after = ordered[index];
    if (before && after && after.fromS < before.toS) {
      throw new Error(
        `Track feature "${after.id}" sits in the approach or landing of "${before.id}".`
      );
    }
  }
};

export const compileFeatures = (
  rules: readonly FeatureRule[],
  bounds: FeatureBounds
): TrackFeature[] => {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (rule.id === "" || seen.has(rule.id)) {
      reject(rule, "needs an id of its own");
    }
    seen.add(rule.id);
    checkSize(rule, bounds.roadHalfWidth);
  }
  const placed = rules.map(place);
  checkOverlaps(placed);
  const active = placed.filter(
    (_, index) =>
      (rules[index]?.fromLevel ?? Number.POSITIVE_INFINITY) <= bounds.level
  );
  for (const feature of active) {
    if (feature.fromS < START_CLEARANCE) {
      throw new Error(
        `Track feature "${feature.id}" is too close to the start.`
      );
    }
    if (feature.toS > bounds.length) {
      throw new Error(`Track feature "${feature.id}" runs past the finish.`);
    }
  }
  return active.toSorted(
    (left, right) => left.s - right.s || (left.id < right.id ? -1 : 1)
  );
};

const cellOf = (index: FeatureIndex, s: number): number =>
  Math.min(
    index.offsets.length - 2,
    Math.max(0, Math.floor((s - index.originS) / index.cellLength))
  );

export const indexFeatures = (
  features: readonly TrackFeature[],
  startS: number,
  endS: number
): FeatureIndex => {
  const cells = Math.max(1, Math.ceil((endS - startS) / FEATURE_CELL_LENGTH));
  const shell: FeatureIndex = {
    cellLength: FEATURE_CELL_LENGTH,
    featureIndices: new Uint32Array(0),
    offsets: new Uint32Array(cells + 1),
    originS: startS,
  };
  const counts = new Uint32Array(cells);
  for (const feature of features) {
    for (
      let cell = cellOf(shell, feature.fromS);
      cell <= cellOf(shell, feature.toS);
      cell += 1
    ) {
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  const offsets = new Uint32Array(cells + 1);
  for (let cell = 0; cell < cells; cell += 1) {
    offsets[cell + 1] = (offsets[cell] ?? 0) + (counts[cell] ?? 0);
  }
  const featureIndices = new Uint32Array(offsets[cells] ?? 0);
  const filled = offsets.slice(0, cells);
  for (const [featureIndex, feature] of features.entries()) {
    for (
      let cell = cellOf(shell, feature.fromS);
      cell <= cellOf(shell, feature.toS);
      cell += 1
    ) {
      const at = filled[cell] ?? 0;
      featureIndices[at] = featureIndex;
      filled[cell] = at + 1;
    }
  }
  return { ...shell, featureIndices, offsets };
};

const onDeck = (jump: TrackFeature, s: number, x: number): boolean =>
  s >= jump.s &&
  s <= jump.s + jump.length &&
  Math.abs(x - jump.x) <= jump.width / 2;

export const supportAt = (
  track: Track,
  s: number,
  x: number,
  out: Support
): Support => {
  out.height = 0;
  out.slope = 0;
  out.slopeRate = 0;
  out.feature = -1;
  const index = track.featureIndex;
  const cell = cellOf(index, s);
  const end = index.offsets[cell + 1] ?? 0;
  for (let at = index.offsets[cell] ?? 0; at < end; at += 1) {
    const featureIndex = index.featureIndices[at] ?? 0;
    const jump = track.features[featureIndex];
    if (jump && onDeck(jump, s, x)) {
      const u = (s - jump.s) / jump.length;
      out.height = jump.rise * u * u;
      out.slope = (2 * jump.rise * u) / jump.length;
      out.slopeRate = (2 * jump.rise) / (jump.length * jump.length);
      out.feature = featureIndex;
      return out;
    }
  }
  return out;
};

export const emptySupport = (): Support => ({
  feature: -1,
  height: 0,
  slope: 0,
  slopeRate: 0,
});

export const nextJumpFrom = (track: Track, s: number): number => {
  const { features } = track;
  let low = 0;
  let high = features.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const jump = features[middle];
    if (jump && lipOf(jump) < s) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low < features.length ? low : -1;
};

export interface Crossing {
  feature: number;
  enter: number;
  leave: number;
  enterSide: boolean;
  leaveSide: boolean;
}

export const emptyCrossing = (): Crossing => ({
  enter: 0,
  enterSide: false,
  feature: -1,
  leave: 0,
  leaveSide: false,
});

const crossJump = (
  jump: TrackFeature,
  fromS: number,
  fromX: number,
  alongS: number,
  alongX: number,
  out: Crossing
): boolean => {
  const halfWidth = jump.width / 2;
  let enterS = Number.NEGATIVE_INFINITY;
  let leaveS = Number.POSITIVE_INFINITY;
  if (alongS === 0) {
    if (fromS < jump.s || fromS > lipOf(jump)) {
      return false;
    }
  } else {
    const toe = (jump.s - fromS) / alongS;
    const lip = (lipOf(jump) - fromS) / alongS;
    enterS = Math.min(toe, lip);
    leaveS = Math.max(toe, lip);
  }
  let enterX = Number.NEGATIVE_INFINITY;
  let leaveX = Number.POSITIVE_INFINITY;
  if (alongX === 0) {
    if (Math.abs(fromX - jump.x) > halfWidth) {
      return false;
    }
  } else {
    const left = (jump.x - halfWidth - fromX) / alongX;
    const right = (jump.x + halfWidth - fromX) / alongX;
    enterX = Math.min(left, right);
    leaveX = Math.max(left, right);
  }
  const enter = Math.max(enterS, enterX);
  const leave = Math.min(leaveS, leaveX);
  if (enter > leave || enter > 1 || leave < 0) {
    return false;
  }
  out.enter = enter;
  out.leave = leave;
  out.enterSide = enterX > enterS;
  out.leaveSide = leaveX < leaveS;
  return true;
};

export const crossRamps = (
  track: Track,
  fromS: number,
  fromX: number,
  toS: number,
  toX: number,
  out: Crossing
): Crossing => {
  out.feature = -1;
  const first = nextJumpFrom(track, Math.min(fromS, toS));
  const reach = Math.max(fromS, toS);
  if (first < 0) {
    return out;
  }
  for (let index = first; index < track.features.length; index += 1) {
    const jump = track.features[index];
    if (!jump || jump.s > reach) {
      break;
    }
    if (crossJump(jump, fromS, fromX, toS - fromS, toX - fromX, out)) {
      out.feature = index;
      return out;
    }
  }
  return out;
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

export const deckHeightOf = (jump: Ramp & Placed, s: number): number => {
  const u = clampUnit((s - jump.s) / jump.length);
  return jump.rise * u * u;
};

export const deckSlopeOf = (jump: Ramp & Placed, s: number): number =>
  (2 * jump.rise * clampUnit((s - jump.s) / jump.length)) / jump.length;
