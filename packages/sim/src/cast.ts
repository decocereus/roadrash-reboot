import { celebrityRiders } from "@racer/content/celebrities";
import type { CelebrityRider } from "@racer/content/celebrities";
import { ordinaryRiders } from "@racer/content/riders";
import type { OrdinaryRider } from "@racer/content/riders";
import { byId, idsOf } from "@racer/content/rows";
import { riderVisuals } from "@racer/content/visuals";
import type { RiderVisual } from "@racer/content/visuals";
import type { RegionId } from "@racer/track/regions";

import { bikes } from "./bikes.ts";
import type { BikeId } from "./bikes.ts";
import { difficulties } from "./difficulty.ts";
import type { Tier } from "./difficulty.ts";
import { POLICE_COLOURS } from "./palette.ts";
import type { RiderProfile, RivalSetup, WeaponKind } from "./state.ts";

export type { RegionId } from "@racer/track/regions";

export const ordinaryRivalIds = idsOf<OrdinaryRider>(ordinaryRiders);

export type OrdinaryRivalId = (typeof ordinaryRivalIds)[number];

export const celebrityIds = idsOf<RiderVisual>(riderVisuals);

export type CelebrityId = (typeof celebrityIds)[number];

export const celebrityRivalIds = idsOf<CelebrityRider>(celebrityRiders);

export type CelebrityRivalId = (typeof celebrityRivalIds)[number];

export const celebrityModels: Readonly<Record<CelebrityRivalId, CelebrityId>> =
  byId(celebrityRiders, ({ wears }) => wears);

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

export const rivals: Readonly<Record<RivalId, Rival>> = byId(
  [...ordinaryRiders, ...celebrityRiders],
  ({ game, id }): Rival => ({ ...game, id })
);

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
