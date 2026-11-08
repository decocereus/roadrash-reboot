import type { Centreline } from "./alignment.ts";
import type { TrackCrossing } from "./crossings.ts";
import { roadHalfWidthAt, vergeHalfWidthAt } from "./districts.ts";
import type { RoadWidths } from "./districts.ts";
import { createRandom, nextSeed } from "./random.ts";
import type { WalkSite } from "./walk-sites.ts";

export const stallVariants = [
  "fabric",
  "food_cart",
  "fruit",
  "neon",
  "noodle",
  "parts",
] as const;

export type StallVariant = (typeof stallVariants)[number];

interface StallSize {
  readonly deep: number;
  readonly wide: number;
}

export const stallSizes = {
  fabric: { deep: 3, wide: 5 },
  food_cart: { deep: 2.6, wide: 3.2 },
  fruit: { deep: 3, wide: 4 },
  neon: { deep: 3.2, wide: 3.2 },
  noodle: { deep: 3.2, wide: 4.4 },
  parts: { deep: 3, wide: 4.6 },
} as const satisfies Record<StallVariant, StallSize>;

export const LONGEST_STALL_HALF =
  Math.max(...stallVariants.map((variant) => stallSizes[variant].wide)) / 2;

export const STALL_FRONT_FROM_ROAD = 2.6;

export interface Bazaar {
  readonly from: number;
  readonly to: number;
}

export interface StallFootprint {
  readonly id: string;
  readonly variant: StallVariant;
  readonly s: number;
  readonly x: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

interface LaidBazaars {
  readonly bazaars: readonly Bazaar[];
  readonly name: string;
  readonly seed: number;
}

type RoadAlong = Centreline & RoadWidths;

const STALL_SEED_SALT = 0xba_2a;
const LEAST_GAP = 2;
const GAP_SPREAD = 1;
const TREE_AND_BLOCK_MARGIN = 1.5;
const WALK_GAP = 1.5;
const SIDES = [-1, 1] as const;

const variantFitting = (
  roll: number,
  previous: StallVariant | null,
  room: number
): StallVariant | undefined => {
  const choices = stallVariants.filter(
    (variant) => variant !== previous && stallSizes[variant].wide <= room
  );
  return choices[Math.floor(roll * choices.length)];
};

const freeRuns = (
  { from, to }: Bazaar,
  crossings: readonly TrackCrossing[],
  walkSites: readonly WalkSite[]
): Bazaar[] => {
  const taken = [
    ...crossings.map(({ fromS, toS }) => ({ from: fromS, to: toS })),
    ...walkSites.map(({ s }) => ({ from: s - WALK_GAP, to: s + WALK_GAP })),
  ].toSorted((left, right) => left.from - right.from);
  const runs: Bazaar[] = [];
  let start = from;
  for (const stretch of taken) {
    if (stretch.from > start && start < to) {
      runs.push({ from: start, to: Math.min(stretch.from, to) });
    }
    start = Math.max(start, stretch.to);
  }
  if (start < to) {
    runs.push({ from: start, to });
  }
  return runs;
};

const footprintOn = (
  road: RoadAlong,
  variant: StallVariant,
  from: number,
  side: -1 | 1
): Omit<StallFootprint, "id"> | null => {
  const { deep, wide } = stallSizes[variant];
  const to = from + wide;
  const front =
    Math.max(roadHalfWidthAt(road, from), roadHalfWidthAt(road, to)) +
    STALL_FRONT_FROM_ROAD;
  const verge = Math.min(
    vergeHalfWidthAt(road, from),
    vergeHalfWidthAt(road, to)
  );
  if (front + deep > verge) {
    return null;
  }
  return {
    halfLength: wide / 2,
    halfWidth: deep / 2,
    s: from + wide / 2,
    variant,
    x: side * (front + deep / 2),
  };
};

const placeAlong = (
  road: RoadAlong,
  runs: readonly Bazaar[],
  side: -1 | 1,
  seed: number
): Omit<StallFootprint, "id">[] => {
  const random = createRandom(nextSeed(seed + STALL_SEED_SALT + side));
  const placed: Omit<StallFootprint, "id">[] = [];
  let previous: StallVariant | null = null;
  for (const run of runs) {
    let { from } = run;
    let variant = variantFitting(random(), previous, run.to - from);
    while (variant) {
      const footprint = footprintOn(road, variant, from, side);
      if (footprint) {
        placed.push(footprint);
      }
      previous = variant;
      from += stallSizes[variant].wide + LEAST_GAP + random() * GAP_SPREAD;
      variant = variantFitting(random(), previous, run.to - from);
    }
  }
  return placed;
};

const checkBazaars = (
  { bazaars, name }: LaidBazaars,
  { length }: Centreline
): void => {
  for (const { from, to } of bazaars) {
    if (!(from >= 0 && to <= length && from < to)) {
      throw new Error(
        `A bazaar on ${name} runs ${from} to ${to}, which is not a stretch of its ${length} m.`
      );
    }
  }
  let before: Bazaar | null = null;
  for (const after of bazaars.toSorted((one, other) => one.from - other.from)) {
    if (before && after.from < before.to) {
      throw new Error(
        `Two bazaars on ${name} overlap, ${before.from} to ${before.to} and ${after.from} to ${after.to}.`
      );
    }
    before = after;
  }
};

export const placeStalls = (
  laid: LaidBazaars,
  road: RoadAlong,
  crossings: readonly TrackCrossing[],
  walkSites: readonly WalkSite[]
): StallFootprint[] => {
  checkBazaars(laid, road);
  return laid.bazaars
    .flatMap((bazaar) => {
      const runs = freeRuns(bazaar, crossings, walkSites);
      return SIDES.flatMap((side) => placeAlong(road, runs, side, laid.seed));
    })
    .toSorted((left, right) => left.s - right.s)
    .map((stall, index) => ({ ...stall, id: `stall-${index}` }));
};

export const stallClaims = (
  stalls: readonly StallFootprint[],
  s: number,
  x: number,
  radius: number
): boolean => {
  const reach = radius + TREE_AND_BLOCK_MARGIN;
  return stalls.some(
    (stall) =>
      Math.abs(stall.s - s) < stall.halfLength + reach &&
      Math.abs(stall.x - x) < stall.halfWidth + reach
  );
};
