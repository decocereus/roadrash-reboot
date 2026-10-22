import path from "node:path";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  candidatesOf,
  observeRace,
  scenarioHash,
  scenarios,
  SEARCH_TICKS,
  WINDOW_TICKS,
  workloadDigestOf,
} from "./scenarios.ts";
import type { Candidate, Scenario, WorkloadRows } from "./scenarios.ts";

const slice = (rows: WorkloadRows, from: number): WorkloadRows => {
  const start = rows.ticks.indexOf(from);
  const end = start + WINDOW_TICKS;
  return {
    ahead: rows.ahead.slice(start, end),
    modes: rows.modes.slice(start, end),
    speeds: rows.speeds.slice(start, end),
    ticks: rows.ticks.slice(start, end),
  };
};

interface Selection {
  readonly scenario: Scenario["id"];
  readonly scenarioHash: string;
  readonly racers: number;
  readonly police: number;
  readonly observedTicks: number;
  readonly candidates: readonly Candidate[];
  readonly chosen: Candidate | null;
  readonly rows: WorkloadRows | null;
  readonly workloadDigest: string | null;
  readonly matchesRegistry: boolean;
}

const selectFor = (scenario: Scenario): Selection => {
  const observed = observeRace(scenario.bench, SEARCH_TICKS);
  const candidates = candidatesOf(observed.rows, scenario.floor);
  const [chosen = null] = candidates;
  const rows = chosen ? slice(observed.rows, chosen.from) : null;
  const workloadDigest = rows ? workloadDigestOf(rows) : null;
  return {
    candidates,
    chosen,
    matchesRegistry:
      chosen !== null &&
      observed.racers === scenario.racers &&
      observed.police === scenario.police &&
      chosen.from === scenario.window.from &&
      chosen.to === scenario.window.to &&
      chosen.min === scenario.band.min &&
      chosen.max === scenario.band.max &&
      chosen.total === scenario.band.total &&
      chosen.minSpeed === scenario.minSpeed &&
      workloadDigest === scenario.workloadDigest,
    observedTicks: observed.rows.ticks.length,
    police: observed.police,
    racers: observed.racers,
    rows,
    scenario: scenario.id,
    scenarioHash: scenarioHash(scenario),
    workloadDigest,
  };
};

const selectionLine = (selection: Selection): string => {
  const { chosen } = selection;
  if (!chosen) {
    return `FAIL select ${selection.scenario} no eligible ${WINDOW_TICKS}-tick window in ${selection.observedTicks} ticks`;
  }
  const status = selection.matchesRegistry ? "ok  " : "FAIL";
  const note = selection.matchesRegistry ? "" : " (differs from the registry)";
  return `${status} select ${selection.scenario} from=${chosen.from} to=${chosen.to} ahead=${chosen.min}..${chosen.max} total=${chosen.total} minSpeed=${chosen.minSpeed} racers=${selection.racers} police=${selection.police} digest=${selection.workloadDigest ?? ""} candidates=${selection.candidates.length} scenario=${selection.scenarioHash.slice(0, 12)}${note}`;
};

export const selectWindows = Effect.fn("gate.select")(function* selectWindows(
  out: string
) {
  const fs = yield* FileSystem.FileSystem;
  const selections = scenarios.map(selectFor);
  const dir = path.join(out, `selection-${yield* Clock.currentTimeMillis}`);
  yield* fs.makeDirectory(dir, { recursive: true });
  const file = path.join(dir, "selection.json");
  yield* fs.writeFileString(file, JSON.stringify({ selections }, null, 1));
  return {
    code: selections.every((selection) => selection.matchesRegistry) ? 0 : 1,
    lines: [
      "MEASUREMENT ONLY: window selection",
      ...selections.map(selectionLine),
      `evidence ${file}`,
    ],
  };
});
