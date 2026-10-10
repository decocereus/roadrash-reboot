import type { BikeId } from "@racer/sim/bikes";
import type { WeaponKind } from "@racer/sim/state";
import { weapons } from "@racer/sim/weapons";

import { memoryRows } from "./memory.ts";
import {
  BOARD_NOTES,
  byRacer,
  byRival,
  racerIds,
  rivalIds,
  SAVE_VERSION,
} from "./state.ts";
import type {
  ActiveRace,
  BoardNote,
  CareerRecord,
  CareerState,
  EndingId,
  EnvelopeFlag,
  QualifiedRoads,
  RacerId,
  RivalMemory,
  SeasonEntry,
  StoryFlags,
} from "./state.ts";
import {
  byLevel,
  catalogue,
  FIELD_SIZE,
  levels,
  QUALIFYING_PLACE,
  roadList,
} from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

type Json = null | boolean | number | string | Json[] | JsonRecord;

interface JsonRecord {
  readonly [key: string]: Json;
}

type Field = Json | undefined;

export type SaveErrorKind = "notJson" | "wrongVersion" | "invalid";

export interface SaveError {
  readonly kind: SaveErrorKind;
  readonly field: string;
}

export type SaveResult =
  | { readonly ok: true; readonly career: CareerState }
  | { readonly ok: false; readonly error: SaveError };

const MAX_MONEY = 1e9;
const MAX_RACES = 1e6;
const MAX_KM = 100;

const weaponKinds: readonly WeaponKind[] = [
  "none",
  "club",
  "chain",
  "crowbar",
  "baton",
  "cue",
  "sign",
];
const envelopeFlags: readonly EnvelopeFlag[] = [
  "unseen",
  "offered",
  "taken",
  "refused",
];
const endingIds: readonly EndingId[] = [
  "clean-crown",
  "bought-crown",
  "runner-up",
];
const roadIds: readonly RoadId[] = roadList.map((road) => road.id);

const isNumber = (value: Field): value is number => Number.isFinite(value);

const isText = (value: Field): value is string => value === String(value);

const isFlag = (value: Field): value is boolean =>
  value === true || value === false;

const isRecord = (value: Field): value is JsonRecord =>
  value !== undefined &&
  value !== null &&
  !Array.isArray(value) &&
  !isNumber(value) &&
  !isText(value) &&
  !isFlag(value);

interface Reader {
  readonly problems: string[];
}

const fail = <Fallback>(
  reader: Reader,
  field: string,
  fallback: Fallback
): Fallback => {
  reader.problems.push(field);
  return fallback;
};

const recordOf = (reader: Reader, value: Field, field: string): JsonRecord =>
  isRecord(value) ? value : fail(reader, field, {});

const listOf = (reader: Reader, value: Field, field: string): Json[] =>
  Array.isArray(value) ? value : fail(reader, field, []);

interface Range {
  readonly minimum: number;
  readonly maximum: number;
}

const count: Range = { maximum: MAX_RACES, minimum: 0 };
const anySeed: Range = {
  maximum: Number.MAX_SAFE_INTEGER,
  minimum: Number.MIN_SAFE_INTEGER,
};

const numberOf = (
  reader: Reader,
  value: Field,
  field: string,
  range: Range
): number =>
  isNumber(value) && value >= range.minimum && value <= range.maximum
    ? value
    : fail(reader, field, range.minimum);

const wholeOf = (
  reader: Reader,
  value: Field,
  field: string,
  range: Range
): number =>
  Number.isInteger(value)
    ? numberOf(reader, value, field, range)
    : fail(reader, field, range.minimum);

const flagOf = (reader: Reader, value: Field, field: string): boolean =>
  isFlag(value) ? value : fail(reader, field, false);

const oneOf = <Option extends string | number>(
  reader: Reader,
  value: Field,
  field: string,
  options: readonly Option[],
  fallback: Option
): Option =>
  options.find((option) => option === value) ?? fail(reader, field, fallback);

const bikeOf = (reader: Reader, value: Field, field: string): BikeId =>
  oneOf(reader, value, field, catalogue, "gutter-pup-250");

const roadOf = (reader: Reader, value: Field, field: string): RoadId =>
  oneOf(reader, value, field, roadIds, "ridge-road");

const levelOf = (reader: Reader, value: Field, field: string): Level =>
  oneOf(reader, value, field, levels, 1);

