import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { closeSync, openSync } from "node:fs";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProcessError } from "../process-error.ts";

const startFailed = (args: readonly string[], cause: unknown) =>
  new ProcessError({
    cause,
    executable: process.execPath,
    message: `Could not start ${args.join(" ")}.`,
    operation: "spawn",
  });

const launched = (
  args: readonly string[],
  cwd: string,
  log: string,
  env: NodeJS.ProcessEnv
) =>
  Effect.try({
    catch: (cause) => startFailed(args, cause),
    try: () => {
      const descriptor = openSync(log, "a");
      try {
        return spawn(process.execPath, [...args], {
          cwd,
          detached: true,
          env,
          stdio: ["ignore", descriptor, descriptor],
        });
      } finally {
        closeSync(descriptor);
      }
    },
  });

const started = (args: readonly string[], child: ChildProcess) =>
  Effect.tryPromise({
    catch: (cause) => startFailed(args, cause),
    try: async (signal) => {
      await once(child, "spawn", { signal });
    },
  }).pipe(
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        child.kill("SIGTERM");
      })
    ),
    Effect.flatMap(() =>
      Effect.sync(() => {
        child.unref();
        return child.pid;
      })
    ),
    Effect.filterOrFail(
      (pid): pid is number => pid !== undefined,
      () => startFailed(args, "no pid")
    )
  );

const spawnLogged = (
  args: readonly string[],
  cwd: string,
  log: string,
  env: NodeJS.ProcessEnv
): Effect.Effect<number, ProcessError> =>
  launched(args, cwd, log, env).pipe(
    Effect.flatMap((child) => started(args, child))
  );

export class DetachedProcesses extends Context.Service<
  DetachedProcesses,
  {
    readonly spawnLogged: (
      args: readonly string[],
      cwd: string,
      log: string,
      env: NodeJS.ProcessEnv
    ) => Effect.Effect<number, ProcessError>;
  }
>()("@racer/devtools/DetachedProcesses") {
  static readonly layer = Layer.succeed(DetachedProcesses)({ spawnLogged });
}
