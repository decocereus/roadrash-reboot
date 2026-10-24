import path from "node:path";
import { parseArgs } from "node:util";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { readCorridor } from "@racer/track/madrid-corridor";
import type { CorridorData } from "@racer/track/madrid-schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { fitPolyline } from "./src/fit.ts";
import type { Fit, ForcedSpan } from "./src/fit.ts";
import { between, corridorLine } from "./src/geometry.ts";

const root = path.resolve(import.meta.dirname, "../..");
const options = parseArgs({
  options: {
    interval: { default: ["600:1600"], multiple: true, type: "string" },
    "min-radius": {
      default: ["0", "60", "120", "265"],
      multiple: true,
      type: "string",
    },
    out: {
      default: path.join(import.meta.dirname, ".cache/fits.json"),
      type: "string",
    },
  },
}).values;
const PIECE_LENGTH = 25;
const SMOOTHING = 1000;
const FORCED_MARGIN = 1;

interface Stretch {
  readonly name: string;
  readonly fromM: number;
  readonly toM: number;
}

const streetAt = (data: CorridorData, atM: number): string =>
  data.streets.find((street) => atM >= street.startM && atM <= street.endM)
    ?.name ?? "";

const metres = (value: number): string => value.toFixed(1);

const worstBetween = (
  deviation: Float64Array,
  fromM: number,
  toM: number
): number => {
  let worst = 0;
  for (
    let at = Math.max(0, Math.floor(fromM));
    at <= Math.min(deviation.length - 1, Math.ceil(toM));
    at += 1
  ) {
    worst = Math.max(worst, deviation[at] ?? 0);
  }
  return worst;
};

const forcedRows = (
  data: CorridorData,
  stretch: Stretch,
  fit: Fit,
  free: Fit
): string[] =>
  fit.forced
    .filter(
      (span: ForcedSpan) =>
        span.maxErrorM >
        worstBetween(free.deviationM, span.fromM, span.toM) + FORCED_MARGIN
    )
    .map(
      (span) =>
        `| ${(stretch.fromM + span.fromM).toFixed(0)} to ${(stretch.fromM + span.toM).toFixed(0)} m | ${streetAt(data, stretch.fromM + (span.fromM + span.toM) / 2)} | ${metres(span.maxErrorM)} m | ${metres(worstBetween(free.deviationM, span.fromM, span.toM))} m |`
    );

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const data = readCorridor(
    yield* fs.readFileString(
      path.join(root, "packages/track/data/madrid-corridor.json")
    )
  );
  const line = corridorLine(data);
  const stretches: Stretch[] = [
    { fromM: 0, name: "Whole corridor", toM: data.lengthM },
    ...options.interval.map((interval) => {
      const [fromM = 0, toM = data.lengthM] = interval.split(":").map(Number);
      return {
        fromM,
        name: `${(fromM / 1000).toFixed(2)} to ${(toM / 1000).toFixed(2)} km`,
        toM,
      };
    }),
  ];
  const radii = options["min-radius"].map(Number);
  const table = [
    "| Stretch | Radius limit | RMS | 95th percentile | Maximum | Tightest radius | Length (street) |",
    "| --- | --: | --: | --: | --: | --: | --: |",
  ];
  const forced: string[] = [];
  const fits: unknown[] = [];
  for (const stretch of stretches) {
    const polyline =
      stretch.fromM === 0 && stretch.toM === data.lengthM
        ? line
        : between(line, stretch.fromM, stretch.toM);
    const results = radii.map((minRadiusM) => ({
      fit: fitPolyline(polyline, {
        minRadiusM,
        pieceLengthM: PIECE_LENGTH,
        smoothing: SMOOTHING,
      }),
      minRadiusM,
    }));
    const free = results.find(({ minRadiusM }) => minRadiusM === 0)?.fit;
    for (const { fit, minRadiusM } of results) {
      table.push(
        `| ${stretch.name} | ${minRadiusM === 0 ? "none" : `${minRadiusM} m`} | ${metres(fit.error.rmsM)} m | ${metres(fit.error.p95M)} m | ${metres(fit.error.maxM)} m | ${metres(fit.minRadiusM)} m | ${fit.lengthM.toFixed(0)} m (${fit.sourceLengthM.toFixed(0)} m) |`
      );
      if (free && minRadiusM > 0) {
        forced.push(
          `\n${stretch.name} at ${minRadiusM} m: where the limit moved the line more than ${FORCED_MARGIN} m further from the street than the unlimited fit\n`,
          "| Chainage | Street | Error | Unlimited fit |",
          "| --- | --- | --: | --: |"
        );
        const rows = forcedRows(data, stretch, fit, free);
        forced.push(...(rows.length > 0 ? rows : ["| none | | | |"]));
      }
      fits.push({
        error: fit.error,
        forced: fit.forced,
        lengthM: fit.lengthM,
        minRadiusLimitM: minRadiusM,
        pieces: fit.pieces,
        start: fit.start,
        stretch,
        tightestRadiusM: fit.minRadiusM,
      });
    }
  }
  yield* fs.makeDirectory(path.dirname(options.out), { recursive: true });
  yield* fs.writeFileString(options.out, `${JSON.stringify(fits)}\n`);
  console.log([...table, ...forced].join("\n"));
  console.log(`\nPieces: ${options.out}`);
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeFileSystem.layer)));
