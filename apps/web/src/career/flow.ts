import { pickWithin, practiceSetup, setupFor } from "@racer/career/field";
import type { PracticePick } from "@racer/career/field";
import { resultLine } from "@racer/career/lines";
import type { RivalLine } from "@racer/career/lines";
import type { RaceOutcome, RaceResult } from "@racer/career/outcome";
import { summaryOf } from "@racer/career/result";
import type { RaceSummary } from "@racer/career/result";
import type { RaceRules } from "@racer/career/rules";
import type { Ledger, Settlement } from "@racer/career/settle";
import { nextRaceSeed } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { STARTING_BIKE } from "@racer/career/tables";
import type { Tier, RoadId } from "@racer/career/tables";
import type { RoomReport } from "@racer/rooms/room-run";
import type { BikeId } from "@racer/sim/bikes";
import { trackFor } from "@racer/track/roads";

import type { RaceMode, RacePlan } from "../game/hud.ts";
import type { SaveStorage } from "./save-storage.ts";
import { storedSave } from "./save.ts";
import type { ReadySave } from "./save.ts";

export interface RaceEntry {
  readonly mode: RaceMode;
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly bikeId: BikeId;
  readonly seed: number;
}

export const firstQuickPick: PracticePick = {
  bikeId: STARTING_BIKE,
  roadId: "ridge-road",
  tier: 1,
};

export interface RaceReport {
  readonly mode: RaceMode;
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly result: RaceResult;
  readonly place: number;
  readonly summary: RaceSummary;
  readonly ledger: Ledger | null;
  readonly unsaved: boolean;
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

export const quickEntry = (pick: PracticePick, seed: number): RaceEntry => ({
  ...pick,
  mode: "quick",
  seed,
});

export const rideEntry = (
  mode: RaceMode,
  roadId: RoadId,
  career: CareerState | null,
  pick: PracticePick,
  seed: number
): RaceEntry =>
  mode === "career" && career
    ? careerEntry(career, roadId)
    : quickEntry(pickWithin({ ...pick, roadId }, career), seed);

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

export const settledRace = (
  open: () => SaveStorage,
  settlement: Settlement
): { readonly save: ReadySave; readonly report: RaceReport } | null => {
  const last = settlement.career.lastResult;
  if (!(settlement.settled && last)) {
    return null;
  }
  const save = storedSave(open, settlement.career);
  return {
    report: {
      ledger: last.ledger,
      line: last.ledger.line,
      mode: "career",
      place: last.ledger.place,
      result: last.ledger.result,
      roadId: last.ledger.roadId,
      summary: last.summary,
      tier: last.ledger.tier,
      unsaved: save.unsaved,
    },
    save,
  };
};

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
  unsaved: false,
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
