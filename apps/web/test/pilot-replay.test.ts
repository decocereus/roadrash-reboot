import { readFileSync } from "node:fs";

import { TICK_SECONDS } from "@racer/sim/state";
import type { RiderInput } from "@racer/sim/state";
import * as Schema from "effect/Schema";
import { beforeAll, describe, expect, it } from "vitest";

import { createControls } from "../src/game/input.ts";
import { createKeyboard } from "./hosts.ts";
import type { Keyboard } from "./hosts.ts";
import {
  close,
  firstDifferentTick,
  FIXED_RIDE,
  openCase,
  replayCases,
  replayMatrix,
  ride,
  rideToEnd,
  TICK_LIMIT,
  WINDOW,
} from "./pilot-replay.ts";
import type { Matrix, Run } from "./pilot-replay.ts";

const MATRIX_TIMEOUT_MS = 900_000;
const RACE_TIMEOUT_MS = 120_000;

const replaySet = Schema.Array(
  Schema.Struct({
    final: Schema.String,
    full: Schema.String,
    id: Schema.String,
    result: Schema.NullOr(Schema.String),
    ticks: Schema.Number,
    window: Schema.String,
  })
);

const decodeBaseline = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      fixed: replaySet,
      provenance: Schema.Struct({
        fixed: Schema.Number,
        limit: Schema.Number,
        window: Schema.Struct({ from: Schema.Number, to: Schema.Number }),
      }),
      solo: replaySet,
    })
  )
);

const baseline = decodeBaseline(
  readFileSync(new URL("pilot-replay-baseline.json", import.meta.url), "utf-8")
);

const slagRow = replayCases.find(({ id }) => id === "slag-row/level5/seed5");

const TRACE_TICKS = 600;

const keyScript: readonly (readonly [number, (keys: Keyboard) => void])[] = [
  [
    0,
    (keys) => {
      keys.press("ArrowUp");
    },
  ],
  [
    90,
    (keys) => {
      keys.press("ArrowRight");
    },
  ],
  [
    130,
    (keys) => {
      keys.release("ArrowRight");
    },
  ],
  [
    180,
    (keys) => {
      keys.press("Space");
    },
  ],
  [
    200,
    (keys) => {
      keys.release("Space");
    },
  ],
  [
    240,
    (keys) => {
      keys.press("KeyA");
    },
  ],
  [
    300,
    (keys) => {
      keys.blur();
    },
  ],
  [
    330,
    (keys) => {
      keys.press("ArrowUp");
    },
  ],
  [
    420,
    (keys) => {
      keys.press("ShiftLeft");
    },
  ],
  [
    430,
    (keys) => {
      keys.release("ShiftLeft");
    },
  ],
  [
    480,
    (keys) => {
      keys.press("ArrowDown");
    },
  ],
];

const recordControls = (recorded: RiderInput[]) => {
  const keys = createKeyboard();
  const controls = createControls((code) => {
    keys.commands.push(code);
  }, keys.host);
  return (run: Run) => {
    for (const [tick, act] of keyScript) {
      if (tick === run.state.tick) {
        act(keys);
      }
    }
    controls.read(TICK_SECONDS, run.controls);
    recorded.push({ ...run.controls });
  };
};

const playBack = (recorded: readonly RiderInput[]) => (run: Run) => {
  const next = recorded[run.state.tick];
  if (next) {
    Object.assign(run.controls, next);
  }
};

describe("pilot replays to every race's outcome", () => {
  let matrix: Matrix;

  beforeAll(() => {
    matrix = replayMatrix(TICK_LIMIT);
  }, MATRIX_TIMEOUT_MS);

  it("replay the recorded baseline's limit and window", () => {
    expect(baseline.provenance).toStrictEqual({
      fixed: FIXED_RIDE,
      limit: TICK_LIMIT,
      window: WINDOW,
    });
  });

  it("ten solo races match their recorded baseline hashes", () => {
    expect(matrix.solo).toStrictEqual(baseline.solo);
  });

  it("ten races stopped at the fixed 7,200 ticks match their own baseline set", () => {
    expect(matrix.fixed).toStrictEqual(baseline.fixed);
  });

  it("each race's fixed ride matches its ride to the outcome on every tick the two share", () => {
    expect(matrix.fixedStart).toStrictEqual(
      replayCases.map(({ id }) => ({ firstDifferentTick: null, id }))
    );
  });

  it("ten solo races each reach a finish, a bust or a wreck", () => {
    expect(matrix.solo.map(({ result }) => result)).not.toContain(null);
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
      const again = rideToEnd(openCase(slagRow), TICK_LIMIT);
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

  it(
    "a controls-driven input trace replays tick for tick in a fresh race",
    () => {
      if (!slagRow) {
        throw new Error("The replay cases have no Slag Row seed 5 race.");
      }
      const recorded: RiderInput[] = [];
      const original = ride(
        openCase(slagRow, "human"),
        TRACE_TICKS,
        recordControls(recorded)
      );
      const replayed = ride(
        openCase(slagRow, "human"),
        TRACE_TICKS,
        playBack(recorded)
      );
      expect(recorded).toHaveLength(TRACE_TICKS);
      expect(new Set(recorded.map(({ steer }) => steer)).size).toBeGreaterThan(
        3
      );
      expect(replayed.frames).toStrictEqual(original.frames);
      expect(close(replayed)).toStrictEqual(close(original));
    },
    RACE_TIMEOUT_MS
  );

  it("each race restored from a snapshot into a fresh state every 600 ticks matches its solo run on every tick", () => {
    expect(matrix.restored).toStrictEqual(
      replayCases.map(({ id }) => ({ firstDifferentTick: null, id }))
    );
  });

  it("keep every rider's motion finite and every rider in a known mode", () => {
    expect(matrix.problems).toStrictEqual([]);
  });
});
