import type { BikeId } from "@racer/sim/bikes";
import { bikeAt, officers, rivals } from "@racer/sim/cast";
import type { OfficerId } from "@racer/sim/cast";
import { defaultPlayer } from "@racer/sim/race";
import type { WeaponKind } from "@racer/sim/state";

import { bustedLine } from "./lines.ts";
import type { Placing, RaceOutcome, RivalIncidents } from "./outcome.ts";
import type { Ledger } from "./settle.ts";
import type { ActiveRace } from "./state.ts";
import { prizeFor } from "./tables.ts";

export interface ResultRow extends Placing {
  readonly name: string;
  readonly bikeId: BikeId;
  readonly prize: number;
}

export interface BustDetails {
  readonly officer: OfficerId;
  readonly officerName: string;
  readonly line: string;
  readonly km: number;
  readonly weapon: WeaponKind;
  readonly fine: number;
}

interface WreckDetails {
  readonly bikeId: BikeId;
  readonly km: number;
}

export interface RaceSummary {
  readonly raceId: number;
  readonly tick: number;
  readonly rows: readonly ResultRow[];
  readonly incidents: readonly RivalIncidents[];
  readonly bust: BustDetails | null;
  readonly wreck: WreckDetails | null;
}

export interface LastResult {
  readonly summary: RaceSummary;
  readonly ledger: Ledger;
}

const rowOf = (
  race: ActiveRace,
  placing: Placing,
  playerPrize: number
): ResultRow => {
  if (placing.racer === "player") {
    return {
      ...placing,
      bikeId: race.bikeId,
      name: defaultPlayer.name,
      prize: playerPrize,
    };
  }
  const rival = rivals[placing.racer];
  const out = placing.fate === "busted" || placing.fate === "wrecked";
  return {
    ...placing,
    bikeId: bikeAt(rival, race.level),
    name: rival.name,
    prize: out ? 0 : prizeFor(race.level, placing.place),
  };
};

const bustOf = (outcome: RaceOutcome): BustDetails | null =>
  outcome.arrest
    ? {
        fine: outcome.arrest.fine,
        km: outcome.arrest.km,
        line: bustedLine(outcome.arrest.officer, outcome.seed),
        officer: outcome.arrest.officer,
        officerName: officers[outcome.arrest.officer].profile.name,
        weapon: outcome.arrest.weapon,
      }
    : null;

export const summaryOf = (
  race: ActiveRace,
  outcome: RaceOutcome,
  playerPrize: number
): RaceSummary => ({
  bust: bustOf(outcome),
  incidents: outcome.incidents,
  raceId: race.raceId,
  rows: outcome.placings.map((placing) => rowOf(race, placing, playerPrize)),
  tick: outcome.tick,
  wreck:
    outcome.result === "wrecked" || outcome.result === "quit"
      ? { bikeId: race.bikeId, km: outcome.km }
      : null,
});
