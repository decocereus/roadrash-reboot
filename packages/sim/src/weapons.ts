import type { RiderState, WeaponKind } from "./state.ts";

export interface StrikeSpec {
  readonly name: string;
  readonly damage: number;
  readonly shove: number;
  readonly reachS: number;
  readonly reachX: number;
  readonly ticks: number;
  readonly strikeTick: number;
  readonly cooldown: number;
  readonly hits: number;
  readonly steerFactor: number;
}

export const punch: StrikeSpec = {
  cooldown: 16,
  damage: 14,
  hits: 0,
  name: "Fists",
  reachS: 1.9,
  reachX: 2.2,
  shove: 1.6,
  steerFactor: 1,
  strikeTick: 14,
  ticks: 18,
};

export const kick: StrikeSpec = {
  cooldown: 36,
  damage: 22,
  hits: 0,
  name: "Boot",
  reachS: 1.9,
  reachX: 2.2,
  shove: 3.2,
  steerFactor: 1,
  strikeTick: 11,
  ticks: 15,
};

export const weapons = {
  baton: {
    cooldown: 36,
    damage: 18,
    hits: 12,
    name: "Baton",
    reachS: 2.2,
    reachX: 2.6,
    shove: 2.4,
    steerFactor: 1,
    strikeTick: 16,
    ticks: 22,
  },
  chain: {
    cooldown: 38,
    damage: 20,
    hits: 8,
    name: "Chain",
    reachS: 2.6,
    reachX: 3.1,
    shove: 2.2,
    steerFactor: 1,
    strikeTick: 17,
    ticks: 24,
  },
  club: {
    cooldown: 40,
    damage: 28,
    hits: 6,
    name: "Club",
    reachS: 2.2,
    reachX: 2.6,
    shove: 3.8,
    steerFactor: 1,
    strikeTick: 17,
    ticks: 24,
  },
  crowbar: {
    cooldown: 36,
    damage: 22,
    hits: 4,
    name: "Crowbar",
    reachS: 2.2,
    reachX: 2.6,
    shove: 2.8,
    steerFactor: 1,
    strikeTick: 16,
    ticks: 22,
  },
  cue: {
    cooldown: 30,
    damage: 15,
    hits: 3,
    name: "Pool cue",
    reachS: 3,
    reachX: 3.4,
    shove: 1.8,
    steerFactor: 1,
    strikeTick: 15,
    ticks: 20,
  },
  none: punch,
  sign: {
    cooldown: 50,
    damage: 32,
    hits: 3,
    name: "Stop sign",
    reachS: 2.4,
    reachX: 2.8,
    shove: 4.6,
    steerFactor: 0.85,
    strikeTick: 17,
    ticks: 44,
  },
} as const satisfies Record<WeaponKind, StrikeSpec>;

export const strikeOf = (
  attack: RiderState["attack"],
  weapon: WeaponKind
): StrikeSpec => {
  if (attack === "kick") {
    return kick;
  }
  return attack === "swing" ? weapons[weapon] : punch;
};

export const arm = (rider: RiderState, weapon: WeaponKind): void => {
  rider.weapon = weapon;
  rider.weaponHits = weapons[weapon].hits;
};

export const disarm = (rider: RiderState): void => {
  rider.weapon = "none";
  rider.weaponHits = 0;
};

export const rearm = (rider: RiderState): void => {
  if (rider.profile.role === "police" && rider.weapon === "none") {
    arm(rider, rider.profile.weapon);
  }
};
