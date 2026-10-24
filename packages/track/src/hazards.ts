import { pieceSpans } from "./alignment.ts";
import { reservationOf } from "./features.ts";
import { cos, sin } from "./math.ts";
import { createRandom, nextSeed } from "./random.ts";
import type { Random } from "./random.ts";
import { regions } from "./regions.ts";
import type { HazardMix } from "./regions.ts";
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
  rock: { halfLength: 0.3, halfWidth: 0.3, height: 0.3 },
} as const satisfies Record<HazardKind, HazardSize>;

export type HazardSetting = "turnIn" | "apex" | "exit" | "crest" | "traffic";

export interface HazardPlacement {
  readonly id: string;
  readonly kind: HazardKind;
  readonly setting: HazardSetting;
  readonly fromLevel: RoadLevel;
  readonly s: number;
  readonly x: number;
}

const HAZARD_SIGHT = 25;
export const HAZARD_START_CLEARANCE = 450;
export const HAZARD_FINISH_CLEARANCE = 150;
export const HAZARD_RAMP_CLEARANCE = 30;
const HAZARD_LEAST_GAP = 60;
const BEND_TURN = (20 * Math.PI) / 180;
const SIGHT_STEP = 5;
const EYE_HEIGHT = 1.2;
const TARGET_HEIGHT = 0.1;
const SIGHT_GROUND_CLEARANCE = 0.05;
const HAZARD_SEED_SALT = 0x4b_c2;
const SHORTEST_GAP_SHARE = 0.6;
const GAP_SPREAD_SHARE = 0.8;
const SAME_WAY_SHARE = 0.7;
const SEAM_SHARE = 0.5;
const EDGE_MARGIN = 0.05;
const TURN_IN_SHARE = 0.15;
const EXIT_RUN = 20;
const CREST_CLIMB = 6;
const CREST_RUN = 30;
const SNAP_REACH = 250;
const APEX_REACH = 0.7;
const SEAM_SPREAD = 0.9;
export const HAZARD_TIGHT_CURVATURE = 0.0015;
export const HAZARD_GENTLE_CURVATURE = 0.0003;
const ROCK_LEAD = 10;
const ROCK_RUNOUT = 40;
const LANE_SPREAD = {
  oil: 0.5,
  pothole: 0.9,
  rock: 1.2,
} as const satisfies Record<HazardKind, number>;
const SETTING_WEIGHTS = {
  apex: { oil: 0, pothole: 1, rock: 0 },
  crest: { oil: 0, pothole: 1, rock: 2 },
  exit: { oil: 1, pothole: 0, rock: 1 },
  traffic: { oil: 1, pothole: 1, rock: 1.5 },
  turnIn: { oil: 1, pothole: 0, rock: 0 },
} as const satisfies Record<HazardSetting, Record<HazardKind, number>>;
const LEVEL_SHARES: readonly (readonly [RoadLevel, number])[] = [
  [1, 0.6],
  [2, 0.7],
  [3, 0.8],
  [4, 0.9],
  [5, 1],
];

type Road = Omit<Track, "hazards">;

type Bend = "straight" | "gentle" | "tight";

interface Place {
  readonly s: number;
  readonly setting: HazardSetting;
  readonly inside: number;
}

const levelOf = (roll: number): RoadLevel =>
  LEVEL_SHARES.find(([, share]) => roll < share)?.[0] ?? 5;

const kindOf = (
  mix: HazardMix,
  roll: number,
  setting: HazardSetting,
  bend: Bend
): HazardKind => {
  const weight = SETTING_WEIGHTS[setting];
  const oil = mix.oil * weight.oil;
  const rock = bend === "tight" ? 0 : mix.rock * weight.rock;
  const total = oil + rock + mix.pothole * weight.pothole;
  if (roll * total < oil) {
    return "oil";
  }
  return roll * total < oil + rock ? "rock" : "pothole";
};

const laneOf = (road: Road, roll: number): number => {
  const sameWay = roll < SAME_WAY_SHARE;
  const lanes = sameWay ? road.sameWayLanes : road.oncomingLanes;
  const share = sameWay
    ? roll / SAME_WAY_SHARE
    : (roll - SAME_WAY_SHARE) / (1 - SAME_WAY_SHARE);
  return (
    lanes[Math.min(lanes.length - 1, Math.floor(share * lanes.length))] ??
    lanes[0]
  );
};

