import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { BenchBusy } from "./bench-busy.ts";
import { claimHolder, dropClaim, takeClaim, toolStateDir } from "./claim.ts";
import { released } from "./cleanup.ts";
import { alive } from "./process.ts";

const BENCH_PID = "RUSHLINE_BENCH_PID";

const fileIn = (dir: string): string => path.join(dir, "bench.lock");

const insideBench = (pid: number): boolean =>
  process.env[BENCH_PID] === String(pid);

export const benchChildEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  [BENCH_PID]: process.env[BENCH_PID] ?? String(process.pid),
});

const decodeSlot = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      browserPid: Schema.NullOr(Schema.Number),
      checkout: Schema.String,
      run: Schema.String,
      upPid: Schema.Number,
    })
  )
);

const liveRunsBesides = Effect.fnUntraced(function* liveRunsBesides(
  allowed: readonly string[],
  dir: string
) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(dir);
  const texts = yield* Effect.all(
    names
      .filter((name) => /^slot-\d+\.json$/u.test(name))
      .map((name) => fs.readFileString(path.join(dir, name))),
    { concurrency: "unbounded" }
  );
  return texts.flatMap((text) => {
    const slot = Option.getOrNull(decodeSlot(text));
    return slot !== null &&
      (alive(slot.browserPid) || alive(slot.upPid)) &&
      !allowed.includes(slot.run)
      ? [`${slot.run} from ${slot.checkout}`]
      : [];
  });
});

const claimed = Effect.fnUntraced(function* claimed(
  file: string,
  label: string
) {
  const outcome = yield* takeClaim(file, label);
  if (outcome.kind === "held") {
    yield* new BenchBusy({
      message: `Another bench is using this GPU: pid ${outcome.holder.pid}, ${outcome.holder.label}. Two benches on one GPU skew each other, so wait for it. Claim: ${file}`,
    });
  }
});

export const holdBench = Effect.fnUntraced(function* holdBench(
  label: string,
  allowedRuns: readonly string[] = [],
  dir: string = toolStateDir
) {
  const file = fileIn(dir);
  const holder = yield* claimHolder(file);
  if (holder === null || !insideBench(holder.pid)) {
    yield* Effect.acquireRelease(claimed(file, label), () =>
      released(dropClaim(file))
    );
  }
  const others = yield* liveRunsBesides(allowedRuns, dir);
  if (others.length > 0) {
    yield* new BenchBusy({
      message: `A browser from another rv run is open or starting on this machine and would skew the bench: ${others.join(", ")}. If the run is yours, rv down --run <id>. If not, wait for it.`,
    });
  }
});

export const refuseDuringBench = Effect.fnUntraced(function* refuseDuringBench(
  command: string,
  dir: string = toolStateDir
) {
  const holder = yield* claimHolder(fileIn(dir));
  if (holder !== null && !insideBench(holder.pid)) {
    yield* new BenchBusy({
      message: `rv ${command} would draw on the GPU while a bench is measuring it: pid ${holder.pid}, ${holder.label}. Wait for it. rv list, rv shot and rv down still work.`,
    });
  }
});
