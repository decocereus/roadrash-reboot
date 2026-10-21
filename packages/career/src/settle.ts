import type { BikeId } from "@racer/sim/bikes";

import { finaleOpen, isFinale, roadOpen } from "./field.ts";
import { resultLine } from "./lines.ts";
import type { RivalLine } from "./lines.ts";
import { remember } from "./memory.ts";
import { abandonedOutcome } from "./outcome.ts";
import type {
  Placing,
  RaceOutcome,
  RaceResult,
  RivalIncidents,
} from "./outcome.ts";
import { summaryOf } from "./result.ts";
import { scoreRace } from "./season.ts";
import { BOARD_NOTES, nextRaceId, qualifiedCount } from "./state.ts";
import type {
  ActiveRace,
  BoardNote,
  CareerRecord,
  CareerState,
  EndingId,
  QualifiedRoads,
  StoryFlags,
} from "./state.ts";
import {
  AD_REPAIR_RATE,
  ALLY,
  ALLY_BREAKING_KNOCKDOWNS,
  ALLY_LEVEL,
  creditLimitOf,
  ENVELOPE_CLAWBACK,
  ENVELOPE_LEVEL,
  ENVELOPE_RIVAL,
  ENVELOPE_ROAD,
  fines,
  LAST_LEVEL,
  levelAfter,
  prizeFor,
  QUALIFYING_PLACE,
  repairBill,
  repeatPrizeFor,
  REPOSSESSION_BIKE,
  REPOSSESSION_CREDIT_LIMIT,
  roadList,
  stockArrivingAt,
  tradeInOf,
} from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

type StartRefusal = "gameOver" | "seasonOver" | "raceActive" | "roadClosed";

export type StartResult =
  | { readonly started: true; readonly career: CareerState }
  | {
      readonly started: false;
      readonly career: CareerState;
      readonly reason: StartRefusal;
    };

export type RepairOffer = "full" | "half";

export interface LevelUp {
  readonly level: Level;
  readonly bikes: readonly BikeId[];
}

interface Repossession {
  readonly bikeId: BikeId;
  readonly tradeIn: number;
}

export interface Ledger {
  readonly roadId: RoadId;
  readonly level: Level;
  readonly result: RaceResult;
  readonly place: number;
  readonly repeat: boolean;
  readonly prize: number;
  readonly repair: number;
  readonly repairHalved: boolean;
  readonly fine: number;
  readonly envelope: number;
  readonly cashBefore: number;
  readonly cashAfter: number;
  readonly qualified: boolean;
  readonly qualifiedCount: number;
  readonly levelUp: LevelUp | null;
  readonly repossessed: Repossession | null;
  readonly gameOver: boolean;
  readonly ending: EndingId | null;
  readonly line: RivalLine | null;
}

type SettleRefusal = "noActiveRace" | "gameOver" | "wrongRace";

export type Settlement =
  | {
      readonly settled: true;
      readonly career: CareerState;
      readonly ledger: Ledger;
    }
  | {
      readonly settled: false;
      readonly career: CareerState;
      readonly ledger: null;
      readonly reason: SettleRefusal;
    };

const startRefusal = (
  career: CareerState,
  roadId: RoadId
): StartRefusal | null => {
  if (career.gameOver) {
    return "gameOver";
  }
  if (career.story.ending !== null) {
    return "seasonOver";
  }
  if (career.activeRace) {
    return "raceActive";
  }
  return roadOpen(career, roadId) ? null : "roadClosed";
};

export const startRace = (
  career: CareerState,
  roadId: RoadId,
  seed: number
): StartResult => {
  const reason = startRefusal(career, roadId);
  if (reason) {
    return { career, reason, started: false };
  }
  const envelopeRace =
    roadId === ENVELOPE_ROAD && career.level === ENVELOPE_LEVEL;
  return {
    career: {
      ...career,
      activeRace: {
        bikeId: career.bikeId,
        level: career.level,
        raceId: nextRaceId(career),
        roadId,
        seed,
        started: true,
      },
      lastResult: null,
      record: { ...career.record, starts: career.record.starts + 1 },
      story: {
        ...career.story,
        envelope:
          envelopeRace && career.story.envelope === "offered"
            ? "refused"
            : career.story.envelope,
        leftRace: false,
      },
    },
    started: true,
  };
};