const seamOf = (road: Road, roll: number): number => {
  const seams = road.plan.lanesEachWay === 2 ? [0, road.plan.laneWidth] : [0];
  return (
    seams[Math.min(seams.length - 1, Math.floor(roll * seams.length))] ?? 0
  );
};

const sameWayLaneToward = (road: Road, side: number): number =>
  road.sameWayLanes.toSorted((left, right) => (right - left) * side)[0] ??
  road.sameWayLanes[0];

const centreOf = (
  road: Road,
  place: Place,
  kind: HazardKind,
  laneRoll: number,
  offsetRoll: number
): number => {
  const spread = (offsetRoll * 2 - 1) * LANE_SPREAD[kind];
  if (place.setting === "apex") {
    return (
      sameWayLaneToward(road, place.inside) +
      place.inside * offsetRoll * APEX_REACH * road.plan.laneWidth
    );
  }
  if (place.setting === "turnIn" || place.setting === "exit") {
    return (
      sameWayLaneToward(road, -place.inside) -
      place.inside * offsetRoll * LANE_SPREAD[kind]
    );
  }
  if (place.setting === "crest") {
    return laneOf(road, laneRoll) + spread;
  }
  if (laneRoll < SEAM_SHARE) {
    return (
      seamOf(road, laneRoll / SEAM_SHARE) + (offsetRoll * 2 - 1) * SEAM_SPREAD
    );
  }
  return laneOf(road, (laneRoll - SEAM_SHARE) / (1 - SEAM_SHARE)) + spread;
};

const laneEdgeOf = (
  road: Road,
  kind: HazardKind,
  x: number,
  offsetRoll: number
): number => {
  const lane =
    [...road.sameWayLanes, ...road.oncomingLanes].toSorted(
      (left, right) => Math.abs(left - x) - Math.abs(right - x)
    )[0] ?? road.sameWayLanes[0];
  const side = Math.sign(x - lane) || (offsetRoll < SEAM_SHARE ? -1 : 1);
  return (
    lane +
    side * (road.plan.laneWidth / 2 - hazardSizes[kind].halfWidth - EDGE_MARGIN)
  );
};

const acrossOf = (
  road: Road,
  place: Place,
  kind: HazardKind,
  bend: Bend,
  laneRoll: number,
  offsetRoll: number
): number => {
  const reach =
    road.plan.lanesEachWay * road.plan.laneWidth -
    hazardSizes[kind].halfWidth -
    EDGE_MARGIN;
  const centre = centreOf(road, place, kind, laneRoll, offsetRoll);
  const x =
    kind === "rock" && bend === "gentle"
      ? laneEdgeOf(road, kind, centre, offsetRoll)
      : centre;
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
  out.x = sampleOf(road, road.worldX, s) + cos(heading) * x;
  out.y = sampleOf(road, road.worldY, s) + lift;
  out.z = sampleOf(road, road.worldZ, s) + sin(heading) * x;
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
      (chordX - sampleOf(road, road.worldX, along)) * cos(heading) +
      (chordZ - sampleOf(road, road.worldZ, along)) * sin(heading);
    const ground = sampleOf(road, road.worldY, along) + SIGHT_GROUND_CLEARANCE;
    if (Math.abs(across) > road.vergeHalfWidth || chordY < ground) {
      return false;
    }
  }
  return true;
};

export const inSight = (road: Road, s: number, x: number): boolean =>
  seenFrom(road, s, x, HAZARD_SIGHT);

const bendAt = (road: Road, s: number): Bend => {
  let sharpest = 0;
  for (
    let along = s - ROCK_LEAD;
    along <= s + ROCK_RUNOUT;
    along += SIGHT_STEP
  ) {
    sharpest = Math.max(
      sharpest,
      Math.abs(sampleOf(road, road.curvature, along))
    );
  }
  if (sharpest >= HAZARD_TIGHT_CURVATURE) {
    return "tight";
  }
  return sharpest >= HAZARD_GENTLE_CURVATURE ? "gentle" : "straight";
};

