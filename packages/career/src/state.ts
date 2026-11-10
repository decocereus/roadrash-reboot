import { byId } from "@racer/content/rows";
import type { BikeId } from "@racer/sim/bikes";
import { rivalIds } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
import type { WeaponKind } from "@racer/sim/state";
import { nextSeed } from "@racer/track/random";

import type { LastResult } from "./result.ts";
import { byTier, roadList, STARTING_BIKE, STARTING_CASH } from "./tables.ts";
import type { Tier, RoadId } from "./tables.ts";

export const SAVE_VERSION = 7;

export const racerIds = ["player", ...rivalIds] as const;

export type RacerId = (typeof racerIds)[number];

export const byRival = <Value>(make: (rival: RivalId) => Value) =>
  byId(
    rivalIds.map((id) => ({ id })),
    ({ id }) => make(id)
  );

export const byRacer = <Value>(make: (racer: RacerId) => Value) => ({
  ...byRival(make),
  player: make("player"),
});

export type QualifiedRoads = Partial<Record<RoadId, number>>;

export interface CareerRecord {
  readonly starts: number;
  readonly wins: number;
  readonly podiums: number;
  readonly busts: number;
  readonly wrecks: number;
  readonly knockdowns: number;
  readonly earnings: number;
}

export interface SeasonEntry {
  readonly bestPlace: number | null;
  readonly points: number;
  readonly wins: number;
}

export interface RivalMemory {
  readonly aggressionBonus: number;
  readonly grudge: boolean;
  readonly sharedRace: number;
  readonly weaponTakenByPlayer: number;
  readonly knockedDownByPlayer: number;
  readonly lostToPlayerByAWheel: number;
  readonly bustedNearPlayer: number;
  readonly busted: number;
  readonly knockedPlayerDown: number;
  readonly tookPlayerWeapon: number;
  readonly beatPlayerByAWheel: number;
  readonly outrunUntouched: number;
}

export const envelopeFlags = ["unseen", "offered", "taken", "refused"] as const;

export type EnvelopeFlag = (typeof envelopeFlags)[number];

export const endingIds = ["clean-crown", "bought-crown", "runner-up"] as const;

export type EndingId = (typeof endingIds)[number];

export interface StoryFlags {
  readonly envelope: EnvelopeFlag;
  readonly envelopeClawedBack: boolean;
  readonly deeAlly: boolean;
  readonly finaleUnlocked: boolean;
  readonly leftRace: boolean;
  readonly ending: EndingId | null;
}

export type BoardNote =
  | {
      readonly kind: "weaponWanted";
      readonly rival: RivalId;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "wentDown";
      readonly rival: RivalId;
      readonly roadId: RoadId;
      readonly km: number;
    }
  | {
      readonly kind: "knockedPlayerDown";
      readonly rival: RivalId;
      readonly roadId: RoadId;
      readonly km: number;
    }
  | {
      readonly kind: "photoFinish";
      readonly winner: RacerId;
      readonly loser: RacerId;
    }
  | {
      readonly kind: "busted";
      readonly rival: RivalId;
      readonly roadId: RoadId;
      readonly fine: number;
    }
  | { readonly kind: "newBike"; readonly bikeId: BikeId }
  | { readonly kind: "repossessed"; readonly bikeId: BikeId }
  | { readonly kind: "leftRace" };

export const BOARD_NOTES = 3;

export interface ActiveRace {
  readonly raceId: number;
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly seed: number;
  readonly bikeId: BikeId;
  readonly started: true;
}

export interface CareerState {
  readonly version: typeof SAVE_VERSION;
  readonly seed: number;
  readonly cash: number;
  readonly tier: Tier;
  readonly bikeId: BikeId;
  readonly garage: readonly BikeId[];
  readonly weapon: WeaponKind;
  readonly weaponHits: number;
  readonly qualified: Record<Tier, QualifiedRoads>;
  readonly record: CareerRecord;
  readonly season: Record<RacerId, SeasonEntry>;
  readonly memory: Record<RivalId, RivalMemory>;
  readonly story: StoryFlags;
  readonly board: readonly BoardNote[];
  readonly activeRace: ActiveRace | null;
  readonly lastResult: LastResult | null;
  readonly gameOver: boolean;
}

export const blankMemory: RivalMemory = {
  aggressionBonus: 0,
  beatPlayerByAWheel: 0,
  busted: 0,
  bustedNearPlayer: 0,
  grudge: false,
  knockedDownByPlayer: 0,
  knockedPlayerDown: 0,
  lostToPlayerByAWheel: 0,
  outrunUntouched: 0,
  sharedRace: 0,
  tookPlayerWeapon: 0,
  weaponTakenByPlayer: 0,
};

export const blankSeason: SeasonEntry = {
  bestPlace: null,
  points: 0,
  wins: 0,
};

export const newCareer = (seed: number): CareerState => ({
  activeRace: null,
  bikeId: STARTING_BIKE,
  board: [],
  cash: STARTING_CASH,
  gameOver: false,
  garage: [STARTING_BIKE],
  lastResult: null,
  memory: byRival(() => blankMemory),
  qualified: byTier(() => ({})),
  record: {
    busts: 0,
    earnings: 0,
    knockdowns: 0,
    podiums: 0,
    starts: 0,
    wins: 0,
    wrecks: 0,
  },
  season: byRacer(() => blankSeason),
  seed,
  story: {
    deeAlly: false,
    ending: null,
    envelope: "unseen",
    envelopeClawedBack: false,
    finaleUnlocked: false,
    leftRace: false,
  },
  tier: 1,
  version: SAVE_VERSION,
  weapon: "none",
  weaponHits: 0,
});

export const debtOf = (career: CareerState): number =>
  Math.max(0, -career.cash);

export const qualifiedCount = (roads: QualifiedRoads): number =>
  roadList.filter((road) => roads[road.id] !== undefined).length;

export const nextRaceId = (career: CareerState): number =>
  career.record.starts + 1;

const RACE_SEED_STEP = 0x9e_37;

export const nextRaceSeed = (career: CareerState): number =>
  nextSeed(nextSeed(career.seed) + nextRaceId(career) * RACE_SEED_STEP);
