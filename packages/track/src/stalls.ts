import type { Centreline } from "./alignment.ts";
import type { TrackCrossing } from "./crossings.ts";
import { roadHalfWidthAt, vergeHalfWidthAt } from "./districts.ts";
import type { RoadWidths } from "./districts.ts";
import { createRandom, nextSeed } from "./random.ts";

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
const SIDES = [-1, 1] as const;

const variantAfter = (
  roll: number,
  previous: StallVariant | null
): StallVariant => {
  const choices = stallVariants.filter((variant) => variant !== previous);
  const variant = choices[Math.floor(roll * choices.length)];
  if (!variant) {
    throw new Error(`A dice roll of ${roll} picked no stall.`);
  }
  return variant;
};

const clearOfCrossings = (
  crossings: readonly TrackCrossing[],
  from: number,
  to: number
): boolean => crossings.every(({ fromS, toS }) => from >= toS || to <= fromS);

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
  crossings: readonly TrackCrossing[],
  bazaar: Bazaar,
  side: -1 | 1,
  seed: number
): Omit<StallFootprint, "id">[] => {
  const random = createRandom(nextSeed(seed + STALL_SEED_SALT + side));
  const placed: Omit<StallFootprint, "id">[] = [];
  let previous: StallVariant | null = null;
  let { from } = bazaar;
  for (;;) {
    const variant = variantAfter(random(), previous);
    const { wide } = stallSizes[variant];
    if (from + wide > bazaar.to) {
      return placed;
    }
    const footprint = clearOfCrossings(crossings, from, from + wide)
      ? footprintOn(road, variant, from, side)
      : null;
    if (footprint) {
      placed.push(footprint);
    }
    previous = variant;
    from += wide + LEAST_GAP + random() * GAP_SPREAD;
  }
};

const checkBazaars = (
  { bazaars, name }: LaidBazaars,
  { length }: Centreline
): void => {
  for (const { from, to } of bazaars) {
    if (from < 0 || to > length || from >= to) {
      throw new Error(
        `A bazaar on ${name} runs ${from} to ${to}, which is not a stretch of its ${length} m.`
      );
    }
  }
};

export const placeStalls = (
  laid: LaidBazaars,
  road: RoadAlong,
  crossings: readonly TrackCrossing[]
): StallFootprint[] => {
  checkBazaars(laid, road);
  return laid.bazaars
    .flatMap((bazaar) =>
      SIDES.flatMap((side) =>
        placeAlong(road, crossings, bazaar, side, laid.seed)
      )
    )
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
