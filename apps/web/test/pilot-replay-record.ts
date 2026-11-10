import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import * as Schema from "effect/Schema";

import {
  close,
  FIXED_RIDE,
  openCase,
  replayCases,
  ride,
  rideToEnd,
  TICK_LIMIT,
  WINDOW,
} from "./pilot-replay.ts";
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

type Recorded = typeof baselineSchema.Type;

const decodeBaseline = Schema.decodeUnknownSync(
  Schema.fromJsonString(baselineSchema)
);

const baselineUrl = new URL("pilot-replay-baseline.json", import.meta.url);

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf-8" }).trim();

const movedRows = (
  before: Recorded["solo"],
  after: readonly Replay[],
  set: string
): string[] =>
  after.flatMap((row) => {
    const was = before.find(({ id }) => id === row.id);
    if (
      was &&
      was.final === row.final &&
      was.full === row.full &&
      was.window === row.window &&
      was.ticks === row.ticks &&
      was.result === row.result
    ) {
      return [];
    }
    const outcome =
      set === "solo" && was
        ? `, from ${was.result ?? "no outcome"} at tick ${was.ticks} to ${row.result ?? "no outcome"} at tick ${row.ticks}`
        : "";
    return [`${row.id} (${set}${outcome})`];
  });

const record = (reason: string): void => {
  const before = decodeBaseline(readFileSync(baselineUrl, "utf-8"));
  const fixed = replayCases.map((replay) =>
    close(ride(openCase(replay), FIXED_RIDE))
  );
  const solo = replayCases.map((replay) =>
    close(rideToEnd(openCase(replay), TICK_LIMIT))
  );
  const moved = [
    ...movedRows(before.solo, solo, "solo"),
    ...movedRows(before.fixed, fixed, "fixed"),
  ];
  const rows =
    moved.length === 0
      ? "No row moved."
      : `Rows that moved: ${moved.join("; ")}. The other rows are identical.`;
  const recordedWith = `${before.provenance.recordedWith} Re-recorded again ${reason} ${rows}`;
  const baseline = {
    fixed,
    provenance: {
      fixed: FIXED_RIDE,
      limit: TICK_LIMIT,
      recordedAt: [
        git("rev-parse", "--short", "HEAD"),
        git("branch", "--show-current"),
      ],
      recordedWith,
      window: WINDOW,
    },
    solo,
  };
  writeFileSync(baselineUrl, `${JSON.stringify(baseline, null, 2)}\n`);
  process.stdout.write(`${rows}\n`);
};

const reason = process.argv.slice(2).join(" ");
if (reason.length === 0) {
  process.stderr.write(
    'Usage: pnpm replay:record "when <what changed and why the hashes moved>."\n'
  );
  process.exit(1);
}
record(reason);
