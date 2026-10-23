import path from "node:path";

import { attempt, cleanupFailed, released } from "@racer/devtools/cleanup";
import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { Evidence } from "./evidence.ts";
import {
  build,
  buildDirFor,
  checkoutRoot,
  evidenceRoot,
  serverAnswers,
  startBrowser,
  startServer,
  stopBrowser,
  stopServer,
  stopWatcher,
} from "./instance.ts";
import {
  SLOTS,
  SlotStore,
  USER_PORTS,
  devtoolsPortOf,
  profileFor,
  runIdFor,
  serverPortOf,
  statePath,
} from "./state.ts";
import type { InstanceState, ServerMode } from "./state.ts";
import { VerificationError } from "./verification-error.ts";
import { launchWatcher } from "./watcher.ts";

const serverModeOf = ({ values }: CommandContext): ServerMode => {
  if (values.server !== undefined && values.server !== "") {
    return "external";
  }
  return values.dev ? "dev" : "preview";
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

const checkExternal = ({ values }: CommandContext, url: string) => {
  const { hostname, port } = new URL(url);
  const theirs = USER_PORTS.has(Number(port)) || !LOOPBACK.has(hostname);
  return theirs && !values["user-asked"]
    ? Effect.fail(
        new UsageError({
          message: `${url} is the user's play server or a remote one (their tunnel points at 1351). Drive it only when the user asked, and then pass --user-asked.`,
        })
      )
    : Effect.void;
};

const teardown = Effect.fnUntraced(function* teardown(
  { print }: CommandContext,
  state: InstanceState,
  buildDir: string | null
) {
  const fs = yield* FileSystem.FileSystem;
  const slots = yield* SlotStore;
  const stages = [
    ["watcher", stopWatcher(state)],
    ["helium", stopBrowser(state)],
    ["server", stopServer(state)],
  ] as const;
  for (const [label, stop] of stages) {
    const stopped = yield* attempt(stop);
    if (Option.isSome(stopped)) {
      yield* print(`${label}: ${stopped.value}`);
    }
  }
  const removals = [
    fs.remove(state.profile, { force: true, recursive: true }),
    ...(buildDir === null || buildDir === ""
      ? []
      : [fs.remove(buildDir, { force: true, recursive: true })]),
    slots.releaseClaim(state),
  ];
  for (const removal of removals) {
    yield* released(removal);
  }
  if (yield* cleanupFailed) {
    return;
  }
  const left = yield* fs
    .readDirectory(state.evidence)
    .pipe(Effect.orElseSucceed((): string[] => []));
  yield* print(
    `released slot ${state.slot}; removed the profile and the build`
  );
  yield* print(`evidence kept: ${state.evidence} (${left.length} entries)`);
});

const rollback = Effect.fnUntraced(function* rollback(
  context: CommandContext,
  claimed: InstanceState
) {
  const slots = yield* SlotStore;
  yield* context.print("startup failed; tearing down what this run started");
  const latest = Option.getOrNull(
    yield* attempt(slots.readState(claimed.slot))
  );
  const state = latest?.run === claimed.run ? latest : claimed;
  yield* teardown(
    context,
    state,
    state.serverMode === "preview"
      ? buildDirFor(state.checkout, state.slot)
      : null
  );
});

const bringUp = Effect.fnUntraced(function* bringUp(
  context: CommandContext,
  state: InstanceState,
  mode: ServerMode
) {
  const { command, print, script, values } = context;
  const fs = yield* FileSystem.FileSystem;
  const slots = yield* SlotStore;
  const evidence = yield* Evidence;
  yield* fs.makeDirectory(state.evidence, { recursive: true });
  yield* fs.makeDirectory(state.profile, { recursive: true });
  const built = mode === "preview" ? yield* build(state) : state;
  if (built.builtFrom !== null && built.builtFrom !== "") {
    yield* print(`built ${built.builtFrom} into ${built.buildDir}`);
  }
  const served = mode === "external" ? built : yield* startServer(built);
  if (mode === "external" && !(yield* serverAnswers(served.serverUrl))) {
    yield* new VerificationError({
      message: `${served.serverUrl} does not serve Rushline.`,
      operation: "serve",
      run: served.run,
    });
  }
  yield* print(
    `server ${served.serverUrl} (${mode}, pid ${served.serverPid ?? "not ours"})`
  );
  const url = new URL(values.path, served.serverUrl).href;
  const browsing = yield* Effect.uninterruptibleMask((restore) =>
    restore(startBrowser(served, url)).pipe(Effect.tap(slots.writeState))
  );
  yield* print(
    `helium pid ${browsing.browserPid}, devtools ${browsing.devtoolsPort}, opened ${url}`
  );
  const watching = yield* launchWatcher(browsing, script);
  yield* print(`console watcher pid ${watching.watcherPid}`);
  yield* evidence.journal(command, watching, `up ${url}`);
  yield* print(`evidence ${watching.evidence}`);
  yield* print(`RUN=${watching.run}`);
});

export const up = Effect.fn("rv.up")(function* up(context: CommandContext) {
  const { print, values } = context;
  if (values.server !== undefined && values.server !== "") {
    yield* checkExternal(context, values.server);
  }
  const slots = yield* SlotStore;
  yield* slots.ensureStateDir;
  const reclaimed = yield* Effect.all(
    Array.from({ length: SLOTS }, (_, slot) => slots.reclaimStale(slot)),
    { concurrency: "unbounded" }
  );
  for (const each of reclaimed.filter(Boolean)) {
    yield* print(
      `reclaimed stale slot of run ${each}; none of its processes lived`
    );
  }
  const checkout = yield* checkoutRoot;
  const evidenceBase = yield* evidenceRoot(checkout);
  const wanted = values.slot === undefined ? null : Number(values.slot);
  const startedAt = new Date(yield* Clock.currentTimeMillis);
  const mode = serverModeOf(context);
  const state = yield* Effect.acquireRelease(
    slots.claimSlot(
      wanted === null
        ? Array.from({ length: SLOTS }, (_, slot) => slot)
        : [wanted],
      (slot) => {
        const run = runIdFor(slot, startedAt);
        return {
          browserPid: null,
          buildDir: null,
          builtAt: null,
          builtFrom: null,
          checkout,
          cpu: Number(values.cpu ?? 1),
          devtoolsPort: devtoolsPortOf(slot),
          evidence: path.join(evidenceBase, run),
          network: values.network ?? "off",
          profile: profileFor(run),
          run,
          serverMode: mode,
          serverPid: null,
          serverUrl: values.server ?? `http://127.0.0.1:${serverPortOf(slot)}/`,
          slot,
          sound: values.sound,
          startedAt: startedAt.toISOString(),
          upPid: process.pid,
          watcherPid: null,
        };
      }
    ),
    (claimed, exit) =>
      Exit.isSuccess(exit) ? Effect.void : rollback(context, claimed)
  );
  yield* print(
    `run ${state.run}: slot ${state.slot}, claimed ${statePath(state.slot)}`
  );
  yield* bringUp(context, state, mode);
});

export const down = Effect.fn("rv.down")(function* down(
  context: CommandContext
) {
  const state = yield* requireRun(context);
  const evidence = yield* Evidence;
  yield* evidence.journal(context.command, state, "down");
  yield* teardown(context, state, state.buildDir);
});
