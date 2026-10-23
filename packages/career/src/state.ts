import type { BikeId } from "@racer/sim/bikes";
import { rivalIds } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
import type { WeaponKind } from "@racer/sim/state";
import { nextSeed } from "@racer/track/random";

import type { LastResult } from "./result.ts";
import {
  byLevel,
  creditLimitOf,
  roadList,
  STARTING_BIKE,
  STARTING_CASH,
} from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

export const SAVE_VERSION = 2;

export const racerIds = ["player", ...rivalIds] as const;

export type RacerId = (typeof racerIds)[number];

export const byRival = <Value>(make: (rival: RivalId) => Value) => ({
  "agnes-mulcahy": make("agnes-mulcahy"),
  "benny-okafor": make("benny-okafor"),
  "coach-dale-hutto": make("coach-dale-hutto"),
  "dee-santangelo": make("dee-santangelo"),
  "felix-aurand": make("felix-aurand"),
  "gus-abernathy": make("gus-abernathy"),
  "hollis-thorne": make("hollis-thorne"),
  "ines-marchetti": make("ines-marchetti"),
  "juno-kade": make("juno-kade"),
  "lyle-gorski": make("lyle-gorski"),
  "mags-dunleavy": make("mags-dunleavy"),
  "moose-kowalczyk": make("moose-kowalczyk"),
  "orrin-blackwell": make("orrin-blackwell"),
  "ruth-ann-bixby": make("ruth-ann-bixby"),
  "tristan-lux": make("tristan-lux"),
  "wanda-pruitt": make("wanda-pruitt"),
});

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
  readonly points: number;
  readonly wins: number;
  readonly lastAhead: Partial<Record<RacerId, number>>;
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
  readonly level: Level;
  readonly seed: number;
  readonly bikeId: BikeId;
  readonly started: true;
}

export interface CareerState {
  readonly version: typeof SAVE_VERSION;
  readonly seed: number;
  readonly cash: number;
  readonly level: Level;
  readonly bikeId: BikeId;
  readonly garage: readonly BikeId[];
  readonly weapon: WeaponKind;
  readonly weaponHits: number;
  readonly qualified: Record<Level, QualifiedRoads>;
  readonly record: CareerRecord;
  readonly season: Record<RacerId, SeasonEntry>;
  readonly memory: Record<RivalId, RivalMemory>;
  readonly story: StoryFlags;
  readonly board: readonly BoardNote[];
  readonly activeRace: ActiveRace | null;
  readonly lastResult: LastResult | null;
  readonly gameOver: boolean;
}

const blankMemory: RivalMemory = {
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

export const newCareer = (seed: number): CareerState => ({
  activeRace: null,
  bikeId: STARTING_BIKE,
  board: [],
  cash: STARTING_CASH,
  gameOver: false,
  garage: [STARTING_BIKE],
  lastResult: null,
  level: 1,
  memory: byRival(() => blankMemory),
  qualified: byLevel(() => ({})),
  record: {
    busts: 0,
    earnings: 0,
    knockdowns: 0,
    podiums: 0,
    starts: 0,
    wins: 0,
    wrecks: 0,
  },
  season: byRacer(() => ({ lastAhead: {}, points: 0, wins: 0 })),
  seed,
  story: {
    deeAlly: false,
    ending: null,
    envelope: "unseen",
    envelopeClawedBack: false,
    finaleUnlocked: false,
    leftRace: false,
  },
  version: SAVE_VERSION,
  weapon: "none",
  weaponHits: 0,
});

export const debtOf = (career: CareerState): number =>
  Math.max(0, -career.cash);

export const creditLimit = (career: CareerState): number =>
  creditLimitOf(career.bikeId);

export const qualifiedCount = (roads: QualifiedRoads): number =>
  roadList.filter((road) => roads[road.id] !== undefined).length;

export const nextRaceId = (career: CareerState): number =>
  career.record.starts + 1;

const RACE_SEED_STEP = 0x9e_37;

export const nextRaceSeed = (career: CareerState): number =>
  nextSeed(nextSeed(career.seed) + nextRaceId(career) * RACE_SEED_STEP);
