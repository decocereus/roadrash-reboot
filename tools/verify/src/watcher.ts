import path from "node:path";

import { connect } from "@racer/devtools/cdp";
import { pageTarget } from "@racer/devtools/chrome";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { Evidence, consoleFile } from "./evidence.ts";
import { startWatcher } from "./instance.ts";
import { throttle } from "./profile.ts";
import { SlotStore } from "./state.ts";
import type { InstanceState } from "./state.ts";
import { VerificationError } from "./verification-error.ts";

const WATCH_ATTEMPTS = 100;

const WATCH_POLL_MS = 100;

const consoleCall = Schema.Struct({
  args: Schema.Array(
    Schema.Struct({
      description: Schema.optionalKey(Schema.String),
      value: Schema.optionalKey(Schema.Unknown),
    })
  ),
  type: Schema.String,
});

const thrown = Schema.Struct({
  exceptionDetails: Schema.Struct({
    exception: Schema.optionalKey(
      Schema.Struct({ description: Schema.optionalKey(Schema.String) })
    ),
    text: Schema.String,
    url: Schema.optionalKey(Schema.String),
  }),
});

const logEntry = Schema.Struct({
  entry: Schema.Struct({
    level: Schema.String,
    source: Schema.String,
    text: Schema.String,
    url: Schema.optionalKey(Schema.String),
  }),
});

const navigated = Schema.Struct({
  frame: Schema.Struct({
    parentId: Schema.optionalKey(Schema.String),
    url: Schema.String,
  }),
});

const encoder = new TextEncoder();

export const watch = Effect.fn("rv.watch")(function* watch(
  context: CommandContext
) {
  const state = yield* requireRun(context);
  const fs = yield* FileSystem.FileSystem;
  const socket = yield* pageTarget(state.devtoolsPort, "http").pipe(
    Effect.filterOrFail(
      (found): found is string => found !== undefined && found !== "",
      () =>
        new VerificationError({
          message: "The watcher found no page to attach to.",
          operation: "watch",
          run: state.run,
        })
    )
  );
  const page = yield* connect(socket);
  const out = yield* fs.open(consoleFile(state), { flag: "a" });
  const lines = yield* Queue.make<string, Cause.Done>();
  const writer = yield* Effect.forkScoped(
    Stream.fromQueue(lines).pipe(
      Stream.runForEach((line) => out.writeAll(encoder.encode(line)))
    )
  );
  const write = (kind: string, level: string, text: string) => {
    Queue.offerUnsafe(
      lines,
      `${JSON.stringify({ at: new Date().toISOString(), kind, level, text })}\n`
    );
  };
  yield* page.on("Runtime.consoleAPICalled", consoleCall, (call) => {
    write(
      "console",
      call.type,
      call.args
        .map((each) =>
          each.value === undefined
            ? (each.description ?? "")
            : JSON.stringify(each.value)
        )
        .join(" ")
    );
  });
  yield* page.on("Runtime.exceptionThrown", thrown, ({ exceptionDetails }) => {
    write(
      "exception",
      "error",
      exceptionDetails.exception?.description ?? exceptionDetails.text
    );
  });
  yield* page.on("Log.entryAdded", logEntry, ({ entry }) => {
    write(
      `log:${entry.source}`,
      entry.level,
      `${entry.text}${entry.url !== undefined && entry.url !== "" ? ` (${entry.url})` : ""}`
    );
  });
  yield* page.on("Page.frameNavigated", navigated, ({ frame }) => {
    if (frame.parentId === undefined) {
      write("navigate", "info", frame.url);
    }
  });
  yield* page.send("Page.enable");
  yield* page.send("Log.enable");
  yield* page.send("Runtime.enable");
  yield* throttle(page, state.cpu, state.network);
  write(
    "watch",
    "info",
    `attached; cpu x${state.cpu}; network ${state.network}`
  );
  yield* Effect.raceFirst(
    page.closed.pipe(Effect.catchTag("CdpError", () => Effect.void)),
    Fiber.join(writer)
  );
});

const watcherAttached = Effect.fnUntraced(function* watcherAttached(
  state: InstanceState
) {
  const evidence = yield* Evidence;
  const marker = `attached; cpu x${state.cpu}; network ${state.network}`;
  let attempt = 0;
  while (!(yield* evidence.consoleText(state)).includes(marker)) {
    if (attempt >= WATCH_ATTEMPTS) {
      return false;
    }
    yield* Effect.sleep(WATCH_POLL_MS);
    attempt += 1;
  }
  return true;
});

export const launchWatcher = Effect.fn("rv.launchWatcher")(
  function* launchWatcher(state: InstanceState, script: string) {
    const slots = yield* SlotStore;
    const next = yield* Effect.uninterruptible(
      startWatcher(state, script).pipe(Effect.tap(slots.writeState))
    );
    if (!(yield* watcherAttached(next))) {
      return yield* new VerificationError({
        message: `The console watcher did not attach; read ${path.join(state.evidence, "watch.log")}.`,
        operation: "watch",
        run: state.run,
      });
    }
    return next;
  }
);
