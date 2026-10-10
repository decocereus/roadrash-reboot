import type { RegionId } from "@racer/track/regions";

import { bikes } from "./bikes.ts";
import type { BikeId } from "./bikes.ts";
import { POLICE_COLOURS } from "./palette.ts";
import type { RiderProfile, RivalSetup, WeaponKind } from "./state.ts";

export type { RegionId } from "@racer/track/regions";

export type RivalId =
  | "juno-kade"
  | "ruth-ann-bixby"
  | "dee-santangelo"
  | "ines-marchetti"
  | "mags-dunleavy"
  | "lyle-gorski"
  | "tristan-lux"
  | "coach-dale-hutto"
  | "moose-kowalczyk"
  | "gus-abernathy";

export const LEVEL_COUNT = 5;
const CLUB_LEVEL = 4;
const CLUB_AGGRESSION = 0.5;

export interface Rival {
  readonly id: RivalId;
  readonly name: string;
  readonly home: RegionId;
  readonly skill: number;
  readonly aggression: number;
  readonly paint: number;
  readonly jacket: number;
  readonly weapon: WeaponKind;
  readonly armedFrom: number;
  readonly racesFrom: number;
  readonly bikes: readonly [BikeId, BikeId, BikeId, BikeId, BikeId];
}

export const rivals = {
  "coach-dale-hutto": {
    aggression: 0.55,
    armedFrom: 2,
    bikes: [
      "halden-wren-400",
      "halden-kite-500",
      "ostra-sesta-600",
      "ostra-sette-750",
      "brack-anvil-1100",
    ],
    home: "stonepeak",
    id: "coach-dale-hutto",
    jacket: 8,
    name: "Coach Dale Hutto",
    paint: 8,
    racesFrom: 1,
    skill: 0.86,
    weapon: "cue",
  },
  "dee-santangelo": {
    aggression: 0.5,
    armedFrom: 1,
    bikes: [
      "halden-wren-400",
      "ostra-sesta-600",
      "ostra-sette-750",
      "ostra-sette-750",
      "halden-meridian-900",
    ],
    home: "lowtown",
    id: "dee-santangelo",
    jacket: 3,
    name: "Dee Santangelo",
    paint: 3,
    racesFrom: 1,
    skill: 0.93,
    weapon: "chain",
  },
  "gus-abernathy": {
    aggression: 0.65,
    armedFrom: 3,
    bikes: [
      "gutter-pup-250",
      "halden-wren-400",
      "halden-kite-500",
      "brack-stoker-800",
      "brack-stoker-800",
    ],
    home: "kettle-woods",
    id: "gus-abernathy",
    jacket: 10,
    name: "Gus Abernathy",
    paint: 10,
    racesFrom: 1,
    skill: 0.82,
    weapon: "sign",
  },
  "ines-marchetti": {
    aggression: 0.75,
    armedFrom: 1,
    bikes: [
      "halden-kite-500",
      "ostra-sesta-600",
      "ostra-sette-750",
      "halden-meridian-900",
      "halden-meridian-900",
    ],
    home: "salt-coast",
    id: "ines-marchetti",
    jacket: 4,
    name: "Ines Marchetti",
    paint: 4,
    racesFrom: 1,
    skill: 0.91,
    weapon: "none",
  },
  "juno-kade": {
    aggression: 0.25,
    armedFrom: 1,
    bikes: [
      "ostra-sesta-600",
      "ostra-sesta-600",
      "ostra-sette-750",
      "halden-meridian-900",
      "ostra-nera-1000",
    ],
    home: "stonepeak",
    id: "juno-kade",
    jacket: 1,
    name: "Juno Kade",
    paint: 1,
    racesFrom: 2,
    skill: 0.99,
    weapon: "none",
  },
  "lyle-gorski": {
    aggression: 0.7,
    armedFrom: 1,
    bikes: [
      "halden-wren-400",
      "halden-kite-500",
      "ostra-sesta-600",
      "halden-meridian-900",
      "brack-anvil-1100",
    ],
    home: "kettle-woods",
    id: "lyle-gorski",
    jacket: 6,
    name: "Lyle Gorski",
    paint: 6,
    racesFrom: 1,
    skill: 0.9,
    weapon: "baton",
  },
  "mags-dunleavy": {
    aggression: 0.6,
    armedFrom: 1,
    bikes: [
      "halden-wren-400",
      "halden-kite-500",
      "brack-stoker-800",
      "brack-stoker-800",
      "brack-anvil-1100",
    ],
    home: "cinder-flats",
    id: "mags-dunleavy",
    jacket: 5,
    name: "Mags Dunleavy",
    paint: 5,
    racesFrom: 1,
    skill: 0.9,
    weapon: "crowbar",
  },
  "moose-kowalczyk": {
    aggression: 0.85,
    armedFrom: 1,
    bikes: [
      "halden-kite-500",
      "halden-kite-500",
      "brack-stoker-800",
      "brack-stoker-800",
      "brack-anvil-1100",
    ],
    home: "lowtown",
    id: "moose-kowalczyk",
    jacket: 9,
    name: "Moose Kowalczyk",
    paint: 9,
    racesFrom: 1,
    skill: 0.84,
    weapon: "club",
  },
  "ruth-ann-bixby": {
    aggression: 0.45,
    armedFrom: 1,
    bikes: [
      "halden-wren-400",
      "halden-kite-500",
      "ostra-sesta-600",
      "ostra-sette-750",
      "halden-meridian-900",
    ],
    home: "cinder-flats",
    id: "ruth-ann-bixby",
    jacket: 2,
    name: "Ruth Ann Bixby",
    paint: 2,
    racesFrom: 1,
    skill: 0.95,
    weapon: "none",
  },
  "tristan-lux": {
    aggression: 0.35,
    armedFrom: 1,
    bikes: [
      "halden-kite-500",
      "ostra-sesta-600",
      "ostra-sette-750",
      "halden-meridian-900",
      "ostra-nera-1000",
    ],
    home: "salt-coast",
    id: "tristan-lux",
    jacket: 7,
    name: "Tristan Lux",
    paint: 7,
    racesFrom: 1,
    skill: 0.88,
    weapon: "none",
  },
} as const satisfies Record<RivalId, Rival>;

