import { clockOf } from "@racer/devtools/bench-queue";
import { benchChildEnv, holdBench } from "@racer/devtools/bench-turn";
import { ToolProcesses } from "@racer/devtools/process";
import type { ProcessError } from "@racer/devtools/process-error";
import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { CommandContext } from "./context.ts";

const STOPPED_CODE = 124;

const orderOf = ([label, file, ...args]: readonly string[]) =>
  label === undefined || file === undefined
    ? Effect.fail(
        new UsageError({
          message:
            "rv bench takes a label and a command: rv bench <label> -- <command> [args]",
        })
      )
    : Effect.succeed({ args, file, label });

const stoppedAt = Effect.fnUntraced(function* stoppedAt(
  running: Effect.Effect<number, ProcessError>,
  deadline: number,
  label: string
) {
  const left = deadline - (yield* Clock.currentTimeMillis);
  const finished = yield* running.pipe(Effect.timeoutOption(Math.max(0, left)));
  if (Option.isSome(finished)) {
    return finished.value;
  }
  yield* Effect.sync(() => {
    process.stderr.write(
      `rv bench: stopped ${label} at ${clockOf(deadline)}, because its booking ran out: its expected end plus 15 min.\n`
    );
  });
  return STOPPED_CODE;
});

export const bench = Effect.fn("rv.bench")(function* bench({
  rest,
}: CommandContext) {
  const { args, file, label } = yield* orderOf(rest);
  const deadline = yield* holdBench(label);
  const processes = yield* ToolProcesses;
  const running = processes.runShown(file, args, benchChildEnv());
  const code =
    deadline === null
      ? yield* running
      : yield* stoppedAt(running, deadline, label);
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
});
