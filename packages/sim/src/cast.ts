import type { RegionId } from "@racer/track/regions";

import { bikes } from "./bikes.ts";
import type { BikeId } from "./bikes.ts";
import { difficulties } from "./difficulty.ts";
import type { Tier } from "./difficulty.ts";
import { POLICE_COLOURS } from "./palette.ts";
import type { RiderProfile, RivalSetup, WeaponKind } from "./state.ts";

export type { RegionId } from "@racer/track/regions";

export const ordinaryRivalIds = [
  "juno-kade",
  "ruth-ann-bixby",
  "dee-santangelo",
  "ines-marchetti",
  "mags-dunleavy",
  "lyle-gorski",
  "tristan-lux",
  "coach-dale-hutto",
  "moose-kowalczyk",
  "gus-abernathy",
  "benny-okafor",
  "wanda-pruitt",
  "orrin-blackwell",
  "agnes-mulcahy",
  "hollis-thorne",
  "felix-aurand",
] as const;

export type OrdinaryRivalId = (typeof ordinaryRivalIds)[number];

export const celebrityIds = [
  "kylie",
  "ronaldo",
  "mbappe",
  "musk",
  "altman",
  "ranveer",
] as const;

export type CelebrityId = (typeof celebrityIds)[number];

export const celebrityRivalIds = [
  "captain-penaldo",
  "supreme-leader-mbosse",
  "elongated-muskrat",
  "slam-altruman",
  "kylip-jetner",
  "ranwear-bling",
] as const;

export type CelebrityRivalId = (typeof celebrityRivalIds)[number];

export const celebrityModels = {
  "captain-penaldo": "ronaldo",
  "elongated-muskrat": "musk",
  "kylip-jetner": "kylie",
  "ranwear-bling": "ranveer",
  "slam-altruman": "altman",
  "supreme-leader-mbosse": "mbappe",
} as const satisfies Record<CelebrityRivalId, CelebrityId>;

export const rivalIds = [...ordinaryRivalIds, ...celebrityRivalIds] as const;

export type RivalId = (typeof rivalIds)[number];

export const isCelebrity = (rival: RivalId): rival is CelebrityRivalId =>
  celebrityRivalIds.some((celebrity) => celebrity === rival);

const CLUB_TIER = 3;
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
  readonly armedFrom: Tier;
  readonly racesFrom: Tier;
  readonly bikes: readonly [BikeId, BikeId, BikeId];
}