const racerOf = (reader: Reader, value: Field, field: string): RacerId =>
  oneOf(reader, value, field, racerIds, "player");

const qualifiedOf = (
  reader: Reader,
  value: Field,
  field: string
): QualifiedRoads => {
  const record = recordOf(reader, value, field);
  const qualified: QualifiedRoads = {};
  for (const roadId of roadIds) {
    if (record[roadId] !== undefined) {
      qualified[roadId] = wholeOf(
        reader,
        record[roadId],
        `${field}.${roadId}`,
        {
          maximum: QUALIFYING_PLACE,
          minimum: 1,
        }
      );
    }
  }
  return qualified;
};

const careerRecordOf = (reader: Reader, value: Field): CareerRecord => {
  const record = recordOf(reader, value, "record");
  const tally = (key: keyof CareerRecord): number =>
    wholeOf(reader, record[key], `record.${key}`, count);
  return {
    busts: tally("busts"),
    earnings: wholeOf(reader, record.earnings, "record.earnings", {
      maximum: MAX_MONEY,
      minimum: 0,
    }),
    knockdowns: tally("knockdowns"),
    podiums: tally("podiums"),
    starts: tally("starts"),
    wins: tally("wins"),
    wrecks: tally("wrecks"),
  };
};

const seasonEntryOf = (
  reader: Reader,
  value: Field,
  field: string
): SeasonEntry => {
  const record = recordOf(reader, value, field);
  const ahead = recordOf(reader, record.lastAhead, `${field}.lastAhead`);
  const lastAhead: Partial<Record<RacerId, number>> = {};
  for (const racer of racerIds) {
    if (ahead[racer] !== undefined) {
      lastAhead[racer] = wholeOf(
        reader,
        ahead[racer],
        `${field}.lastAhead.${racer}`,
        count
      );
    }
  }
  return {
    lastAhead,
    points: wholeOf(reader, record.points, `${field}.points`, {
      maximum: MAX_RACES * FIELD_SIZE,
      minimum: 0,
    }),
    wins: wholeOf(reader, record.wins, `${field}.wins`, count),
  };
};

const memoryOf = (reader: Reader, value: Field, field: string): RivalMemory => {
  const record = recordOf(reader, value, field);
  const stamp = (key: keyof RivalMemory): number =>
    wholeOf(reader, record[key], `${field}.${key}`, count);
  return {
    aggressionBonus: numberOf(
      reader,
      record.aggressionBonus,
      `${field}.aggressionBonus`,
      { maximum: 1, minimum: -1 }
    ),
    beatPlayerByAWheel: stamp("beatPlayerByAWheel"),
    busted: stamp("busted"),
    bustedNearPlayer: stamp("bustedNearPlayer"),
    grudge: flagOf(reader, record.grudge, `${field}.grudge`),
    knockedDownByPlayer: stamp("knockedDownByPlayer"),
    knockedPlayerDown: stamp("knockedPlayerDown"),
    lostToPlayerByAWheel: stamp("lostToPlayerByAWheel"),
    outrunUntouched: stamp("outrunUntouched"),
    sharedRace: stamp("sharedRace"),
    tookPlayerWeapon: stamp("tookPlayerWeapon"),
    weaponTakenByPlayer: stamp("weaponTakenByPlayer"),
  };
};

const storyOf = (reader: Reader, value: Field): StoryFlags => {
  const record = recordOf(reader, value, "story");
  const flag = (key: keyof StoryFlags): boolean =>
    flagOf(reader, record[key], `story.${key}`);
  return {
    deeAlly: flag("deeAlly"),
    ending:
      record.ending === null
        ? null
        : oneOf(reader, record.ending, "story.ending", endingIds, "runner-up"),
    envelope: oneOf(
      reader,
      record.envelope,
      "story.envelope",
      envelopeFlags,
      "unseen"
    ),
    envelopeClawedBack: flag("envelopeClawedBack"),
    finaleUnlocked: flag("finaleUnlocked"),
    leftRace: flag("leftRace"),
  };
};

