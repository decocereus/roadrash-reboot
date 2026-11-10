import * as Schema from "effect/Schema";

import type { Replay } from "./pilot-replay.ts";

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

const baselineSchema = Schema.Struct({
  fixed: replaySet,
  provenance: Schema.Struct({
    fixed: Schema.Number,
    limit: Schema.Number,
    recordedAt: Schema.Array(Schema.String),
    recordedWith: Schema.String,
    window: Schema.Struct({ from: Schema.Number, to: Schema.Number }),
  }),
  solo: replaySet,
});

export type Baseline = typeof baselineSchema.Type;

export const decodeBaseline = Schema.decodeUnknownSync(
  Schema.fromJsonString(baselineSchema)
);

export interface Recording {
  readonly fixed: readonly Replay[];
  readonly solo: readonly Replay[];
  readonly fixedRide: number;
  readonly limit: number;
  readonly window: { readonly from: number; readonly to: number };
  readonly reason: string;
  readonly recordedAt: readonly [string, string];
}

const sameRow = (was: Replay, row: Replay): boolean =>
  was.final === row.final &&
  was.full === row.full &&
  was.window === row.window &&
  was.ticks === row.ticks &&
  was.result === row.result;

const movedRows = (
  before: Baseline["solo"],
  after: readonly Replay[],
  set: "fixed" | "solo"
): string[] =>
  after.flatMap((row) => {
    const was = before.find(({ id }) => id === row.id);
    if (was && sameRow(was, row)) {
      return [];
    }
    const outcome =
      set === "solo" && was
        ? `, from ${was.result ?? "no outcome"} at tick ${was.ticks} to ${row.result ?? "no outcome"} at tick ${row.ticks}`
        : "";
    return [`${row.id} (${set}${outcome})`];
  });

export interface Recorded {
  readonly baseline: Baseline;
  readonly rows: string;
}

export const recordBaseline = (
  before: Baseline,
  recording: Recording
): Recorded => {
  const moved = [
    ...movedRows(before.solo, recording.solo, "solo"),
    ...movedRows(before.fixed, recording.fixed, "fixed"),
  ];
  const rows =
    moved.length === 0
      ? "No row moved."
      : `Rows that moved: ${moved.join("; ")}. The other rows are identical.`;
  return {
    baseline: {
      fixed: recording.fixed,
      provenance: {
        fixed: recording.fixedRide,
        limit: recording.limit,
        recordedAt: recording.recordedAt,
        recordedWith: `${before.provenance.recordedWith} Re-recorded again ${recording.reason} ${rows}`,
        window: recording.window,
      },
      solo: recording.solo,
    },
    rows,
  };
};