export const cast: readonly Rival[] = [
  rivals["juno-kade"],
  rivals["ruth-ann-bixby"],
  rivals["dee-santangelo"],
  rivals["ines-marchetti"],
  rivals["mags-dunleavy"],
  rivals["lyle-gorski"],
  rivals["tristan-lux"],
  rivals["coach-dale-hutto"],
  rivals["moose-kowalczyk"],
  rivals["gus-abernathy"],
];

const levelOf = (level: number): number =>
  Math.min(LEVEL_COUNT, Math.max(1, Math.round(level)));

export const weaponAt = (rival: Rival, level: number): WeaponKind => {
  if (rival.weapon !== "none" && level >= rival.armedFrom) {
    return rival.weapon;
  }
  return level >= CLUB_LEVEL && rival.aggression >= CLUB_AGGRESSION
    ? "club"
    : "none";
};

export const bikeAt = (rival: Rival, level: number): BikeId =>
  rival.bikes[levelOf(level) - 1] ?? rival.bikes[0];

export const rivalAt = (rival: Rival, level: number): RivalSetup => ({
  aggression: rival.aggression,
  bike: bikes[bikeAt(rival, level)],
  jacket: rival.jacket,
  name: rival.name,
  paint: rival.paint,
  role: "racer",
  skill: rival.skill,
  weapon: weaponAt(rival, level),
});

export type OfficerId = "dolores-pike" | "wendell-haverty";

export interface Officer {
  readonly id: OfficerId;
  readonly profile: RiderProfile;
  readonly patrols: readonly RegionId[];
}

const officerProfile = (name: string): RiderProfile => ({
  aggression: 0.9,
  jacket: POLICE_COLOURS,
  name,
  paint: POLICE_COLOURS,
  role: "police",
  skill: 0.95,
  weapon: "baton",
});

export const officers = {
  "dolores-pike": {
    id: "dolores-pike",
    patrols: ["salt-coast", "stonepeak", "cinder-flats"],
    profile: officerProfile("Sergeant Dolores Pike"),
  },
  "wendell-haverty": {
    id: "wendell-haverty",
    patrols: ["lowtown", "kettle-woods"],
    profile: officerProfile("Deputy Wendell Haverty"),
  },
} as const satisfies Record<OfficerId, Officer>;

export const officerFor = (region: RegionId): Officer =>
  officers["wendell-haverty"].patrols.some((patrol) => patrol === region)
    ? officers["wendell-haverty"]
    : officers["dolores-pike"];