const noteOf = (reader: Reader, value: Field, field: string): BoardNote => {
  const record = recordOf(reader, value, field);
  const rival = () => oneOf(reader, record.rival, field, rivalIds, "juno-kade");
  if (record.kind === "weaponWanted") {
    return {
      kind: "weaponWanted",
      rival: rival(),
      weapon: oneOf(reader, record.weapon, field, weaponKinds, "none"),
    };
  }
  if (record.kind === "wentDown") {
    return {
      kind: "wentDown",
      km: numberOf(reader, record.km, field, { maximum: MAX_KM, minimum: 0 }),
      rival: rival(),
      roadId: roadOf(reader, record.roadId, field),
    };
  }
  if (record.kind === "photoFinish") {
    return {
      kind: "photoFinish",
      loser: racerOf(reader, record.loser, field),
      winner: racerOf(reader, record.winner, field),
    };
  }
  if (record.kind === "busted") {
    return {
      fine: wholeOf(reader, record.fine, field, {
        maximum: MAX_MONEY,
        minimum: 0,
      }),
      kind: "busted",
      rival: rival(),
      roadId: roadOf(reader, record.roadId, field),
    };
  }
  if (record.kind === "leftRace") {
    return { kind: "leftRace" };
  }
  if (record.kind === "repossessed") {
    return {
      bikeId: bikeOf(reader, record.bikeId, field),
      kind: "repossessed",
    };
  }
  if (record.kind !== "newBike") {
    reader.problems.push(field);
  }
  return { bikeId: bikeOf(reader, record.bikeId, field), kind: "newBike" };
};

const activeRaceOf = (reader: Reader, value: Field): ActiveRace | null => {
  if (value === null) {
    return null;
  }
  const record = recordOf(reader, value, "activeRace");
  if (record.started !== true) {
    reader.problems.push("activeRace.started");
  }
  return {
    bikeId: bikeOf(reader, record.bikeId, "activeRace.bikeId"),
    level: levelOf(reader, record.level, "activeRace.level"),
    roadId: roadOf(reader, record.roadId, "activeRace.roadId"),
    seed: numberOf(reader, record.seed, "activeRace.seed", anySeed),
    started: true,
  };
};

const careerOf = (reader: Reader, save: JsonRecord): CareerState => {
  const weapon = oneOf(reader, save.weapon, "weapon", weaponKinds, "none");
  const qualified = recordOf(reader, save.qualified, "qualified");
  const season = recordOf(reader, save.season, "season");
  const memory = recordOf(reader, save.memory, "memory");
  const garage = listOf(reader, save.garage, "garage").map((bike, index) =>
    bikeOf(reader, bike, `garage.${index}`)
  );
  const bikeId = bikeOf(reader, save.bikeId, "bikeId");
  if (!garage.includes(bikeId)) {
    reader.problems.push("garage");
  }
  const board = listOf(reader, save.board, "board");
  if (board.length > BOARD_NOTES) {
    reader.problems.push("board");
  }
  const career: CareerState = {
    activeRace: activeRaceOf(reader, save.activeRace),
    bikeId,
    board: board.map((note, index) => noteOf(reader, note, `board.${index}`)),
    cash: wholeOf(reader, save.cash, "cash", {
      maximum: MAX_MONEY,
      minimum: -MAX_MONEY,
    }),
    gameOver: flagOf(reader, save.gameOver, "gameOver"),
    garage,
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
  if (career.activeRace && career.activeRace.level !== career.level) {
    reader.problems.push("activeRace.level");
  }
  for (const rival of rivalIds) {
    const remembered = career.memory[rival];
    if (
      remembered.sharedRace > career.record.starts ||
      memoryRows.some((row) => remembered[row] > remembered.sharedRace)
    ) {
      reader.problems.push(`memory.${rival}`);
    }
  }
  return career;
};

export const serialiseCareer = (career: CareerState): string =>
  JSON.stringify(career);

const jsonOf = (text: string): Field => {
  try {
    const parsed: Json = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
};

export const parseCareer = (text: string): SaveResult => {
  const save = jsonOf(text);
  if (!isRecord(save)) {
    return { error: { field: "", kind: "notJson" }, ok: false };
  }
  if (save.version !== SAVE_VERSION) {
    return { error: { field: "version", kind: "wrongVersion" }, ok: false };
  }
  const reader: Reader = { problems: [] };
  const career = careerOf(reader, save);
  const [field] = reader.problems;
  return field === undefined
    ? { career, ok: true }
    : { error: { field, kind: "invalid" }, ok: false };
};
