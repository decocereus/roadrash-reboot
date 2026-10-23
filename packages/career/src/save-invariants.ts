import { rivalIds } from "@racer/sim/cast";
import { weapons } from "@racer/sim/weapons";

import { memoryRows } from "./memory.ts";
import type { SaveError } from "./save-schema.ts";
import { racerIds } from "./state.ts";
import type { CareerState } from "./state.ts";

const holdsWeapon = (career: CareerState): boolean => {
  const { weapon, weaponHits } = career;
  if (weapon === "none") {
    return weaponHits === 0;
  }
  return weaponHits >= 1 && weaponHits <= weapons[weapon].hits;
};

const activeRaceClash = (career: CareerState): string | null => {
  const race = career.activeRace;
  if (race === null) {
    return null;
  }
  const clashes: readonly (readonly [string, boolean])[] = [
    ["activeRace.level", race.level !== career.level],
    ["activeRace.bikeId", race.bikeId !== career.bikeId],
    ["activeRace.raceId", race.raceId !== career.record.starts],
    ["gameOver", career.gameOver],
    ["lastResult", career.lastResult !== null],
  ];
  return clashes.find(([, clash]) => clash)?.[0] ?? null;
};

const raceNumberClash = (career: CareerState): string | null => {
  const { starts } = career.record;
  if (career.lastResult && career.lastResult.summary.raceId !== starts) {
    return "lastResult.summary.raceId";
  }
  for (const racer of racerIds) {
    for (const other of racerIds) {
      if ((career.season[racer].lastAhead[other] ?? 0) > starts) {
        return `season.${racer}.lastAhead.${other}`;
      }
    }
  }
  const remembered = rivalIds.find((rival) => {
    const memory = career.memory[rival];
    return (
      memory.sharedRace > starts ||
      memoryRows.some((row) => memory[row] > memory.sharedRace)
    );
  });
  return remembered === undefined ? null : `memory.${remembered}`;
};

const clashOf = (career: CareerState): string | null => {
  if (!career.garage.includes(career.bikeId)) {
    return "garage";
  }
  return activeRaceClash(career) ?? raceNumberClash(career);
};

export const problemOf = (career: CareerState): SaveError | null => {
  if (!holdsWeapon(career)) {
    return { field: "weaponHits", kind: "invalid" };
  }
  const field = clashOf(career);
  return field === null ? null : { field, kind: "inconsistent" };
};
