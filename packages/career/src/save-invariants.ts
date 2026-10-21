import { memoryRows } from "./memory.ts";
import type { Reader } from "./save-schema.ts";
import { racerIds, rivalIds } from "./state.ts";
import type { CareerState } from "./state.ts";

export const clash = (reader: Reader, field: string): void => {
  reader.problems.push({ field, kind: "inconsistent" });
};

export const checkActiveRace = (reader: Reader, career: CareerState): void => {
  const race = career.activeRace;
  if (!race) {
    return;
  }
  if (race.level !== career.level) {
    clash(reader, "activeRace.level");
  }
  if (race.bikeId !== career.bikeId) {
    clash(reader, "activeRace.bikeId");
  }
  if (race.raceId !== career.record.starts) {
    clash(reader, "activeRace.raceId");
  }
  if (career.gameOver) {
    clash(reader, "gameOver");
  }
  if (career.lastResult) {
    clash(reader, "lastResult");
  }
};

export const checkRaceNumbers = (reader: Reader, career: CareerState): void => {
  const { starts } = career.record;
  if (career.lastResult && career.lastResult.summary.raceId !== starts) {
    clash(reader, "lastResult.summary.raceId");
  }
  for (const racer of racerIds) {
    for (const other of racerIds) {
      if ((career.season[racer].lastAhead[other] ?? 0) > starts) {
        clash(reader, `season.${racer}.lastAhead.${other}`);
      }
    }
  }
  for (const rival of rivalIds) {
    const remembered = career.memory[rival];
    if (
      remembered.sharedRace > starts ||
      memoryRows.some((row) => remembered[row] > remembered.sharedRace)
    ) {
      clash(reader, `memory.${rival}`);
    }
  }
};
