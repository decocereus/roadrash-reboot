import { CleanupOutcomes } from "@racer/devtools/cleanup";
import { ToolProcesses } from "@racer/devtools/process";
import { ProcessError } from "@racer/devtools/process-error";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import { describe, expect, it } from "vitest";

import type { CommandContext } from "../src/context.ts";
import { Evidence } from "../src/evidence.ts";
import { up } from "../src/lifecycle.ts";
import { SlotStore, devtoolsPortOf, serverPortOf } from "../src/state.ts";
import type { InstanceState } from "../src/state.ts";

const SERVER = 41_001;
const WATCHER = 41_002;
const BROWSER = 41_003;
const CHECKOUT = "/tmp/rushline-rollback-test";

const failuresOf = (cause: Cause.Cause<unknown>) =>
  cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error);

const upWhereWriteFails = async (failing: number) => {
  const printed: string[] = [];
  const stops: (readonly [number | null, string])[] = [];
  const commands = new Map<number, string>();
  const ports = new Map<number, number>();
  let disk: InstanceState | null = null;
  const writeFailed = PlatformError.systemError({
    _tag: "PermissionDenied",
    method: "writeFileString",
    module: "FileSystem",
  });
  const stopFailed = new ProcessError({
    message: `Could not send SIGTERM to pid ${failing}.`,
    operation: "signal",
    pid: failing,
  });

  const stopOwned = (pid: number | null, expected: string) =>
    Effect.suspend(() => {
      stops.push([pid, expected]);
      if (pid === failing) {
        return Effect.fail(stopFailed);
      }
      if (pid === null || !commands.delete(pid)) {
        return Effect.succeed("already gone");
      }
      for (const [port, holder] of ports) {
        if (holder === pid) {
          ports.delete(port);
        }
      }
      return Effect.succeed(`stopped pid ${pid}`);
    });

  const processes = Layer.succeed(ToolProcesses)({
    commandOf: (pid) => Effect.succeed(commands.get(pid) ?? ""),
    listed: Effect.sync(() =>
      [...commands].map(([pid, command]) => ({ command, pid }))
    ),
    listenerOf: (port) => Effect.succeed(ports.get(port) ?? null),
    run: (file, args) =>
      Effect.sync(() => {
        if (file === "open") {
          commands.set(BROWSER, args.join(" "));
          ports.set(devtoolsPortOf(0), BROWSER);
        }
        return {
          stderr: "",
          stdout: args.includes("--git-common-dir")
            ? `${CHECKOUT}/.git`
            : CHECKOUT,
        };
      }),
    spawnScoped: () => Effect.die("rv never spawns a scoped browser"),
    startDetached: (args) =>
      Effect.sync(() => {
        const pid = args.includes("watch") ? WATCHER : SERVER;
        commands.set(pid, args.join(" "));
        return pid;
      }),
    stopOwned,
  });

  const slots = Layer.succeed(SlotStore)({
    claimSlot: (candidates, draft) =>
      Effect.sync(() => {
        const claimed = draft(candidates[0] ?? 0);
        disk = claimed;
        return claimed;
      }),
    ensureStateDir: Effect.void,
    readState: () => Effect.sync(() => disk),
    reclaimStale: () => Effect.succeed(null),
    releaseClaim: () =>
      Effect.sync(() => {
        disk = null;
      }),
    stateOfRun: () => Effect.die("up never looks a run up"),
    writeState: (next) =>
      next.serverPid === failing || next.watcherPid === failing
        ? Effect.fail(writeFailed)
        : Effect.sync(() => {
            disk = next;
          }),
  });

  const server = Layer.succeed(HttpClient.HttpClient)(
    HttpClient.make((request) =>
      Effect.sync(() => {
        ports.set(serverPortOf(0), SERVER);
        return HttpClientResponse.fromWeb(
          request,
          new Response("<title>Rushline</title>")
        );
      })
    )
  );

  const files = Evidence.layer.pipe(
    Layer.provideMerge(
      FileSystem.layerNoop({ makeDirectory: () => Effect.void })
    )
  );

  const context: CommandContext = {
    command: "up",
    deadline: Effect.succeed(0),
    print: (line) =>
      Effect.sync(() => {
        printed.push(line);
      }),
    rest: [],
    script: `${CHECKOUT}/tools/verify/rushline.ts`,
    values: {
      dev: true,
      every: "1",
      hold: "120",
      path: "/",
      seconds: "5",
      sound: false,
      timeout: "60",
      "user-asked": false,
      within: "",
    },
  };

  const { cleanup, exit } = await Effect.runPromise(
    Effect.gen(function* runUp() {
      const outcomes = yield* Ref.make<readonly Cause.Cause<unknown>[]>([]);
      const ended = yield* Effect.scoped(up(context)).pipe(
        Effect.provideService(CleanupOutcomes, outcomes),
        Effect.exit
      );
      return { cleanup: yield* Ref.get(outcomes), exit: ended };
    }).pipe(Effect.provide(Layer.mergeAll(processes, slots, server, files)))
  );

  return {
    cleanupFailures: cleanup.flatMap(failuresOf),
    failures: Exit.isFailure(exit) ? failuresOf(exit.cause) : [],
    printed,
    stopFailed,
    stops,
    writeFailed,
  };
};

describe("rv up when the state write after a detached start fails", () => {
  it.for([
    { expected: "vite.js", failing: SERVER, started: "server" },
    { expected: "rushline.ts", failing: WATCHER, started: "watcher" },
  ])(
    "stops the new $started pid and reports no clean release",
    async ({ expected, failing }) => {
      const result = await upWhereWriteFails(failing);
      expect(result.stops).toContainEqual([failing, expected]);
      expect(result.failures).toStrictEqual([result.writeFailed]);
      expect(result.cleanupFailures).toStrictEqual([result.stopFailed]);
      expect(result.printed).toContain(
        "startup failed; tearing down what this run started"
      );
      expect(
        result.printed.filter((line) => line.startsWith("released slot"))
      ).toStrictEqual([]);
    }
  );
});