export const rivals = {
  "agnes-mulcahy": {
    aggression: 0.2,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "ostra-sette-750"],
    home: "lowtown",
    id: "agnes-mulcahy",
    jacket: 15,
    name: "Sister Agnes Mulcahy",
    paint: 15,
    racesFrom: 1,
    skill: 0.89,
    weapon: "none",
  },
  "benny-okafor": {
    aggression: 0.4,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "halden-meridian-900"],
    home: "salt-coast",
    id: "benny-okafor",
    jacket: 12,
    name: "Benny Okafor",
    paint: 12,
    racesFrom: 1,
    skill: 0.85,
    weapon: "none",
  },
  "captain-penaldo": {
    aggression: 0.75,
    armedFrom: 1,
    bikes: ["halden-kite-500", "ostra-sette-750", "halden-meridian-900"],
    home: "lowtown",
    id: "captain-penaldo",
    jacket: 6,
    name: "Captain Penaldo",
    paint: 6,
    racesFrom: 1,
    skill: 0.94,
    weapon: "none",
  },
  "coach-dale-hutto": {
    aggression: 0.55,
    armedFrom: 2,
    bikes: ["halden-wren-400", "ostra-sesta-600", "brack-anvil-1100"],
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
    bikes: ["halden-wren-400", "ostra-sette-750", "halden-meridian-900"],
    home: "lowtown",
    id: "dee-santangelo",
    jacket: 3,
    name: "Dee Santangelo",
    paint: 3,
    racesFrom: 1,
    skill: 0.93,
    weapon: "chain",
  },
  "elongated-muskrat": {
    aggression: 0.45,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "halden-meridian-900"],
    home: "stonepeak",
    id: "elongated-muskrat",
    jacket: 5,
    name: "Elongated Muskrat",
    paint: 5,
    racesFrom: 1,
    skill: 0.96,
    weapon: "none",
  },
  "felix-aurand": {
    aggression: 0.7,
    armedFrom: 1,
    bikes: ["halden-kite-500", "brack-stoker-800", "brack-anvil-1100"],
    home: "lowtown",
    id: "felix-aurand",
    jacket: 17,
    name: "Dr Felix Aurand",
    paint: 17,
    racesFrom: 1,
    skill: 0.8,
    weapon: "club",
  },
  "gus-abernathy": {
    aggression: 0.65,
    armedFrom: 2,
    bikes: ["gutter-pup-250", "halden-kite-500", "brack-stoker-800"],
    home: "stonepeak",
    id: "gus-abernathy",
    jacket: 10,
    name: "Gus Abernathy",
    paint: 10,
    racesFrom: 1,
    skill: 0.82,
    weapon: "sign",
  },
  "hollis-thorne": {
    aggression: 0.45,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "halden-meridian-900"],
    home: "stonepeak",
    id: "hollis-thorne",
    jacket: 16,
    name: "Hollis Thorne",
    paint: 16,
    racesFrom: 1,
    skill: 0.88,
    weapon: "none",
  },
  "ines-marchetti": {
    aggression: 0.75,
    armedFrom: 1,
    bikes: ["halden-kite-500", "ostra-sette-750", "halden-meridian-900"],
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
    bikes: ["ostra-sesta-600", "ostra-sette-750", "ostra-nera-1000"],
    home: "stonepeak",
    id: "juno-kade",
    jacket: 1,
    name: "Juno Kade",
    paint: 1,
    racesFrom: 2,
    skill: 0.99,
    weapon: "none",
  },
  "kylip-jetner": {
    aggression: 0.35,
    armedFrom: 1,
    bikes: ["halden-kite-500", "ostra-sette-750", "ostra-nera-1000"],
    home: "salt-coast",
    id: "kylip-jetner",
    jacket: 7,
    name: "Kylip Jetner",
    paint: 7,
    racesFrom: 1,
    skill: 0.92,
    weapon: "none",
  },
  "lyle-gorski": {
    aggression: 0.7,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "brack-anvil-1100"],
    home: "stonepeak",
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
    bikes: ["halden-wren-400", "brack-stoker-800", "brack-anvil-1100"],
    home: "lowtown",
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
    bikes: ["halden-kite-500", "brack-stoker-800", "brack-anvil-1100"],
    home: "lowtown",
    id: "moose-kowalczyk",
    jacket: 9,
    name: "Moose Kowalczyk",
    paint: 9,
    racesFrom: 1,
    skill: 0.84,
    weapon: "club",
  },
  "orrin-blackwell": {
    aggression: 0.55,
    armedFrom: 1,
    bikes: ["halden-wren-400", "halden-kite-500", "ostra-sette-750"],
    home: "stonepeak",
    id: "orrin-blackwell",
    jacket: 14,
    name: "Orrin Blackwell",
    paint: 14,
    racesFrom: 1,
    skill: 0.83,
    weapon: "none",
  },
  "ranwear-bling": {
    aggression: 0.4,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "halden-meridian-900"],
    home: "salt-coast",
    id: "ranwear-bling",
    jacket: 8,
    name: "Ranwear Bling",
    paint: 8,
    racesFrom: 1,
    skill: 0.85,
    weapon: "none",
  },
  "ruth-ann-bixby": {
    aggression: 0.45,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "halden-meridian-900"],
    home: "salt-coast",
    id: "ruth-ann-bixby",
    jacket: 2,
    name: "Ruth Ann Bixby",
    paint: 2,
    racesFrom: 1,
    skill: 0.95,
    weapon: "none",
  },
  "slam-altruman": {
    aggression: 0.3,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "ostra-sette-750"],
    home: "stonepeak",
    id: "slam-altruman",
    jacket: 4,
    name: "Slam Altruman",
    paint: 4,
    racesFrom: 1,
    skill: 0.87,
    weapon: "none",
  },
  "supreme-leader-mbosse": {
    aggression: 0.7,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "brack-anvil-1100"],
    home: "lowtown",
    id: "supreme-leader-mbosse",
    jacket: 10,
    name: "Supreme Leader M'Bossé",
    paint: 10,
    racesFrom: 1,
    skill: 0.9,
    weapon: "baton",
  },
  "tristan-lux": {
    aggression: 0.35,
    armedFrom: 1,
    bikes: ["halden-kite-500", "ostra-sette-750", "ostra-nera-1000"],
    home: "salt-coast",
    id: "tristan-lux",
    jacket: 7,
    name: "Tristan Lux",
    paint: 7,
    racesFrom: 1,
    skill: 0.88,
    weapon: "none",
  },
  "wanda-pruitt": {
    aggression: 0.3,
    armedFrom: 1,
    bikes: ["halden-wren-400", "ostra-sesta-600", "ostra-sette-750"],
    home: "salt-coast",
    id: "wanda-pruitt",
    jacket: 13,
    name: "Wanda Pruitt",
    paint: 13,
    racesFrom: 1,
    skill: 0.87,
    weapon: "none",
  },
} as const satisfies Record<RivalId, Rival>;

export const ordinaryCast: readonly Rival[] = ordinaryRivalIds.map(
  (id) => rivals[id]
);

export const celebrityCast: readonly Rival[] = celebrityRivalIds.map(
  (id) => rivals[id]
);

export const weaponAt = (rival: Rival, tier: Tier): WeaponKind => {
  if (rival.weapon !== "none" && tier >= rival.armedFrom) {
    return rival.weapon;
  }
  return tier >= CLUB_TIER && rival.aggression >= CLUB_AGGRESSION
    ? "club"
    : "none";
};

export const bikeAt = (rival: Rival, tier: Tier): BikeId =>
  rival.bikes[tier - 1] ?? rival.bikes[0];

export const rivalAt = (rival: Rival, tier: Tier): RivalSetup => ({
  aggression: rival.aggression,
  bike: bikes[bikeAt(rival, tier)],
  jacket: rival.jacket,
  name: rival.name,
  paint: rival.paint,
  role: "racer",
  skill: Math.min(1, rival.skill + difficulties[tier].rivalSkill),
  weapon: weaponAt(rival, tier),
});

export const officerIds = ["dolores-pike", "wendell-haverty"] as const;

export type OfficerId = (typeof officerIds)[number];

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
    patrols: ["salt-coast", "stonepeak"],
    profile: officerProfile("Sergeant Dolores Pike"),
  },
  "wendell-haverty": {
    id: "wendell-haverty",
    patrols: ["lowtown"],
    profile: officerProfile("Deputy Wendell Haverty"),
  },
} as const satisfies Record<OfficerId, Officer>;

export const officerFor = (region: RegionId): Officer =>
  officers["wendell-haverty"].patrols.some((patrol) => patrol === region)
    ? officers["wendell-haverty"]
    : officers["dolores-pike"];
