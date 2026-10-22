import { readFileSync } from "node:fs";

import * as Schema from "effect/Schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  close,
  firstDifferentTick,
  openCase,
  replayCases,
  replayMatrix,
  ride,
  TICKS,
  WINDOW,
} from "./pilot-replay.ts";
import type { Matrix } from "./pilot-replay.ts";

const MATRIX_TIMEOUT_MS = 900_000;
const RACE_TIMEOUT_MS = 120_000;

const decodeBaseline = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      provenance: Schema.Struct({
        ticks: Schema.Number,
        window: Schema.Struct({ from: Schema.Number, to: Schema.Number }),
      }),
      solo: Schema.Array(
        Schema.Struct({
          final: Schema.String,
          full: Schema.String,
          id: Schema.String,
          ticks: Schema.Number,
          window: Schema.String,
        })
      ),
    })
  )
);

const baseline = decodeBaseline(
  readFileSync(new URL("pilot-replay-baseline.json", import.meta.url), "utf-8")
);

const slagRow = replayCases.find(({ id }) => id === "slag-row/level5/seed5");

describe("pilot replays over 7,200 ticks", () => {
  let matrix: Matrix;

  beforeAll(() => {
    matrix = replayMatrix(TICKS);
  }, MATRIX_TIMEOUT_MS);

  it("replay the step 3 baseline's ticks and window", () => {
    expect(baseline.provenance).toStrictEqual({ ticks: TICKS, window: WINDOW });
  });

  it("nine solo races match their step 3 baseline hashes", () => {
    expect(matrix.solo).toStrictEqual(baseline.solo);
  });

  it("each race run beside the other eight matches its solo run on every tick", () => {
    expect(matrix.divergences).toStrictEqual(
      replayCases.map(({ id }) => ({ firstDifferentTick: null, id }))
    );
    expect(matrix.interleaved).toStrictEqual(matrix.solo);
  });

  it(
    "a second Slag Row race with the same setup in the same process matches its solo run",
    () => {
      if (!slagRow) {
        throw new Error("The replay cases have no Slag Row seed 5 race.");
      }
      const again = ride(openCase(slagRow), TICKS);
      expect(
        firstDifferentTick(
          again.frames,
          matrix.soloFrames.get(slagRow.id) ?? []
        )
      ).toBeNull();
      expect(close(again)).toStrictEqual(
        matrix.solo.find(({ id }) => id === slagRow.id)
      );
    },
    RACE_TIMEOUT_MS
  );

  it("keep every rider's motion finite and every rider in a known mode", () => {
    expect(matrix.problems).toStrictEqual([]);
  });
});
