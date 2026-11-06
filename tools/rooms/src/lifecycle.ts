import path from "node:path";
import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";

import { CHECKS, configOf, GUARD_OFFS, GUARDS } from "./lifecycle-checks.ts";
import type { CheckName, Guard, Rule } from "./lifecycle-checks.ts";
import {
  exitOf,
  LifecycleToolFailed,
  outcomeOf,
  pinnedTools,
} from "./lifecycle-tlc.ts";
import type { Outcome } from "./lifecycle-tlc.ts";
import { traceOf, traceText } from "./lifecycle-trace.ts";

const usage = `Usage: pnpm rooms:lifecycle [--only <${[...Object.keys(CHECKS), ...GUARDS].join("|")}>]`;

const SPEC = path.join(import.meta.dirname, "../spec/RoomLifecycle.tla");

type Run =
  | { readonly kind: "check"; readonly name: CheckName }
  | { readonly guard: Guard; readonly kind: "guardOff" };

const CHECK_NAMES = Object.keys(CHECKS).filter(
  (name): name is CheckName => name in CHECKS
);

const ALL_RUNS: readonly Run[] = [
  ...CHECK_NAMES.map((name): Run => ({ kind: "check", name })),
  ...GUARDS.map((guard): Run => ({ guard, kind: "guardOff" })),
];

const nameOf = (run: Run): string =>
  run.kind === "check" ? run.name : run.guard;

const options = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({ args: [...args], options: { only: { type: "string" } } })
        .values,
  });

const configFor = (run: Run): string => {
  if (run.kind === "check") {
    const { bounds, rules } = CHECKS[run.name];
    return configOf(bounds, rules, null);
  }
  const { breaks, on } = GUARD_OFFS[run.guard];
  return configOf(CHECKS[on].bounds, [breaks], run.guard);
};

const brokeAsExpected = (outcome: Outcome, rule: Rule): boolean =>
  outcome.kind === "broken" &&
  (outcome.rule === rule ||
    (outcome.rule === "liveness" && rule === "NeverStuck"));

const verdictOf = (
  run: Run,
  outcome: Outcome,
  output: string
): { readonly line: string; readonly ok: boolean } => {
  if (run.kind === "check") {
    return outcome.kind === "passed"
      ? {
          line: `${outcome.distinct.toLocaleString("en")} states, depth ${outcome.depth}`,
          ok: true,
        }
      : {
          line: `expected every rule to hold, got ${JSON.stringify(outcome)}\n${traceText(output)}`,
          ok: false,
        };
  }
  const { breaks } = GUARD_OFFS[run.guard];
  return brokeAsExpected(outcome, breaks)
    ? { line: `breaks ${breaks} in ${traceOf(output).length} states`, ok: true }
    : {
        line: `expected ${breaks} to break, got ${JSON.stringify(outcome)}`,
        ok: false,
      };
};

const describeRun = (run: Run): string =>
  run.kind === "check"
    ? `${run.name}: ${CHECKS[run.name].says}`
    : `${run.guard} off, on the ${GUARD_OFFS[run.guard].on} bounds`;

export const main = Effect.fn("rooms.lifecycle")(function* main(
  args: readonly string[]
) {
  const { only } = yield* options(args);
  const runs = ALL_RUNS.filter(
    (run) => only === undefined || nameOf(run) === only
  );
  if (runs.length === 0) {
    return yield* new UsageError({ message: usage });
  }
  const { jar, java } = yield* pinnedTools();
  const fs = yield* FileSystem.FileSystem;
  const work = yield* fs.makeTempDirectoryScoped({
    prefix: "rushline-lifecycle-",
  });
  yield* fs.makeDirectory(path.join(work, "tmp"));
  yield* fs.copyFile(SPEC, path.join(work, path.basename(SPEC)));
  const failures: string[] = [];
  const startedAt = performance.now();
  for (const run of runs) {
    const name = nameOf(run);
    yield* fs.writeFileString(path.join(work, `${name}.cfg`), configFor(run));
    const began = performance.now();
    const { code, output } = yield* exitOf(
      ChildProcess.make(
        java,
        [
          "-XX:+UseParallelGC",
          `-Djava.io.tmpdir=${path.join(work, "tmp")}`,
          "-cp",
          jar,
          "tlc2.TLC",
          "-workers",
          "auto",
          "-difftrace",
          "-nowarning",
          "-config",
          `${name}.cfg`,
          "-metadir",
          path.join(work, name),
          path.basename(SPEC),
        ],
        { cwd: work, stdin: "ignore" }
      )
    );
    const seconds = Math.round((performance.now() - began) / 1000);
    const { line, ok } = verdictOf(run, outcomeOf(code, output), output);
    yield* Console.log(
      `${ok ? "ok  " : "FAIL"} ${describeRun(run)}: ${line}, ${seconds} s`
    );
    if (!ok) {
      failures.push(name);
    }
  }
  yield* Console.log(
    `${runs.length} runs in ${Math.round((performance.now() - startedAt) / 1000)} s`
  );
  return yield* failures.length > 0
    ? Effect.fail(
        new LifecycleToolFailed({
          cause: failures,
          message: `TLC did not give the expected result for ${failures.join(", ")}.`,
        })
      )
    : Effect.void;
}, Effect.scoped);
