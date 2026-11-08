import { practiceSetup, setupFor } from "@racer/career/field";
import { resultLine } from "@racer/career/lines";
import type { RivalLine } from "@racer/career/lines";
import type { RaceOutcome, RaceResult } from "@racer/career/outcome";
import { summaryOf } from "@racer/career/result";
import type { LastResult, RaceSummary } from "@racer/career/result";
import type { RaceRules } from "@racer/career/rules";
import type { Ledger } from "@racer/career/settle";
import { nextRaceSeed } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { STARTING_BIKE } from "@racer/career/tables";
import type { Tier, RoadId } from "@racer/career/tables";
import type { RoomReport } from "@racer/rooms/room-run";
import type { BikeId } from "@racer/sim/bikes";
import { trackFor } from "@racer/track/roads";

import type { RaceMode, RacePlan } from "../game/hud.ts";

export interface RaceEntry {
  readonly mode: RaceMode;
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly bikeId: BikeId;
  readonly seed: number;
}

export interface QuickPick {
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly bikeId: BikeId;
}

export const firstQuickPick: QuickPick = {
  bikeId: STARTING_BIKE,
  roadId: "ridge-road",
  tier: 1,
};

export const pickWithin = (
  pick: QuickPick,
  career: CareerState | null
): QuickPick => {
  const reach = career?.tier ?? 1;
  return {
    bikeId:
      career === null || career.garage.includes(pick.bikeId)
        ? pick.bikeId
        : career.bikeId,
    roadId: pick.roadId,
    tier: pick.tier <= reach ? pick.tier : reach,
  };
};

export interface RaceReport {
  readonly mode: RaceMode;
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly result: RaceResult;
  readonly place: number;
  readonly summary: RaceSummary;
  readonly ledger: Ledger | null;
  readonly line: RivalLine | null;
  readonly room?: RoomReport;
}

export const careerEntry = (
  career: CareerState,
  roadId: RoadId
): RaceEntry => ({
  bikeId: career.bikeId,
  mode: "career",
  roadId,
  seed: nextRaceSeed(career),
  tier: career.tier,
});

export const quickEntry = (pick: QuickPick, seed: number): RaceEntry => ({
  ...pick,
  mode: "quick",
  seed,
});

export const planFor = (
  rules: RaceRules,
  career: CareerState | null,
  entry: RaceEntry
): RacePlan => {
  const track = trackFor(entry.roadId);
  return entry.mode === "career" && career
    ? {
        bikeId: career.bikeId,
        mode: entry.mode,
        rules,
        setup: setupFor(rules, career, entry.roadId, entry.seed, track),
      }
    : {
        bikeId: entry.bikeId,
        mode: entry.mode,
        rules,
        setup: practiceSetup(rules, entry, track),
      };
};

export const careerReport = (last: LastResult): RaceReport => ({
  ledger: last.ledger,
  line: last.ledger.line,
  mode: "career",
  place: last.ledger.place,
  result: last.ledger.result,
  roadId: last.ledger.roadId,
  summary: last.summary,
  tier: last.ledger.tier,
});

export const quickReport = (
  plan: RacePlan,
  outcome: RaceOutcome
): RaceReport => ({
  ledger: null,
  line: plan.room ? null : resultLine(outcome),
  mode: "quick",
  place: outcome.place,
  result: outcome.result,
  roadId: outcome.roadId,
  tier: outcome.tier,
  ...(plan.room && { room: plan.room.report() }),
  summary: summaryOf(
    {
      bikeId: plan.bikeId,
      raceId: outcome.raceId,
      roadId: outcome.roadId,
      seed: outcome.seed,
      started: true,
      tier: outcome.tier,
    },
    outcome,
    0
  ),
});
