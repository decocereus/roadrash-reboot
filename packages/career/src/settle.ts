import type { BikeId } from "@racer/sim/bikes";
import { rivalIds } from "@racer/sim/cast";
import { tierAfter } from "@racer/sim/difficulty";

import { finaleOpen, isFinale, roadOpen } from "./field.ts";
import { resultLine } from "./lines.ts";
import type { RivalLine } from "./lines.ts";
import { remember, sitOut } from "./memory.ts";
import { abandonedOutcome } from "./outcome.ts";
import type {
  Placing,
  RaceOutcome,
  RaceResult,
  RivalIncidents,
} from "./outcome.ts";
import { summaryOf } from "./result.ts";
import type { RaceRules } from "./rules.ts";
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
  ALLY_TIER,
  creditLimitOf,
  fineFor,
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
import type { Tier, RoadId } from "./tables.ts";

type StartRefusal = "gameOver" | "seasonOver" | "raceActive" | "roadClosed";

export type StartResult =
  | { readonly started: true; readonly career: CareerState }
  | {
      readonly started: false;
      readonly career: CareerState;
      readonly reason: StartRefusal;
    };

export type RepairOffer = "full" | "half";

interface TierUp {
  readonly tier: Tier;
  readonly bikes: readonly BikeId[];
}

interface Repossession {
  readonly bikeId: BikeId;
  readonly tradeIn: number;
}

export interface Ledger {
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly result: RaceResult;
  readonly place: number;
  readonly repeat: boolean;
  readonly prize: number;
  readonly repair: number;
  readonly repairHalved: boolean;
  readonly fine: number;
  readonly cashBefore: number;
  readonly cashAfter: number;
  readonly qualified: boolean;
  readonly qualifiedCount: number;
  readonly tierUp: TierUp | null;
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
  return {
    career: {
      ...career,
      activeRace: {
        bikeId: career.bikeId,
        raceId: nextRaceId(career),
        roadId,
        seed,
        started: true,
        tier: career.tier,
      },
      lastResult: null,
      record: { ...career.record, starts: career.record.starts + 1 },
      story: { ...career.story, leftRace: false },
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

const repairOf = (
  race: ActiveRace,
  outcome: RaceOutcome,
  offer: RepairOffer
): number => {
  const full = repairBill(race.tier, race.bikeId);
  if (outcome.result === "wrecked") {
    return full * (offer === "half" ? AD_REPAIR_RATE : 1);
  }
  return outcome.result === "quit" ? full : 0;
};

interface DatedNote {
  readonly tick: number;
  readonly note: BoardNote;
}

const datedNotes = (
  outcome: RaceOutcome,
  incident: RivalIncidents
): DatedNote[] => {
  const { tier, roadId, tick } = outcome;
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
      note: { fine: fineFor(tier), kind: "busted", rival, roadId },
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
  for (const rival of rivalIds) {
    memory[rival] = sitOut(career.memory[rival]);
  }
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
}

const billOf = (
  career: CareerState,
  race: ActiveRace,
  outcome: RaceOutcome,
  offer: RepairOffer
): Bill => {
  const repeat = career.qualified[race.tier][race.roadId] !== undefined;
  const earned = repeat ? repeatPrizeFor : prizeFor;
  return {
    fine: outcome.result === "busted" ? fineFor(race.tier) : 0,
    prize: outcome.result === "finished" ? earned(race.tier, outcome.place) : 0,
    repair: repairOf(race, outcome, offer),
    repairHalved: outcome.result === "wrecked" && offer === "half",
    repeat,
  };
};

interface Progress {
  readonly roads: QualifiedRoads;
  readonly newlyQualified: boolean;
  readonly tier: Tier;
  readonly promoted: boolean;
  readonly arrivals: readonly BikeId[];
  readonly ending: EndingId | null;
}

const endingOf = (outcome: RaceOutcome): EndingId =>
  outcome.place === 1 ? "clean-crown" : "runner-up";

const progressOf = (
  career: CareerState,
  race: ActiveRace,
  outcome: RaceOutcome,
  gameOver: boolean
): Progress => {
  const { tier, roadId } = race;
  const bestPlace = career.qualified[tier][roadId];
  const qualifies =
    outcome.result === "finished" && outcome.place <= QUALIFYING_PLACE;
  const roads: QualifiedRoads = qualifies
    ? {
        ...career.qualified[tier],
        [roadId]: Math.min(bestPlace ?? outcome.place, outcome.place),
      }
    : career.qualified[tier];
  const newlyQualified = qualifies && bestPlace === undefined;
  const next = tierAfter(tier);
  const promoted =
    next !== null &&
    newlyQualified &&
    !gameOver &&
    roadList.every((road) => roads[road.id] !== undefined);
  const nextTier = promoted ? next : tier;
  const crowned =
    qualifies &&
    !gameOver &&
    isFinale(roadId, tier) &&
    career.story.ending === null;
  return {
    arrivals: promoted ? stockArrivingAt(nextTier) : [],
    ending: crowned ? endingOf(outcome) : null,
    newlyQualified,
    promoted,
    roads,
    tier: nextTier,
  };
};

const allyAfter = (
  career: CareerState,
  outcome: RaceOutcome,
  progress: Progress
): boolean => {
  if (progress.promoted) {
    return progress.tier >= ALLY_TIER;
  }
  const knockdowns =
    outcome.incidents.find((incident) => incident.rival === ALLY)
      ?.knockedDownByPlayer ?? 0;
  return career.story.deeAlly && knockdowns < ALLY_BREAKING_KNOCKDOWNS;
};

const storyAfter = (
  career: CareerState,
  outcome: RaceOutcome,
  progress: Progress
): StoryFlags => ({
  ...career.story,
  deeAlly: allyAfter(career, outcome, progress),
  ending: progress.ending ?? career.story.ending,
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
  race.tier === outcome.tier &&
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
    career.cash + bill.prize - bill.repair - bill.fine,
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
    memory: memoryAfter(career, outcome),
    qualified: { ...career.qualified, [race.tier]: progress.roads },
    record: recordAfter(career.record, outcome, bill.prize),
    season: scoreRace(career.season, outcome.placings),
    story: storyAfter(career, outcome, progress),
    tier: progress.tier,
  };
  const ledger: Ledger = {
    ...bill,
    cashAfter: debt.cash,
    cashBefore: career.cash,
    ending: progress.ending,
    gameOver: debt.gameOver,
    line: resultLine(outcome),
    place: outcome.place,
    qualified: progress.newlyQualified,
    qualifiedCount: qualifiedCount(progress.roads),
    repossessed: debt.repossessed,
    result: outcome.result,
    roadId: race.roadId,
    tier: race.tier,
    tierUp: progress.promoted
      ? { bikes: progress.arrivals, tier: progress.tier }
      : null,
  };
  return {
    career: {
      ...settled,
      lastResult: {
        ledger,
        summary: summaryOf(race, outcome, bill.prize),
      },
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

export const resumeCareer = (
  rules: RaceRules,
  save: CareerState
): Settlement => {
  if (!save.activeRace) {
    return refused(save, "noActiveRace");
  }
  const settlement = settleRace(save, abandonedOutcome(rules, save.activeRace));
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
