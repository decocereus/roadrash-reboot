import type { BikeId } from "@racer/sim/bikes";
import type { OfficerId } from "@racer/sim/cast";
import type { WeaponKind } from "@racer/sim/state";
import { weapons } from "@racer/sim/weapons";

import { memoryRows } from "./memory.ts";
import type {
  BustWitness,
  Fate,
  RaceResult,
  RivalIncidents,
} from "./outcome.ts";
import type {
  BustDetails,
  LastResult,
  RaceSummary,
  ResultRow,
  WreckDetails,
} from "./result.ts";
import type { Ledger, LevelUp, Repossession } from "./settle.ts";
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
  RIVALS_PER_RACE,
  roadList,
} from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

type Json = null | boolean | number | string | Json[] | JsonRecord;

interface JsonRecord {
  readonly [key: string]: Json;
}

type Field = Json | undefined;

export type SaveErrorKind =
  | "notJson"
  | "wrongVersion"
  | "invalid"
  | "inconsistent";

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
const MAX_TICKS = 1e7;
const MAX_TEXT = 300;
const METRES_PER_KM = 1000;

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
const raceResults: readonly RaceResult[] = [
  "finished",
  "busted",
  "wrecked",
  "quit",
];
const fates: readonly Fate[] = ["finished", "racing", "busted", "wrecked"];
const witnesses: readonly BustWitness[] = ["none", "near", "far"];
const officerIds: readonly OfficerId[] = ["dolores-pike", "wendell-haverty"];

const isNumber = (value: Field): value is number => Number.isFinite(value);

const isFlag = (value: Field): value is boolean =>
  value === true || value === false;

const isRecord = (value: Field): value is JsonRecord =>
  Object(value) === value && !Array.isArray(value);

const isText = (value: Field): value is string =>
  !isRecord(value) && !Array.isArray(value) && value === String(value);

interface Reader {
  readonly problems: SaveError[];
}

const fail = <Fallback>(
  reader: Reader,
  field: string,
  fallback: Fallback
): Fallback => {
  reader.problems.push({ field, kind: "invalid" });
  return fallback;
};

const clash = (reader: Reader, field: string): void => {
  reader.problems.push({ field, kind: "inconsistent" });
};

const recordOf = (reader: Reader, value: Field, field: string): JsonRecord =>
  isRecord(value) ? value : fail(reader, field, {});

const listOf = (
  reader: Reader,
  value: Field,
  field: string,
  longest: number
): Json[] =>
  Array.isArray(value) && value.length <= longest
    ? value
    : fail(reader, field, []);

const rejectOtherKeys = (
  reader: Reader,
  record: JsonRecord,
  field: string,
  known: readonly string[]
): void => {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) {
      fail(reader, `${field}.${key}`, key);
    }
  }
};

interface Range {
  readonly minimum: number;
  readonly maximum: number;
}

const count: Range = { maximum: MAX_RACES, minimum: 0 };
const raceNumber: Range = { maximum: MAX_RACES, minimum: 1 };
const money: Range = { maximum: MAX_MONEY, minimum: 0 };
const balance: Range = { maximum: MAX_MONEY, minimum: -MAX_MONEY };
const kilometres: Range = { maximum: MAX_KM, minimum: 0 };
const metres: Range = { maximum: MAX_KM * METRES_PER_KM, minimum: 0 };
const raceTick: Range = { maximum: MAX_TICKS, minimum: 0 };
const finishTicks: Range = { maximum: MAX_TICKS, minimum: -1 };
const fieldPlace: Range = { maximum: FIELD_SIZE, minimum: 1 };
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

const textOf = (reader: Reader, value: Field, field: string): string =>
  isText(value) && value.length <= MAX_TEXT ? value : fail(reader, field, "");

const orNull = <Value>(
  value: Field,
  read: (present: Field) => Value
): Value | null => (value === null ? null : read(value));

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

const rivalOf = (reader: Reader, value: Field, field: string) =>
  oneOf(reader, value, field, rivalIds, "juno-kade");

const weaponOf = (reader: Reader, value: Field, field: string): WeaponKind =>
  oneOf(reader, value, field, weaponKinds, "none");