interface DebtCheck {
  readonly cash: number;
  readonly bikeId: BikeId;
  readonly repossessed: Repossession | null;
  readonly gameOver: boolean;
}

const checkDebt = (cash: number, bikeId: BikeId): DebtCheck => {
  if (-cash <= creditLimitOf(bikeId)) {
    return { bikeId, cash, gameOver: false, repossessed: null };
  }
  if (bikeId === REPOSSESSION_BIKE) {
    return { bikeId, cash, gameOver: true, repossessed: null };
  }
  const tradeIn = tradeInOf(bikeId);
  return {
    bikeId: REPOSSESSION_BIKE,
    cash: cash + tradeIn,
    gameOver: -(cash + tradeIn) > REPOSSESSION_CREDIT_LIMIT,
    repossessed: { bikeId, tradeIn },
  };
};

const repossessionNotes = (debt: DebtCheck): BoardNote[] =>
  debt.repossessed
    ? [{ bikeId: debt.repossessed.bikeId, kind: "repossessed" }]
    : [];

export type BillConsequence = "covered" | "repossession" | "gameOver";

export const billConsequence = (
  career: CareerState,
  bill: number
): BillConsequence => {
  const debt = checkDebt(career.cash - bill, career.bikeId);
  if (debt.gameOver) {
    return "gameOver";
  }
  return debt.repossessed ? "repossession" : "covered";
};

const placeOf = (outcome: RaceOutcome, racer: Placing["racer"]): number =>
  outcome.placings.find((placing) => placing.racer === racer)?.place ?? 0;

const envelopeDue = (career: CareerState, outcome: RaceOutcome): boolean =>
  career.story.envelope === "taken" &&
  !career.story.envelopeClawedBack &&
  outcome.roadId === ENVELOPE_ROAD &&
  outcome.level === ENVELOPE_LEVEL &&
  outcome.result === "finished" &&
  placeOf(outcome, ENVELOPE_RIVAL) > outcome.place;

const repairOf = (
  race: ActiveRace,
  outcome: RaceOutcome,
  offer: RepairOffer
): number => {
  if (outcome.result === "wrecked") {
    return (
      repairBill(race.level, race.bikeId) *
      (offer === "half" ? AD_REPAIR_RATE : 1)
    );
  }
  return outcome.result === "quit" ? repairBill(race.level, race.bikeId) : 0;
};

interface DatedNote {
  readonly tick: number;
  readonly note: BoardNote;
}

const datedNotes = (
  outcome: RaceOutcome,
  incident: RivalIncidents
): DatedNote[] => {
  const { level, roadId, tick } = outcome;
  const { rival } = incident;
  const notes: DatedNote[] = [];
  if (incident.weaponTakenByPlayer !== "none") {
    notes.push({
      note: {
        kind: "weaponWanted",
        rival,
        weapon: incident.weaponTakenByPlayer,
      },
      tick: incident.weaponTakenTick,
    });
  }
  if (incident.knockedDownByPlayer > 0) {
    notes.push({
      note: { kind: "wentDown", km: incident.knockdownKm, rival, roadId },
      tick: incident.knockdownTick,
    });
  }
  if (incident.knockedPlayerDown > 0) {
    notes.push({
      note: {
        kind: "knockedPlayerDown",
        km: incident.knockedPlayerDownKm,
        rival,
        roadId,
      },
      tick: incident.knockedPlayerDownTick,
    });
  }
  if (incident.busted !== "none") {
    notes.push({
      note: { fine: fines[level], kind: "busted", rival, roadId },
      tick: incident.bustedTick,
    });
  }
  if (incident.lostToPlayerByAWheel) {
    notes.push({
      note: { kind: "photoFinish", loser: rival, winner: "player" },
      tick,
    });
  }
  if (incident.beatPlayerByAWheel) {
    notes.push({
      note: { kind: "photoFinish", loser: "player", winner: rival },
      tick,
    });
  }
  return notes;
};

const notesOf = (outcome: RaceOutcome): BoardNote[] =>
  outcome.incidents
    .flatMap((incident) => datedNotes(outcome, incident))
    .toSorted((left, right) => right.tick - left.tick)
    .map((dated) => dated.note);

