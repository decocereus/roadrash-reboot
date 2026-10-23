import path from "node:path";

import { evaluate } from "@racer/devtools/cdp";
import { alive } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { ariaSnapshot, screencast, screenshot } from "./capture.ts";
import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { Evidence, evidenceFile, isError } from "./evidence.ts";
import { click, press } from "./input.ts";
import { build, startServer, stopServer, stopWatcher } from "./instance.ts";
import { expressionFor, navigate, waitFor, withPage } from "./page.ts";
import { networkProfiles, sample, trace } from "./profile.ts";
import { SLOTS, SlotStore } from "./state.ts";
import type { InstanceState } from "./state.ts";
import { launchWatcher } from "./watcher.ts";

const report = Effect.fnUntraced(function* report(
  context: CommandContext,
  state: InstanceState,
  result: string
) {
  const evidence = yield* Evidence;
  yield* context.print(result);
  yield* evidence.journal(context.command, state, result);
});

const sinceStart = (started: number) =>
  Clock.currentTimeMillis.pipe(Effect.map((now) => now - started));

export const listSlots = Effect.fn("rv.list")(function* listSlots({
  print,
}: CommandContext) {
  const slots = yield* SlotStore;
  const states = yield* Effect.all(
    Array.from({ length: SLOTS }, (_, slot) => slots.readState(slot)),
    { concurrency: "unbounded" }
  );
  const held = states.filter((each) => each !== null);
  if (held.length === 0) {
    yield* print("no verification runs hold a slot");
  }
  for (const state of held) {
    yield* print(
      `slot ${state.slot}  run ${state.run}  ${state.serverUrl}  devtools ${state.devtoolsPort}  server ${alive(state.serverPid) ? "up" : "down"}  helium ${alive(state.browserPid) ? "up" : "down"}  from ${state.checkout}`
    );
  }
});

export const openPage = Effect.fn("rv.open")(function* openPage(
  context: CommandContext
) {
  const { deadline, rest, values } = context;
  const state = yield* requireRun(context);
  const [target = values.path] = rest;
  const url = new URL(target, state.serverUrl);
  if (url.origin !== new URL(state.serverUrl).origin) {
    yield* new UsageError({
      message: `Open paths on this run's server only, not ${url.origin}.`,
    });
  }
  const started = yield* Clock.currentTimeMillis;
  const result = yield* withPage(state, (page) =>
    Effect.gen(function* openAndWait() {
      yield* navigate(page, url.href, yield* deadline);
      const loaded = yield* sinceStart(started);
      if (values.until !== undefined && values.until !== "") {
        yield* waitFor(page, expressionFor(values.until), yield* deadline);
        return `loaded in ${loaded} ms; ${values.until} after ${yield* sinceStart(started)} ms`;
      }
      return `loaded in ${loaded} ms`;
    })
  );
  yield* report(context, state, `${url.href}: ${result}`);
});

export const jsCommand = Effect.fn("rv.js")(function* jsCommand(
  context: CommandContext
) {
  const { command, print, rest } = context;
  const state = yield* requireRun(context);
  const evidence = yield* Evidence;
  const expression = rest.join(" ");
  const value = yield* withPage(state, (page) =>
    evaluate(
      page,
      `(async () => JSON.stringify(await (${expression})) ?? "undefined")()`,
      Schema.String
    )
  );
  yield* print(value);
  yield* evidence.journal(command, state, value.slice(0, 2000));
});

export const waitCommand = Effect.fn("rv.wait")(function* waitCommand(
  context: CommandContext
) {
  const { deadline, rest } = context;
  const state = yield* requireRun(context);
  const expression = expressionFor(rest.join(" "));
  const started = yield* Clock.currentTimeMillis;
  const value = yield* withPage(state, (page) =>
    deadline.pipe(Effect.flatMap((until) => waitFor(page, expression, until)))
  );
  yield* report(
    context,
    state,
    `${value} after ${yield* sinceStart(started)} ms`
  );
});

export const pressCommand = Effect.fn("rv.press")(function* pressCommand(
  context: CommandContext
) {
  const { rest, values } = context;
  const state = yield* requireRun(context);
  const hold = Number(values.hold);
  yield* withPage(state, (page) => press(page, rest, hold));
  yield* report(context, state, `pressed ${rest.join("+")} for ${hold} ms`);
});

export const clickCommand = Effect.fn("rv.click")(function* clickCommand(
  context: CommandContext
) {
  const { rest, values } = context;
  const state = yield* requireRun(context);
  const label = yield* withPage(state, (page) =>
    click(page, rest.join(" "), values.within)
  );
  yield* report(context, state, `clicked ${label}`);
});

export const shotCommand = Effect.fn("rv.shot")(function* shotCommand(
  context: CommandContext
) {
  const { rest } = context;
  const state = yield* requireRun(context);
  const file = yield* evidenceFile(state, `${rest[0] ?? ""}.png`);
  yield* withPage(state, (page) => screenshot(page, file));
  yield* report(context, state, file);
});

export const ariaCommand = Effect.fn("rv.aria")(function* ariaCommand(
  context: CommandContext
) {
  const { command, print, rest } = context;
  const state = yield* requireRun(context);
  const fs = yield* FileSystem.FileSystem;
  const evidence = yield* Evidence;
  const file = yield* evidenceFile(state, `${rest[0] ?? ""}.aria.txt`);
  const lines = yield* withPage(state, (page) => ariaSnapshot(page, file));
  yield* print(`${file} (${lines} nodes)`);
  yield* print(yield* fs.readFileString(file, "utf-8"));
  yield* evidence.journal(command, state, file);
});

