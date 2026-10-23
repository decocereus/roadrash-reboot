import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { ProcessError } from "./process-error.ts";

const POLL_MS = 200;
const STOP_ATTEMPTS = 50;
const LOGGED_EXEC = 'log=$1; shift; exec "$@" >>"$log" 2>&1';

export interface CommandOutput {
  readonly stderr: string;
  readonly stdout: string;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface ListedProcess {
  readonly pid: number;
  readonly command: string;
}

export const alive = (pid: number | null): boolean => {
  if (pid === null) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const isMissingProcess = Schema.is(
  Schema.Struct({ code: Schema.Literal("ESRCH") })
);

const signal = (pid: number, name: NodeJS.Signals) =>
  Effect.try({
    catch: (cause) =>
      new ProcessError({
        cause,
        message: `Could not send ${name} to pid ${pid}.`,
        operation: "signal",
        pid,
      }),
    try: () => process.kill(pid, name),
  }).pipe(
    Effect.catchIf(
      (error) => isMissingProcess(error.cause),
      () => Effect.succeed(false)
    )
  );

const awaitGone = Effect.fnUntraced(function* awaitGone(pid: number) {
  let attempt = 0;
  while (alive(pid)) {
    if (attempt >= STOP_ATTEMPTS) {
      return false;
    }
    yield* Effect.sleep(POLL_MS);
    attempt += 1;
  }
  return true;
});

const collected = (
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>
) => Stream.mkString(Stream.decodeText(stream));

const listedLine = /^\s*(?<pid>\d+)\s(?<command>.*)$/u;

export class ToolProcesses extends Context.Service<
  ToolProcesses,
  {
    readonly run: (
      file: string,
      args: readonly string[],
      options?: RunOptions
    ) => Effect.Effect<CommandOutput, ProcessError>;
    readonly spawnScoped: (
      file: string,
      args: readonly string[]
    ) => Effect.Effect<number, ProcessError, Scope.Scope>;
    readonly startDetached: (
      args: readonly string[],
      cwd: string,
      log: string,
      env: NodeJS.ProcessEnv
    ) => Effect.Effect<number, ProcessError>;
    readonly listenerOf: (port: number) => Effect.Effect<number | null>;
    readonly commandOf: (pid: number) => Effect.Effect<string>;
    readonly listed: Effect.Effect<readonly ListedProcess[], ProcessError>;
    readonly stopOwned: (
      pid: number | null,
      expect: string
    ) => Effect.Effect<string, ProcessError>;
  }
>()("@racer/devtools/ToolProcesses") {
  static readonly layer = Layer.effect(ToolProcesses)(
    Effect.gen(function* makeToolProcesses() {
      const spawner = yield* ChildProcessSpawner;

      const run = Effect.fn("ToolProcesses.run")(function* run(
        file: string,
        args: readonly string[],
        options: RunOptions = {}
      ) {
        const shown = [file, ...args].join(" ");
        const handle = yield* spawner
          .spawn(
            ChildProcess.make(file, [...args], {
              cwd: options.cwd,
              env: options.env,
              stdin: "ignore",
            })
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProcessError({
                  cause,
                  executable: file,
                  message: `Could not start ${shown}: ${cause.message}`,
                  operation: "run",
                })
            )
          );
        const [stdout, stderr, exit] = yield* Effect.all(
          [
            collected(handle.stdout),
            collected(handle.stderr),
            Effect.exit(handle.exitCode),
          ],
          { concurrency: "unbounded" }
        ).pipe(
          Effect.mapError(
            (cause) =>
              new ProcessError({
                cause,
                executable: file,
                message: `Could not read the output of ${shown}: ${cause.message}`,
                operation: "run",
                pid: handle.pid,
              })
          )
        );
        if (Exit.isFailure(exit) || exit.value !== 0) {
          return yield* new ProcessError({
            cause: exit,
            executable: file,
            message: `Command failed: ${shown}\n${stderr}`,
            operation: "run",
            pid: handle.pid,
          });
        }
        return { stderr, stdout };
      }, Effect.scoped);

      const spawnScoped = Effect.fn("ToolProcesses.spawnScoped")(
        function* spawnScoped(file: string, args: readonly string[]) {
          const handle = yield* spawner
            .spawn(
              ChildProcess.make(file, [...args], {
                stderr: "ignore",
                stdin: "ignore",
                stdout: "ignore",
              })
            )
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ProcessError({
                    cause,
                    executable: file,
                    message: `Could not start ${file}: ${cause.message}`,
                    operation: "spawn",
                  })
              )
            );
          return handle.pid;
        }
      );

      const startDetached = Effect.fn("ToolProcesses.startDetached")(
        function* startDetached(
          args: readonly string[],
          cwd: string,
          log: string,
          env: NodeJS.ProcessEnv
        ) {
          return yield* spawner
            .spawn(
              ChildProcess.make(
                "/bin/sh",
                [
                  "-c",
                  LOGGED_EXEC,
                  "rushline-detached",
                  log,
                  process.execPath,
                  ...args,
                ],
                {
                  cwd,
                  detached: true,
                  env,
                  extendEnv: false,
                  stderr: "ignore",
                  stdin: "ignore",
                  stdout: "ignore",
                }
              )
            )
            .pipe(
              Effect.tap((handle) => handle.unref),
              Effect.map((handle) => handle.pid),
              Effect.mapError(
                (cause) =>
                  new ProcessError({
                    cause,
                    executable: process.execPath,
                    message: `Could not start ${args.join(" ")}: ${cause.message}`,
                    operation: "spawn",
                  })
              )
            );
        },
        Effect.scoped
      );

      const listenerOf = (port: number) =>
        run("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]).pipe(
          Effect.map(({ stdout }) => {
            const [first] = stdout.split("\n").filter(Boolean).map(Number);
            return first ?? null;
          }),
          Effect.catchTag("ProcessError", () => Effect.succeed(null))
        );

      const commandOf = (pid: number) =>
        run("ps", ["-o", "command=", "-p", String(pid)]).pipe(
          Effect.map(({ stdout }) => stdout.trim()),
          Effect.catchTag("ProcessError", () => Effect.succeed(""))
        );

      const listed = run("ps", ["-axo", "pid=,command="]).pipe(
        Effect.map(({ stdout }) =>
          stdout.split("\n").flatMap((line) => {
            const groups = listedLine.exec(line)?.groups;
            return groups?.pid === undefined || groups.command === undefined
              ? []
              : [{ command: groups.command, pid: Number(groups.pid) }];
          })
        )
      );

      const stopOwned = Effect.fn("ToolProcesses.stopOwned")(
        function* stopOwned(pid: number | null, expect: string) {
          if (pid === null || !alive(pid)) {
            return "already gone";
          }
          const command = yield* commandOf(pid);
          if (!command.includes(expect)) {
            return `left alone: pid ${pid} is now "${command.slice(0, 80)}", not ours`;
          }
          if (!(yield* signal(pid, "SIGTERM"))) {
            return "already gone";
          }
          if (yield* awaitGone(pid)) {
            return `stopped pid ${pid}`;
          }
          const now = yield* commandOf(pid);
          if (!now.includes(expect)) {
            return alive(pid)
              ? `left alone: pid ${pid} is now "${now.slice(0, 80)}", not ours`
              : `stopped pid ${pid}`;
          }
          yield* signal(pid, "SIGKILL");
          return `killed pid ${pid} after SIGTERM timed out`;
        }
      );

      return ToolProcesses.of({
        commandOf,
        listed,
        listenerOf,
        run,
        spawnScoped,
        startDetached,
        stopOwned,
      });
    })
  );
}