const qualifiedOf = (
  reader: Reader,
  value: Field,
  field: string
): QualifiedRoads => {
  const record = recordOf(reader, value, field);
  rejectOtherKeys(reader, record, field, roadIds);
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
    earnings: wholeOf(reader, record.earnings, "record.earnings", money),
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
  rejectOtherKeys(reader, ahead, `${field}.lastAhead`, racerIds);
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
  const rival = () => rivalOf(reader, record.rival, field);
  if (record.kind === "weaponWanted") {
    return {
      kind: "weaponWanted",
      rival: rival(),
      weapon: weaponOf(reader, record.weapon, field),
    };
  }
  if (record.kind === "wentDown" || record.kind === "knockedPlayerDown") {
    return {
      kind: record.kind,
      km: numberOf(reader, record.km, field, kilometres),
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
      fine: wholeOf(reader, record.fine, field, money),
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
    fail(reader, field, record.kind);
  }
  return { bikeId: bikeOf(reader, record.bikeId, field), kind: "newBike" };
};

const activeRaceOf = (reader: Reader, value: Field): ActiveRace | null => {
  if (value === null) {
    return null;
  }
  const record = recordOf(reader, value, "activeRace");
  if (record.started !== true) {
    fail(reader, "activeRace.started", record.started);
  }
  return {
    bikeId: bikeOf(reader, record.bikeId, "activeRace.bikeId"),
    level: levelOf(reader, record.level, "activeRace.level"),
    raceId: wholeOf(reader, record.raceId, "activeRace.raceId", raceNumber),
    roadId: roadOf(reader, record.roadId, "activeRace.roadId"),
    seed: numberOf(reader, record.seed, "activeRace.seed", anySeed),
    started: true,
  };
};

const rowOf = (reader: Reader, value: Field, field: string): ResultRow => {
  const record = recordOf(reader, value, field);
  return {
    bikeId: bikeOf(reader, record.bikeId, `${field}.bikeId`),
    fate: oneOf(reader, record.fate, `${field}.fate`, fates, "racing"),
    finishTick: wholeOf(
      reader,
      record.finishTick,
      `${field}.finishTick`,
      finishTicks
    ),
    metresLeft: numberOf(
      reader,
      record.metresLeft,
      `${field}.metresLeft`,
      metres
    ),
    name: textOf(reader, record.name, `${field}.name`),
    place: wholeOf(reader, record.place, `${field}.place`, fieldPlace),
    prize: wholeOf(reader, record.prize, `${field}.prize`, money),
    racer: racerOf(reader, record.racer, `${field}.racer`),
  };
};

const incidentsOf = (
  reader: Reader,
  value: Field,
  field: string
): RivalIncidents => {
  const record = recordOf(reader, value, field);
  const at = (key: keyof RivalIncidents): string => `${field}.${key}`;
  const tally = (key: keyof RivalIncidents): number =>
    wholeOf(reader, record[key], at(key), count);
  const tick = (key: keyof RivalIncidents): number =>
    wholeOf(reader, record[key], at(key), raceTick);
  const km = (key: keyof RivalIncidents): number =>
    numberOf(reader, record[key], at(key), kilometres);
  const flag = (key: keyof RivalIncidents): boolean =>
    flagOf(reader, record[key], at(key));
  return {
    beatPlayerByAWheel: flag("beatPlayerByAWheel"),
    busted: oneOf(reader, record.busted, at("busted"), witnesses, "none"),
    bustedTick: tick("bustedTick"),
    knockdownKm: km("knockdownKm"),
    knockdownTick: tick("knockdownTick"),
    knockedDownByPlayer: tally("knockedDownByPlayer"),
    knockedPlayerDown: tally("knockedPlayerDown"),
    knockedPlayerDownKm: km("knockedPlayerDownKm"),
    knockedPlayerDownTick: tick("knockedPlayerDownTick"),
    lostToPlayerByAWheel: flag("lostToPlayerByAWheel"),
    rival: rivalOf(reader, record.rival, at("rival")),
    tookPlayerWeapon: weaponOf(
      reader,
      record.tookPlayerWeapon,
      at("tookPlayerWeapon")
    ),
    tradedHits: flag("tradedHits"),
    weaponTakenByPlayer: weaponOf(
      reader,
      record.weaponTakenByPlayer,
      at("weaponTakenByPlayer")
    ),
    weaponTakenTick: tick("weaponTakenTick"),
  };
};

const bustOf = (reader: Reader, value: Field, field: string): BustDetails => {
  const record = recordOf(reader, value, field);
  return {
    fine: wholeOf(reader, record.fine, `${field}.fine`, money),
    km: numberOf(reader, record.km, `${field}.km`, kilometres),
    line: textOf(reader, record.line, `${field}.line`),
    officer: oneOf(
      reader,
      record.officer,
      `${field}.officer`,
      officerIds,
      "dolores-pike"
    ),
    officerName: textOf(reader, record.officerName, `${field}.officerName`),
    weapon: weaponOf(reader, record.weapon, `${field}.weapon`),
  };
};

const wreckOf = (reader: Reader, value: Field, field: string): WreckDetails => {
  const record = recordOf(reader, value, field);
  return {
    bikeId: bikeOf(reader, record.bikeId, `${field}.bikeId`),
    km: numberOf(reader, record.km, `${field}.km`, kilometres),
  };
};

const summaryOf = (
  reader: Reader,
  value: Field,
  field: string
): RaceSummary => {
  const record = recordOf(reader, value, field);
  return {
    bust: orNull(record.bust, (bust) => bustOf(reader, bust, `${field}.bust`)),
    incidents: listOf(
      reader,
      record.incidents,
      `${field}.incidents`,
      RIVALS_PER_RACE
    ).map((incidents, index) =>
      incidentsOf(reader, incidents, `${field}.incidents.${index}`)
    ),
    raceId: wholeOf(reader, record.raceId, `${field}.raceId`, raceNumber),
    rows: listOf(reader, record.rows, `${field}.rows`, FIELD_SIZE).map(
      (row, index) => rowOf(reader, row, `${field}.rows.${index}`)
    ),
    tick: wholeOf(reader, record.tick, `${field}.tick`, raceTick),
    wreck: orNull(record.wreck, (wreck) =>
      wreckOf(reader, wreck, `${field}.wreck`)
    ),
  };
};

const levelUpOf = (reader: Reader, value: Field, field: string): LevelUp => {
  const record = recordOf(reader, value, field);
  return {
    bikes: listOf(reader, record.bikes, `${field}.bikes`, catalogue.length).map(
      (bike, index) => bikeOf(reader, bike, `${field}.bikes.${index}`)
    ),
    level: levelOf(reader, record.level, `${field}.level`),
  };
};

const repossessionOf = (
  reader: Reader,
  value: Field,
  field: string
): Repossession => {
  const record = recordOf(reader, value, field);
  return {
    bikeId: bikeOf(reader, record.bikeId, `${field}.bikeId`),
    tradeIn: wholeOf(reader, record.tradeIn, `${field}.tradeIn`, money),
  };
};

const lineOf = (reader: Reader, value: Field, field: string) => {
  const record = recordOf(reader, value, field);
  return {
    rival: rivalOf(reader, record.rival, `${field}.rival`),
    text: textOf(reader, record.text, `${field}.text`),
  };
};

const ledgerOf = (reader: Reader, value: Field, field: string): Ledger => {
  const record = recordOf(reader, value, field);
  const at = (key: keyof Ledger): string => `${field}.${key}`;
  const flag = (key: keyof Ledger): boolean =>
    flagOf(reader, record[key], at(key));
  const paid = (key: keyof Ledger): number =>
    wholeOf(reader, record[key], at(key), money);
  const cash = (key: keyof Ledger): number =>
    wholeOf(reader, record[key], at(key), balance);
  return {
    cashAfter: cash("cashAfter"),
    cashBefore: cash("cashBefore"),
    ending: orNull(record.ending, (ending) =>
      oneOf(reader, ending, at("ending"), endingIds, "runner-up")
    ),
    envelope: cash("envelope"),
    fine: paid("fine"),
    gameOver: flag("gameOver"),
    level: levelOf(reader, record.level, at("level")),
    levelUp: orNull(record.levelUp, (levelUp) =>
      levelUpOf(reader, levelUp, at("levelUp"))
    ),
    line: orNull(record.line, (line) => lineOf(reader, line, at("line"))),
    place: wholeOf(reader, record.place, at("place"), fieldPlace),
    prize: paid("prize"),
    qualified: flag("qualified"),
    qualifiedCount: wholeOf(
      reader,
      record.qualifiedCount,
      at("qualifiedCount"),
      {
        maximum: roadIds.length,
        minimum: 0,
      }
    ),
    repair: paid("repair"),
    repairHalved: flag("repairHalved"),
    repeat: flag("repeat"),
    repossessed: orNull(record.repossessed, (repossessed) =>
      repossessionOf(reader, repossessed, at("repossessed"))
    ),
    result: oneOf(reader, record.result, at("result"), raceResults, "quit"),
    roadId: roadOf(reader, record.roadId, at("roadId")),
  };
};

const lastResultOf = (reader: Reader, value: Field): LastResult | null =>
  orNull(value, (present) => {
    const record = recordOf(reader, present, "lastResult");
    return {
      ledger: ledgerOf(reader, record.ledger, "lastResult.ledger"),
      summary: summaryOf(reader, record.summary, "lastResult.summary"),
    };
  });

const checkActiveRace = (reader: Reader, career: CareerState): void => {
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

const checkRaceNumbers = (reader: Reader, career: CareerState): void => {
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