const memoryAfter = (
  career: CareerState,
  outcome: RaceOutcome
): CareerState["memory"] => {
  const memory = { ...career.memory };
  for (const incidents of outcome.incidents) {
    memory[incidents.rival] = remember(
      career.memory[incidents.rival],
      incidents,
      career.record.starts,
      outcome.result === "finished" &&
        placeOf(outcome, incidents.rival) > outcome.place
    );
  }
  return memory;
};

const count = (counted: boolean): number => (counted ? 1 : 0);

const recordAfter = (
  record: CareerRecord,
  outcome: RaceOutcome,
  prize: number
): CareerRecord => {
  const finished = outcome.result === "finished";
  return {
    ...record,
    busts: record.busts + count(outcome.result === "busted"),
    earnings: record.earnings + prize,
    knockdowns:
      record.knockdowns +
      outcome.incidents.reduce(
        (total, incident) => total + incident.knockedDownByPlayer,
        0
      ),
    podiums:
      record.podiums + count(finished && outcome.place <= QUALIFYING_PLACE),
    wins: record.wins + count(finished && outcome.place === 1),
    wrecks:
      record.wrecks +
      count(outcome.result === "wrecked" || outcome.result === "quit"),
  };
};

interface Bill {
  readonly repeat: boolean;
  readonly prize: number;
  readonly repair: number;
  readonly repairHalved: boolean;
  readonly fine: number;
  readonly envelope: number;
}

const billOf = (
  career: CareerState,
  race: ActiveRace,
  outcome: RaceOutcome,
  offer: RepairOffer
): Bill => {
  const repeat = career.qualified[race.level][race.roadId] !== undefined;
  const earned = repeat ? repeatPrizeFor : prizeFor;
  return {
    envelope: envelopeDue(career, outcome) ? -ENVELOPE_CLAWBACK : 0,
    fine: outcome.result === "busted" ? fines[race.level] : 0,
    prize:
      outcome.result === "finished" ? earned(race.level, outcome.place) : 0,
    repair: repairOf(race, outcome, offer),
    repairHalved: outcome.result === "wrecked" && offer === "half",
    repeat,
  };
};

interface Progress {
  readonly roads: QualifiedRoads;
  readonly newlyQualified: boolean;
  readonly level: Level;
  readonly promoted: boolean;
  readonly arrivals: readonly BikeId[];
  readonly ending: EndingId | null;
}

const endingOf = (career: CareerState, outcome: RaceOutcome): EndingId => {
  if (outcome.place !== 1) {
    return "runner-up";
  }
  return career.story.envelope === "taken" ? "bought-crown" : "clean-crown";
};

const progressOf = (
  career: CareerState,
  race: ActiveRace,
  outcome: RaceOutcome,
  gameOver: boolean
): Progress => {
  const { level, roadId } = race;
  const bestPlace = career.qualified[level][roadId];
  const qualifies =
    outcome.result === "finished" && outcome.place <= QUALIFYING_PLACE;
  const roads: QualifiedRoads = qualifies
    ? {
        ...career.qualified[level],
        [roadId]: Math.min(bestPlace ?? outcome.place, outcome.place),
      }
    : career.qualified[level];
  const newlyQualified = qualifies && bestPlace === undefined;
  const promoted =
    newlyQualified &&
    !gameOver &&
    level !== LAST_LEVEL &&
    roadList.every((road) => roads[road.id] !== undefined);
  const nextLevel = promoted ? levelAfter(level) : level;
  const crowned =
    qualifies &&
    !gameOver &&
    isFinale(roadId, level) &&
    career.story.ending === null;
  return {
    arrivals: promoted ? stockArrivingAt(nextLevel) : [],
    ending: crowned ? endingOf(career, outcome) : null,
    level: nextLevel,
    newlyQualified,
    promoted,
    roads,
  };
};

const allyAfter = (
  career: CareerState,
  outcome: RaceOutcome,
  progress: Progress
): boolean => {
  if (progress.promoted) {
    return progress.level >= ALLY_LEVEL;
  }
  const knockdowns =
    outcome.incidents.find((incident) => incident.rival === ALLY)
      ?.knockedDownByPlayer ?? 0;
  return career.story.deeAlly && knockdowns < ALLY_BREAKING_KNOCKDOWNS;
};

const envelopeAfter = (
  story: StoryFlags,
  progress: Progress
): StoryFlags["envelope"] => {
  if (progress.promoted && progress.level === ENVELOPE_LEVEL) {
    return "offered";
  }
  return progress.promoted && story.envelope === "offered"
    ? "refused"
    : story.envelope;
};

