import {
  benchChildEnv,
  holdBench,
  recordWorkload,
} from "@racer/devtools/bench-turn";
import { ToolProcesses } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Effect from "effect/Effect";

import type { CommandContext } from "./context.ts";

const orderOf = ([label, file, ...args]: readonly string[]) =>
  label === undefined || file === undefined
    ? Effect.fail(
        new UsageError({
          message:
            "rv bench takes a label and a command: rv bench <label> -- <command> [args]",
        })
      )
    : Effect.succeed({ args, file, label });

export const bench = Effect.fn("rv.bench")(function* bench({
  rest,
}: CommandContext) {
  const { args, file, label } = yield* orderOf(rest);
  yield* holdBench(label);
  const processes = yield* ToolProcesses;
  const code = yield* processes.runShown(file, args, benchChildEnv(), (group) =>
    recordWorkload(group)
  );
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
});
