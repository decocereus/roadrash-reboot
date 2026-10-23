import { clamp } from "@racer/sim/state";

import type { RivalIncidents } from "./outcome.ts";
import type { RivalMemory } from "./state.ts";

const STOLEN_WEAPON_BONUS = 0.15;
const KNOCKDOWN_BONUS = 0.1;
const KNOCKDOWN_BONUS_CAP = 0.25;
const WHEEL_BONUS = 0.1;
const BLAMED_BUST_BONUS = 0.05;
const SATISFIED_BONUS = -0.05;
const RESPECT_BONUS = -0.05;
const FADE = 0.05;
const GRUDGE_STARTS = 0.15;
const GRUDGE_ENDS = 0.05;
const HUNDREDTHS = 100;

export const memoryRows = [
  "weaponTakenByPlayer",
  "knockedDownByPlayer",
  "lostToPlayerByAWheel",
  "bustedNearPlayer",
  "busted",
  "knockedPlayerDown",
  "tookPlayerWeapon",
  "beatPlayerByAWheel",
  "outrunUntouched",
] as const;

type MemoryRow = (typeof memoryRows)[number];

const grudgeRows: ReadonlySet<MemoryRow> = new Set([
  "weaponTakenByPlayer",
  "knockedDownByPlayer",
  "lostToPlayerByAWheel",
  "bustedNearPlayer",
]);

const bonusOf = (row: MemoryRow, incidents: RivalIncidents): number => {
  if (row === "weaponTakenByPlayer") {
    return STOLEN_WEAPON_BONUS;
  }
  if (row === "knockedDownByPlayer") {
    return Math.min(
      KNOCKDOWN_BONUS_CAP,
      KNOCKDOWN_BONUS * incidents.knockedDownByPlayer
    );
  }
  if (row === "lostToPlayerByAWheel") {
    return WHEEL_BONUS;
  }
  if (row === "bustedNearPlayer") {
    return BLAMED_BUST_BONUS;
  }
  if (row === "knockedPlayerDown") {
    return SATISFIED_BONUS;
  }
  return row === "outrunUntouched" ? RESPECT_BONUS : 0;
};

const happened = (
  row: MemoryRow,
  incidents: RivalIncidents,
  playerAhead: boolean
): boolean => {
  if (row === "weaponTakenByPlayer" || row === "tookPlayerWeapon") {
    return incidents[row] !== "none";
  }
  if (row === "knockedDownByPlayer" || row === "knockedPlayerDown") {
    return incidents[row] > 0;
  }
  if (row === "bustedNearPlayer") {
    return incidents.busted === "near";
  }
  if (row === "busted") {
    return incidents.busted === "far";
  }
  if (row === "outrunUntouched") {
    return playerAhead && !incidents.tradedHits;
  }
  return incidents[row];
};

const fade = (bonus: number): number =>
  Math.sign(bonus) * Math.max(0, Math.abs(bonus) - FADE);

const tidy = (bonus: number): number =>
  Math.round(clamp(bonus, -1, 1) * HUNDREDTHS) / HUNDREDTHS + 0;

const grudgeAt = (bonus: number, held: boolean): boolean => {
  if (bonus >= GRUDGE_STARTS) {
    return true;
  }
  return bonus < GRUDGE_ENDS ? false : held;
};

export const remember = (
  memory: RivalMemory,
  incidents: RivalIncidents,
  race: number,
  playerAhead: boolean
): RivalMemory => {
  const rows = memoryRows.filter((row) =>
    happened(row, incidents, playerAhead)
  );
  let bonus = fade(memory.aggressionBonus);
  const stamped = { ...memory };
  for (const row of rows) {
    bonus += bonusOf(row, incidents);
    stamped[row] = race;
  }
  const aggressionBonus = tidy(bonus);
  return {
    ...stamped,
    aggressionBonus,
    grudge: grudgeAt(aggressionBonus, memory.grudge),
    sharedRace: race,
  };
};

const strongestRow = (memory: RivalMemory): MemoryRow | null =>
  memory.sharedRace === 0
    ? null
    : (memoryRows.find((row) => memory[row] === memory.sharedRace) ?? null);

export const memoryStrength = (memory: RivalMemory): number => {
  const row = strongestRow(memory);
  return row === null ? 0 : memoryRows.length - memoryRows.indexOf(row);
};

export const holdsItAgainstPlayer = (memory: RivalMemory): boolean => {
  const row = strongestRow(memory);
  return row !== null && grudgeRows.has(row);
};
