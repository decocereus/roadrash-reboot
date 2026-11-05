import type { Tier } from "@racer/sim/difficulty";
import { crashCauses } from "@racer/sim/state";
import type { CrashCause } from "@racer/sim/state";

import type { RaceResult } from "./race.ts";
import type { DistrictCounts, RoadWindow } from "./tally.ts";

const TICKS_PER_SECOND = 60;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const median = (values: readonly number[]): number | null =>
  values.toSorted((one, other) => one - other)[Math.floor(values.length / 2)] ??
  null;

const present = (values: readonly (number | null)[]): readonly number[] =>
  values.filter((value) => value !== null);

const share = (part: number, whole: number): number =>
  whole > 0 ? (100 * part) / whole : 0;

const addCounts = (
  rows: readonly DistrictCounts[],
  name: keyof DistrictCounts
): number => sum(rows.map((row) => row[name]));

const seedRow = (result: RaceResult) => ({
  carOverlaps: result.counts.carOverlaps,
  crashes: result.crashes,
  finished: result.finishes.length,
  medianFinish: median(result.finishes),
  offRoadPct: share(result.counts.offRoadTicks, result.counts.liveTicks),
  riders: result.riders,
  seed: result.seed,
  spread: (result.finishes.at(-1) ?? 0) - (result.finishes[0] ?? 0),
  stuckPct: share(result.counts.stuckTicks, result.counts.liveTicks),
});

const districtRow = (
  window: RoadWindow,
  index: number,
  results: readonly RaceResult[]
) => {
  const rows = results.flatMap((result) => {
    const row = result.counts.districts[index];
    return row ? [row] : [];
  });
  const raceKilometres = results.length * ((window.to - window.from) / 1000);
  const perKm = (name: keyof DistrictCounts) =>
    addCounts(rows, name) / raceKilometres;
  const secondsPerKm = (name: keyof DistrictCounts) =>
    addCounts(rows, name) / TICKS_PER_SECOND / raceKilometres;
  return {
    attacksPerKm: perKm("attacks"),
    boxedSecsPerKm: secondsPerKm("boxedTicks"),
    combatCrashesPerKm: perKm("combatCrashes"),
    contactPasses: addCounts(rows, "contactPasses"),
    district: index + 1,
    from: window.from,
    heldSecsPerKm: secondsPerKm("heldTicks"),
    hitsPerKm: perKm("hits"),
    passesPerKm: perKm("passes"),
    reachSecsPerKm: secondsPerKm("reachTicks"),
    stuckPct: share(
      addCounts(rows, "stuckTicks"),
      addCounts(rows, "liveTicks")
    ),
    stuckSecsPerKm: secondsPerKm("stuckTicks"),
    to: window.to,
  };
};

const causesOf = (results: readonly RaceResult[]) =>
  Object.fromEntries(
    crashCauses.map((cause: CrashCause) => [
      cause,
      sum(results.map((result) => result.counts.causes[cause])),
    ])
  );

const lanesOf = (results: readonly RaceResult[]) => {
  const open = [
    ...new Set(results.flatMap((result) => [...result.counts.lanes.keys()])),
  ].toSorted((one, other) => one - other);
  return Object.fromEntries(
    open.map((lanes) => {
      const counts = results.flatMap((result) => {
        const row = result.counts.lanes.get(lanes);
        return row ? [row] : [];
      });
      return [
        lanes,
        share(
          sum(counts.map((row) => row.stuckTicks)),
          sum(counts.map((row) => row.liveTicks))
        ),
      ];
    })
  );
};