export const screencastCommand = Effect.fn("rv.screencast")(
  function* screencastCommand(context: CommandContext) {
    const { rest, values } = context;
    const state = yield* requireRun(context);
    const dir = yield* evidenceFile(state, rest[0] ?? "");
    const cast = yield* withPage(state, (page) =>
      screencast(page, dir, Number(values.seconds), Number(values.every))
    );
    yield* report(
      context,
      state,
      `${cast.frames} frames in ${cast.seconds} s (${(cast.frames / cast.seconds).toFixed(1)} per s) in ${cast.dir}`
    );
  }
);

export const traceCommand = Effect.fn("rv.trace")(function* traceCommand(
  context: CommandContext
) {
  const { command, print, rest, values } = context;
  const state = yield* requireRun(context);
  const evidence = yield* Evidence;
  const file = yield* evidenceFile(state, `${rest[0] ?? ""}.trace.json`);
  const traced = yield* withPage(state, (page) =>
    trace(page, file, Number(values.seconds))
  );
  const { summary } = traced;
  yield* print(
    `${file}: ${traced.events} events; long tasks ${summary.longTasks.count}, longest task ${summary.longestTaskMs.toFixed(1)} ms; minor gc ${summary.minorGc.count} (${summary.minorGc.totalMs.toFixed(1)} ms); major gc ${summary.majorGc.count} (${summary.majorGc.totalMs.toFixed(1)} ms); cpu x${state.cpu}, network ${state.network}`
  );
  for (const each of traced.threads) {
    yield* print(
      `  ${each.busyMs.toFixed(0).padStart(7)} ms busy  ${each.thread}`
    );
  }
  yield* evidence.journal(
    command,
    state,
    `${file}: longest task ${summary.longestTaskMs.toFixed(1)} ms`
  );
});

export const sampleCommand = Effect.fn("rv.sample")(function* sampleCommand(
  context: CommandContext
) {
  const { command, print, rest, values } = context;
  const state = yield* requireRun(context);
  const fs = yield* FileSystem.FileSystem;
  const evidence = yield* Evidence;
  const file = yield* evidenceFile(state, `${rest[0] ?? ""}.sample.json`);
  const sampled = yield* withPage(state, (page) =>
    sample(page, Number(values.seconds))
  );
  const { interval } = sampled;
  const result = `ticks ${sampled.fromTick}-${sampled.toTick}: ${sampled.frames} frames, ${sampled.fps.toFixed(1)} fps, frame p50 ${interval.p50.toFixed(1)} p95 ${interval.p95.toFixed(1)} p99 ${interval.p99.toFixed(1)} worst ${interval.max.toFixed(1)} ms, late ${JSON.stringify(sampled.late)}, js ${sampled.jsFrame.mean.toFixed(2)} ms/frame, ${sampled.calls.toFixed(0)} calls, ratio ${sampled.pixelRatios.join(",")}, rung ${sampled.rungs.join(",")}, cpu x${state.cpu}, network ${state.network}`;
  yield* fs.writeFileString(
    file,
    `${JSON.stringify({ cpu: state.cpu, network: state.network, ...sampled }, null, 1)}\n`,
    { flag: "a" }
  );
  yield* print(result);
  yield* print(file);
  yield* evidence.journal(command, state, result);
});

export const throttleCommand = Effect.fn("rv.throttle")(
  function* throttleCommand(context: CommandContext) {
    const { script, values } = context;
    const state = yield* requireRun(context);
    const network = values.network ?? state.network;
    if (network !== "off" && !networkProfiles.has(network)) {
      yield* new UsageError({
        message: `Network ${network} is not one of off, ${[...networkProfiles.keys()].join(", ")}.`,
      });
    }
    yield* stopWatcher(state);
    const next = yield* launchWatcher(
      { ...state, cpu: Number(values.cpu ?? state.cpu), network },
      script
    );
    yield* report(
      context,
      next,
      `cpu x${next.cpu}, network ${next.network}, held by watcher pid ${next.watcherPid}`
    );
  }
);

export const rebuild = Effect.fn("rv.rebuild")(function* rebuild(
  context: CommandContext
) {
  const { print } = context;
  const state = yield* requireRun(context);
  const slots = yield* SlotStore;
  if (state.serverMode !== "preview") {
    yield* new UsageError({
      message: `A ${state.serverMode} server rebuilds itself; reload the page with rv open.`,
    });
  }
  yield* print(yield* stopServer(state));
  const served = yield* startServer(yield* build(state));
  yield* slots.writeState(served);
  yield* report(
    context,
    served,
    `rebuilt ${served.builtFrom}; server pid ${served.serverPid}`
  );
});

export const consoleCommand = Effect.fn("rv.console")(function* consoleCommand(
  context: CommandContext
) {
  const { print, rest } = context;
  const state = yield* requireRun(context);
  const evidence = yield* Evidence;
  const lines = yield* evidence.readConsole(state);
  const shown = rest[0] === "errors" ? lines.filter(isError) : lines;
  for (const line of shown) {
    yield* print(`${line.kind} ${line.level}: ${line.text}`);
  }
  yield* print(
    `${shown.length} lines from ${path.join(state.evidence, "console.jsonl")}`
  );
});
