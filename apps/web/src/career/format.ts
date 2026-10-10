import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { TICK_RATE } from "@racer/sim/state";
import type { WeaponKind } from "@racer/sim/state";
import { weapons } from "@racer/sim/weapons";

const METRES_PER_KM = 1000;
const SECONDS_PER_MINUTE = 60;
const TENTHS = 10;

const suffixes = ["TH", "ST", "ND", "RD"] as const;

export const ordinal = (place: number): string =>
  `${place}${suffixes[place] ?? "TH"}`;

export const kilometres = (metres: number): string =>
  String(Math.round(metres / 10) / 100);

export const kmMark = (km: number): string => km.toFixed(1);

export const raceTime = (ticks: number): string => {
  const tenths = Math.floor((ticks / TICK_RATE) * TENTHS);
  const minutes = Math.floor(tenths / (SECONDS_PER_MINUTE * TENTHS));
  const rest = tenths - minutes * SECONDS_PER_MINUTE * TENTHS;
  const seconds = String(Math.floor(rest / TENTHS)).padStart(2, "0");
  return `${minutes}:${seconds}.${rest % TENTHS}`;
};

export const distanceToGo = (metres: number): string =>
  metres >= METRES_PER_KM
    ? `${(metres / METRES_PER_KM).toFixed(1)} km`
    : `${Math.max(0, Math.round(metres / 10) * 10)} m`;

export const bikeName = (bikeId: BikeId): string => bikes[bikeId].name;

export const shortBike = (name: string): string =>
  name.split(" ").slice(1).join(" ");

export const weaponLabel = (weapon: WeaponKind): string =>
  weapon === "none" ? "" : weapons[weapon].name;

export const copCount = (cops: number): string =>
  cops === 1 ? "1 COP" : `${cops} COPS`;
