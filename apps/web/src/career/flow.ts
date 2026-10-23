import { practiceSetup, setupFor } from "@racer/career/field";
import { resultLine } from "@racer/career/lines";
import type { RivalLine } from "@racer/career/lines";
import type { RaceOutcome, RaceResult } from "@racer/career/outcome";
import { summaryOf } from "@racer/career/result";
import type { LastResult, RaceSummary } from "@racer/career/result";
import type { Ledger } from "@racer/career/settle";
import { nextRaceSeed } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { STARTING_BIKE } from "@racer/career/tables";
import type { Level, RoadId } from "@racer/career/tables";
import type { BikeId } from "@racer/sim/bikes";
import { trackFor } from "@racer/track/roads";

import type { RaceMode, RacePlan } from "../game/hud.ts";

export interface RaceEntry {
  readonly mode: RaceMode;
  readonly roadId: RoadId;
  readonly level: Level;
  readonly bikeId: BikeId;
  readonly seed: number;
}

export interface QuickPick {
  readonly roadId: RoadId;
  readonly level: Level;
  readonly bikeId: BikeId;
}

export const firstQuickPick: QuickPick = {
  bikeId: STARTING_BIKE,
  level: 1,
  roadId: "ridge-road",
};

export interface RaceReport {
  readonly mode: RaceMode;
  readonly roadId: RoadId;
  readonly level: Level;
  readonly result: RaceResult;
  readonly place: number;
  readonly summary: RaceSummary;
  readonly ledger: Ledger | null;
  readonly line: RivalLine | null;
}

export const careerEntry = (
  career: CareerState,
  roadId: RoadId
): RaceEntry => ({
  bikeId: career.bikeId,
  level: career.level,
  mode: "career",
  roadId,
  seed: nextRaceSeed(career),
});

export const quickEntry = (pick: QuickPick, seed: number): RaceEntry => ({
  ...pick,
  mode: "quick",
  seed,
});

export const planFor = (
  career: CareerState | null,
  entry: RaceEntry
): RacePlan => {
  const track = trackFor(entry.roadId, entry.level);
  return entry.mode === "career" && career
    ? {
        bikeId: career.bikeId,
        mode: entry.mode,
        setup: setupFor(career, entry.roadId, entry.seed, track),
      }
    : {
        bikeId: entry.bikeId,
        mode: entry.mode,
        setup: practiceSetup(entry, track),
      };
};

export const careerReport = (last: LastResult): RaceReport => ({
  ledger: last.ledger,
  level: last.ledger.level,
  line: last.ledger.line,
  mode: "career",
  place: last.ledger.place,
  result: last.ledger.result,
  roadId: last.ledger.roadId,
  summary: last.summary,
});

export const quickReport = (
  plan: RacePlan,
  outcome: RaceOutcome
): RaceReport => ({
  ledger: null,
  level: outcome.level,
  line: resultLine(outcome),
  mode: "quick",
  place: outcome.place,
  result: outcome.result,
  roadId: outcome.roadId,
  summary: summaryOf(
    {
      bikeId: plan.bikeId,
      level: outcome.level,
      raceId: outcome.raceId,
      roadId: outcome.roadId,
      seed: outcome.seed,
      started: true,
    },
    outcome,
    0
  ),
});
