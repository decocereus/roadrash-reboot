import { zebrasOf } from "./crossings.ts";
import {
  HAZARD_FINISH_CLEARANCE,
  HAZARD_START_CLEARANCE,
  levelOf,
} from "./hazards.ts";
import { createRandom, nextSeed } from "./random.ts";
import { regions } from "./regions.ts";
import type { Track } from "./track.ts";

const walkKinds = ["zebra", "unmarked", "jaywalk"] as const;

export type WalkKind = (typeof walkKinds)[number];

export const NO_CROSSING = -1;

export interface WalkSite {
  readonly id: string;
  readonly kind: WalkKind;
  readonly s: number;
  readonly crossing: number;
}

export const walkersAt = {
  jaywalk: 1,
  unmarked: 2,
  zebra: 2,
} as const satisfies Record<WalkKind, number>;

export const walkersOn = (sites: readonly WalkSite[]): number => {
  let count = 0;
  for (const site of sites) {
    count += walkersAt[site.kind];
  }
  return count;
};

type Road = Omit<Track, "walkSites">;

const WALK_SEED_SALT = 0x77_a1;
const METRES_PER_KILOMETRE = 1000;
const CROSSING_CLEARANCE = 20;
const seededKinds = ["unmarked", "jaywalk"] as const;

const declaredSites = (road: Road): WalkSite[] =>
  road.crossings.flatMap((crossing, index) =>
    zebrasOf(crossing).map((s, place) => ({
      crossing: index,
      id: `${crossing.id}/${place}`,
      kind: crossing.walk,
      s,
    }))
  );

const clearOfCrossings = (road: Road, s: number): boolean =>
  road.crossings.every(
    (crossing) =>
      s < crossing.fromS - CROSSING_CLEARANCE ||
      s > crossing.toS + CROSSING_CLEARANCE
  );

const seededSites = (road: Road): WalkSite[] => {
  const { footfall } = regions[road.plan.region];
  const perKilometre = footfall.unmarked + footfall.jaywalk;
  if (perKilometre <= 0) {
    return [];
  }
  const random = createRandom(nextSeed(road.plan.seed + WALK_SEED_SALT));
  const gap = METRES_PER_KILOMETRE / perKilometre;
  const last = road.length - HAZARD_FINISH_CLEARANCE;
  const sites: WalkSite[] = [];
  for (
    let from = HAZARD_START_CLEARANCE, place = 0;
    from < last;
    from += gap, place += 1
  ) {
    const s = from + random() * gap;
    const kindRoll = random() * perKilometre;
    const fromLevel = levelOf(random());
    if (s < last && fromLevel <= road.plan.level && clearOfCrossings(road, s)) {
      const [unmarked, jaywalk] = seededKinds;
      const kind = kindRoll < footfall.unmarked ? unmarked : jaywalk;
      sites.push({ crossing: NO_CROSSING, id: `${kind}-${place}`, kind, s });
    }
  }
  return sites;
};

export const placeWalkSites = (road: Road): WalkSite[] =>
  [...declaredSites(road), ...seededSites(road)].toSorted(
    (one, other) => one.s - other.s
  );