const storyAfter = (
  career: CareerState,
  outcome: RaceOutcome,
  progress: Progress,
  bill: Bill
): StoryFlags => ({
  ...career.story,
  deeAlly: allyAfter(career, outcome, progress),
  ending: progress.ending ?? career.story.ending,
  envelope: envelopeAfter(career.story, progress),
  envelopeClawedBack: career.story.envelopeClawedBack || bill.envelope !== 0,
});

const carried = (
  outcome: RaceOutcome
): Pick<CareerState, "weapon" | "weaponHits"> =>
  outcome.result === "finished" &&
  outcome.weapon !== "none" &&
  outcome.weaponHits > 0
    ? { weapon: outcome.weapon, weaponHits: outcome.weaponHits }
    : { weapon: "none", weaponHits: 0 };

const sameRace = (race: ActiveRace, outcome: RaceOutcome): boolean =>
  race.raceId === outcome.raceId &&
  race.roadId === outcome.roadId &&
  race.level === outcome.level &&
  race.seed === outcome.seed;

const refused = (career: CareerState, reason: SettleRefusal): Settlement => ({
  career,
  ledger: null,
  reason,
  settled: false,
});

export const settleRace = (
  career: CareerState,
  outcome: RaceOutcome,
  offer: RepairOffer = "full"
): Settlement => {
  const race = career.activeRace;
  if (!race) {
    return refused(career, "noActiveRace");
  }
  if (career.gameOver) {
    return refused(career, "gameOver");
  }
  if (!sameRace(race, outcome)) {
    return refused(career, "wrongRace");
  }
  const bill = billOf(career, race, outcome, offer);
  const debt = checkDebt(
    career.cash + bill.prize - bill.repair - bill.fine + bill.envelope,
    career.bikeId
  );
  const progress = progressOf(career, race, outcome, debt.gameOver);
  const settled: CareerState = {
    ...career,
    ...carried(outcome),
    activeRace: null,
    bikeId: debt.bikeId,
    board: [
      ...repossessionNotes(debt),
      ...progress.arrivals.map((bikeId): BoardNote => ({
        bikeId,
        kind: "newBike",
      })),
      ...notesOf(outcome),
      ...career.board,
    ].slice(0, BOARD_NOTES),
    cash: debt.cash,
    gameOver: debt.gameOver,
    garage: career.garage.includes(debt.bikeId)
      ? career.garage
      : [...career.garage, debt.bikeId],
    level: progress.level,
    memory: memoryAfter(career, outcome),
    qualified: { ...career.qualified, [race.level]: progress.roads },
    record: recordAfter(career.record, outcome, bill.prize),
    season: scoreRace(career.season, outcome.placings, career.record.starts),
    story: storyAfter(career, outcome, progress, bill),
  };
  const ledger: Ledger = {
    ...bill,
    cashAfter: debt.cash,
    cashBefore: career.cash,
    ending: progress.ending,
    gameOver: debt.gameOver,
    level: race.level,
    levelUp: progress.promoted
      ? { bikes: progress.arrivals, level: progress.level }
      : null,
    line: resultLine(outcome),
    place: outcome.place,
    qualified: progress.newlyQualified,
    qualifiedCount: qualifiedCount(progress.roads),
    repossessed: debt.repossessed,
    result: outcome.result,
    roadId: race.roadId,
  };
  return {
    career: {
      ...settled,
      lastResult: { ledger, summary: summaryOf(race, outcome, bill.prize) },
      story: { ...settled.story, finaleUnlocked: finaleOpen(settled) },
    },
    ledger,
    settled: true,
  };
};

export const quitRace = (
  career: CareerState,
  outcome: RaceOutcome
): Settlement => settleRace(career, outcome);

export const resumeCareer = (save: CareerState): Settlement => {
  if (!save.activeRace) {
    return refused(save, "noActiveRace");
  }
  const settlement = settleRace(save, abandonedOutcome(save.activeRace));
  if (!settlement.settled) {
    return settlement;
  }
  const leftRace: BoardNote = { kind: "leftRace" };
  return {
    ...settlement,
    career: {
      ...settlement.career,
      board: [leftRace, ...settlement.career.board].slice(0, BOARD_NOTES),
      story: { ...settlement.career.story, leftRace: true },
    },
  };
};