const clearOfRamps = (road: Road, s: number, halfLength: number): boolean =>
  road.plan.features.every((rule) => {
    const [from, to] = reservationOf(rule);
    return (
      s + halfLength < from - HAZARD_RAMP_CLEARANCE ||
      s - halfLength > to + HAZARD_RAMP_CLEARANCE
    );
  });

const placeable = (
  road: Road,
  kind: HazardKind,
  s: number,
  x: number
): boolean =>
  s >= HAZARD_START_CLEARANCE &&
  clearOfRamps(road, s, hazardSizes[kind].halfLength) &&
  inSight(road, s, x);

const placesOf = (road: Road): Place[] => {
  const places: Place[] = [];
  const spans = pieceSpans(road.plan.pieces);
  for (const [index, span] of spans.entries()) {
    const { from, piece, to } = span;
    if (Math.abs(span.turn) >= BEND_TURN) {
      const middle = from + piece.length / 2;
      const inside = Math.sign(sampleOf(road, road.curvature, middle)) || 1;
      places.push(
        { inside, s: from + piece.length * TURN_IN_SHARE, setting: "turnIn" },
        { inside, s: middle, setting: "apex" },
        { inside, s: to + EXIT_RUN, setting: "exit" }
      );
    }
    const next = spans[index + 1];
    if (span.climb >= CREST_CLIMB && next && next.climb <= 0) {
      places.push({ inside: 0, s: to + CREST_RUN, setting: "crest" });
    }
  }
  return places.toSorted((left, right) => left.s - right.s);
};

const gapOf = (rate: number, random: Random): number =>
  (1000 / rate) * (SHORTEST_GAP_SHARE + GAP_SPREAD_SHARE * random());

const snapTo = (
  places: readonly Place[],
  claimed: Set<Place>,
  s: number,
  after: number,
  roll: number
): Place | undefined => {
  const reachable = places.filter(
    (place) =>
      !claimed.has(place) &&
      place.s <= s &&
      place.s >= s - SNAP_REACH &&
      place.s >= after
  );
  return reachable[Math.floor(roll * reachable.length)];
};

export const placeHazards = (road: Road): HazardPlacement[] => {
  const rate = road.plan.hazardsPerKilometre;
  if (rate <= 0) {
    return [];
  }
  const mix = regions[road.plan.region].hazardMix;
  const random = createRandom(nextSeed(road.plan.seed + HAZARD_SEED_SALT));
  const places = placesOf(road);
  const claimed = new Set<Place>();
  const placed: HazardPlacement[] = [];
  let candidate = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (
    let s = HAZARD_START_CLEARANCE + gapOf(rate, random) / 2;
    s < road.length;
    s += gapOf(rate, random)
  ) {
    candidate += 1;
    const kindRoll = random();
    const laneRoll = random();
    const offsetRoll = random();
    const fromLevel = levelOf(random());
    const placeRoll = random();
    const after = last + HAZARD_LEAST_GAP;
    const snapped = snapTo(places, claimed, s, after, placeRoll);
    const options: Place[] = [
      ...(snapped ? [snapped] : []),
      ...(s >= after ? [{ inside: 0, s, setting: "traffic" } as const] : []),
    ];
    const chosen = options
      .map((place) => {
        const bend = bendAt(road, place.s);
        const kind = kindOf(mix, kindRoll, place.setting, bend);
        return {
          kind,
          place,
          x: acrossOf(road, place, kind, bend, laneRoll, offsetRoll),
        };
      })
      .find(({ kind, place, x }) => placeable(road, kind, place.s, x));
    if (!chosen) {
      continue;
    }
    claimed.add(chosen.place);
    last = chosen.place.s;
    if (
      fromLevel <= road.plan.level &&
      chosen.place.s <= road.length - HAZARD_FINISH_CLEARANCE
    ) {
      placed.push({
        fromLevel,
        id: `hazard-${candidate}`,
        kind: chosen.kind,
        s: chosen.place.s,
        setting: chosen.place.setting,
        x: chosen.x,
      });
    }
  }
  return placed;
};
