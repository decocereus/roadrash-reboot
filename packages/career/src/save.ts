import { weapons } from "@racer/sim/weapons";

import { checkActiveRace, checkRaceNumbers, clash } from "./save-invariants.ts";
import {
  activeRaceOf,
  anySeed,
  balance,
  bikeOf,
  careerRecordOf,
  flagOf,
  isRecord,
  lastResultOf,
  levelOf,
  listOf,
  memoryOf,
  noteOf,
  numberOf,
  qualifiedOf,
  recordOf,
  seasonEntryOf,
  storyOf,
  weaponOf,
  wholeOf,
} from "./save-schema.ts";
import type {
  Field,
  Json,
  JsonRecord,
  Reader,
  SaveError,
} from "./save-schema.ts";
import { BOARD_NOTES, byRacer, byRival, SAVE_VERSION } from "./state.ts";
import type { CareerState } from "./state.ts";
import { byLevel, catalogue } from "./tables.ts";

export type SaveResult =
  | { readonly ok: true; readonly career: CareerState }
  | { readonly ok: false; readonly error: SaveError };

const careerOf = (reader: Reader, save: JsonRecord): CareerState => {
  const weapon = weaponOf(reader, save.weapon, "weapon");
  const qualified = recordOf(reader, save.qualified, "qualified");
  const season = recordOf(reader, save.season, "season");
  const memory = recordOf(reader, save.memory, "memory");
  const garage = listOf(reader, save.garage, "garage", catalogue.length).map(
    (bike, index) => bikeOf(reader, bike, `garage.${index}`)
  );
  const bikeId = bikeOf(reader, save.bikeId, "bikeId");
  const career: CareerState = {
    activeRace: activeRaceOf(reader, save.activeRace),
    bikeId,
    board: listOf(reader, save.board, "board", BOARD_NOTES).map((note, index) =>
      noteOf(reader, note, `board.${index}`)
    ),
    cash: wholeOf(reader, save.cash, "cash", balance),
    gameOver: flagOf(reader, save.gameOver, "gameOver"),
    garage,
    lastResult: lastResultOf(reader, save.lastResult),
    level: levelOf(reader, save.level, "level"),
    memory: byRival((rival) =>
      memoryOf(reader, memory[rival], `memory.${rival}`)
    ),
    qualified: byLevel((level) =>
      qualifiedOf(reader, qualified[level], `qualified.${level}`)
    ),
    record: careerRecordOf(reader, save.record),
    season: byRacer((racer) =>
      seasonEntryOf(reader, season[racer], `season.${racer}`)
    ),
    seed: numberOf(reader, save.seed, "seed", anySeed),
    story: storyOf(reader, save.story),
    version: SAVE_VERSION,
    weapon,
    weaponHits: wholeOf(reader, save.weaponHits, "weaponHits", {
      maximum: weapon === "none" ? 0 : weapons[weapon].hits,
      minimum: weapon === "none" ? 0 : 1,
    }),
  };
  if (!garage.includes(bikeId)) {
    clash(reader, "garage");
  }
  checkActiveRace(reader, career);
  checkRaceNumbers(reader, career);
  return career;
};

export const serialiseCareer = (career: CareerState): string =>
  JSON.stringify(career);

const parseJson: (text: string) => Json = JSON.parse;

const jsonOf = (text: string): Field => {
  try {
    return parseJson(text);
  } catch {
    return undefined;
  }
};

const decode = (text: string): SaveResult => {
  const save = jsonOf(text);
  if (!isRecord(save)) {
    return { error: { field: "", kind: "notJson" }, ok: false };
  }
  if (save.version !== SAVE_VERSION) {
    return { error: { field: "version", kind: "wrongVersion" }, ok: false };
  }
  const reader: Reader = { problems: [] };
  const career = careerOf(reader, save);
  const [error] = reader.problems;
  return error === undefined ? { career, ok: true } : { error, ok: false };
};

export const parseCareer = (text: string): SaveResult => {
  try {
    return decode(text);
  } catch {
    return { error: { field: "", kind: "invalid" }, ok: false };
  }
};