export const summarize = (
  tier: Tier,
  windows: readonly RoadWindow[],
  results: readonly RaceResult[]
) => {
  const seeds = results.map(seedRow);
  const rows = results.flatMap((result) => result.counts.districts);
  const races = results.length;
  const perRace = (name: keyof DistrictCounts) =>
    addCounts(rows, name) / TICKS_PER_SECOND / races;
  const [worst] = seeds.toSorted((one, other) => other.stuckPct - one.stuckPct);
  const carOverlaps = sum(seeds.map((seed) => seed.carOverlaps));
  return {
    districts: windows.map((window, index) =>
      districtRow(window, index, results)
    ),
    overall: {
      attacks: addCounts(rows, "attacks"),
      boxedSecsPerRace: perRace("boxedTicks"),
      carOverlaps,
      carOverlapsPerRace: carOverlaps / races,
      combatCrashes: addCounts(rows, "combatCrashes"),
      contactPasses: addCounts(rows, "contactPasses"),
      crashes: sum(seeds.map((seed) => seed.crashes)),
      crashesByCause: causesOf(results),
      finished: sum(seeds.map((seed) => seed.finished)),
      firstToLast: median(seeds.map((seed) => seed.spread)),
      heldSecsPerRace: perRace("heldTicks"),
      hits: addCounts(rows, "hits"),
      medianFinish: median(present(seeds.map((seed) => seed.medianFinish))),
      offRoadPct: median(seeds.map((seed) => seed.offRoadPct)),
      passes: addCounts(rows, "passes"),
      reachSecsPerRace: perRace("reachTicks"),
      riders: sum(seeds.map((seed) => seed.riders)),
      stuckByOpenLanes: lanesOf(results),
      stuckMeanPct: sum(seeds.map((seed) => seed.stuckPct)) / races,
      stuckWorstPct: worst?.stuckPct ?? 0,
      stuckWorstSeed: worst?.seed ?? null,
    },
    seeds,
    tier,
  };
};

export type TierReport = ReturnType<typeof summarize>;

const fixed = (value: number, digits = 1): string => value.toFixed(digits);

const pad = (text: string | number, width: number): string =>
  String(text).padStart(width);

const secondsOf = (value: number | null): string =>
  value === null ? "none" : `${fixed(value, 0)} s`;

const pairsOf = (table: Readonly<Record<string, string>>) =>
  Object.entries(table)
    .map(([name, value]) => `${name} ${value}`)
    .join(", ");

const percents = (table: Readonly<Record<string, number>>) =>
  Object.fromEntries(
    Object.entries(table).map(([name, value]) => [name, `${fixed(value)}%`])
  );

const whole = (table: Readonly<Record<string, number>>) =>
  Object.fromEntries(
    Object.entries(table).map(([name, value]) => [name, fixed(value, 0)])
  );

const districtHeader = [
  "dist",
  pad("from", 6),
  pad("to", 6),
  pad("pass", 6),
  pad("atk", 6),
  pad("hit", 6),
  pad("ccr", 6),
  pad("reach", 6),
  pad("held", 6),
  pad("box", 6),
  pad("stuck", 6),
  pad("stuck%", 6),
].join(" ");

const districtLine = (row: TierReport["districts"][number]): string =>
  [
    pad(row.district, 4),
    pad(fixed(row.from, 0), 6),
    pad(fixed(row.to, 0), 6),
    pad(fixed(row.passesPerKm), 6),
    pad(fixed(row.attacksPerKm), 6),
    pad(fixed(row.hitsPerKm), 6),
    pad(fixed(row.combatCrashesPerKm, 2), 6),
    pad(fixed(row.reachSecsPerKm), 6),
    pad(fixed(row.heldSecsPerKm), 6),
    pad(fixed(row.boxedSecsPerKm), 6),
    pad(fixed(row.stuckSecsPerKm), 6),
    pad(fixed(row.stuckPct), 6),
  ].join(" ");

export const tierLines = (
  { districts, overall, tier }: TierReport,
  seconds: number
): readonly string[] => [
  "",
  `Tier ${tier} (ran in ${fixed(seconds, 0)} s)`,
  `  finished ${overall.finished}/${overall.riders}, median finish ${secondsOf(overall.medianFinish)}, first to last ${secondsOf(overall.firstToLast)}`,
  `  stuck mean ${fixed(overall.stuckMeanPct)}%, worst ${fixed(overall.stuckWorstPct)}% on seed ${overall.stuckWorstSeed}, by open lanes: ${pairsOf(percents(overall.stuckByOpenLanes))}`,
  `  crashes ${overall.crashes}: ${pairsOf(whole(overall.crashesByCause))}`,
  `  off-road ${fixed(overall.offRoadPct ?? 0, 2)}%, passes ${overall.passes}, contact passes ${overall.contactPasses}, attacks ${overall.attacks}, hits ${overall.hits}, combat crashes ${overall.combatCrashes}`,
  `  per race: reach ${fixed(overall.reachSecsPerRace)} s, held ${fixed(overall.heldSecsPerRace)} s, boxed ${fixed(overall.boxedSecsPerRace)} s, car overlaps ${fixed(overall.carOverlapsPerRace)} (${overall.carOverlaps} in all)`,
  "  Per kilometre, per race. reach, held, box and stuck are seconds. stuck% is a share of live rider ticks.",
  `  ${districtHeader}`,
  ...districts.map((row) => `  ${districtLine(row)}`),
];
