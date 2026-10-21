import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

import { evaluate } from "@racer/devtools/cdp";
import { alive } from "@racer/devtools/process";
import * as Schema from "effect/Schema";

import { ariaSnapshot, screencast, screenshot } from "./capture.ts";
import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { evidenceFile, isError, journal, readConsole } from "./evidence.ts";
import { click, press } from "./input.ts";
import { build, startServer, stopServer, stopWatcher } from "./instance.ts";
import { expressionFor, navigate, waitFor, withPage } from "./page.ts";
import { networkProfiles, sample, trace } from "./profile.ts";
import { SLOTS, readState, writeState } from "./state.ts";
import { launchWatcher } from "./watcher.ts";

export const listSlots = async ({ print }: CommandContext) => {
  const states = await Promise.all(
    Array.from({ length: SLOTS }, async (_, slot) => await readState(slot))
  );
  const held = states.filter((each) => each !== null);
  if (held.length === 0) {
    print("no verification runs hold a slot");
  }
  for (const state of held) {
    print(
      `slot ${state.slot}  run ${state.run}  ${state.serverUrl}  devtools ${state.devtoolsPort}  server ${alive(state.serverPid) ? "up" : "down"}  helium ${alive(state.browserPid) ? "up" : "down"}  from ${state.checkout}`
    );
  }
};

export const openPage = async (context: CommandContext) => {
  const { command, deadline, print, rest, values } = context;
  const state = await requireRun(context);
  const [target = values.path] = rest;
  const url = new URL(target, state.serverUrl);
  if (url.origin !== new URL(state.serverUrl).origin) {
    throw new Error(`Open paths on this run's server only, not ${url.origin}.`);
  }
  const started = Date.now();
  const result = await withPage(state, async (page) => {
    await navigate(page, url.href, deadline());
    const loaded = Date.now() - started;
    if (values.until !== undefined && values.until !== "") {
      await waitFor(page, expressionFor(values.until), deadline());
      return `loaded in ${loaded} ms; ${values.until} after ${Date.now() - started} ms`;
    }
    return `loaded in ${loaded} ms`;
  });
  print(`${url.href}: ${result}`);
  await journal(command, state, `${url.href}: ${result}`);
};

export const jsCommand = async (context: CommandContext) => {
  const { command, print, rest } = context;
  const state = await requireRun(context);
  const expression = rest.join(" ");
  const value = await withPage(
    state,
    async (page) =>
      await evaluate(
        page,
        `(async () => JSON.stringify(await (${expression})) ?? "undefined")()`,
        Schema.String
      )
  );
  print(value);
  await journal(command, state, value.slice(0, 2000));
};

export const waitCommand = async (context: CommandContext) => {
  const { command, deadline, print, rest } = context;
  const state = await requireRun(context);
  const expression = expressionFor(rest.join(" "));
  const started = Date.now();
  const value = await withPage(
    state,
    async (page) => await waitFor(page, expression, deadline())
  );
  const result = `${value} after ${Date.now() - started} ms`;
  print(result);
  await journal(command, state, result);
};

export const pressCommand = async (context: CommandContext) => {
  const { command, print, rest, values } = context;
  const state = await requireRun(context);
  const hold = Number(values.hold);
  await withPage(state, async (page) => {
    await press(page, rest, hold);
  });
  const result = `pressed ${rest.join("+")} for ${hold} ms`;
  print(result);
  await journal(command, state, result);
};

export const clickCommand = async (context: CommandContext) => {
  const { command, print, rest, values } = context;
  const state = await requireRun(context);
  const label = await withPage(
    state,
    async (page) => await click(page, rest.join(" "), values.within)
  );
  const result = `clicked ${label}`;
  print(result);
  await journal(command, state, result);
};

export const shotCommand = async (context: CommandContext) => {
  const { command, print, rest } = context;
  const state = await requireRun(context);
  const file = evidenceFile(state, `${rest[0] ?? ""}.png`);
  await withPage(state, async (page) => await screenshot(page, file));
  print(file);
  await journal(command, state, file);
};

export const ariaCommand = async (context: CommandContext) => {
  const { command, print, rest } = context;
  const state = await requireRun(context);
  const file = evidenceFile(state, `${rest[0] ?? ""}.aria.txt`);
  const lines = await withPage(
    state,
    async (page) => await ariaSnapshot(page, file)
  );
  print(`${file} (${lines} nodes)`);
  print(await readFile(file, "utf-8"));
  await journal(command, state, file);
};

export const screencastCommand = async (context: CommandContext) => {
  const { command, print, rest, values } = context;
  const state = await requireRun(context);
  const dir = evidenceFile(state, rest[0] ?? "");
  const cast = await withPage(
    state,
    async (page) =>
      await screencast(page, dir, Number(values.seconds), Number(values.every))
  );
  const result = `${cast.frames} frames in ${cast.seconds} s (${(cast.frames / cast.seconds).toFixed(1)} per s) in ${cast.dir}`;
  print(result);
  await journal(command, state, result);
};

export const traceCommand = async (context: CommandContext) => {
  const { command, print, rest, values } = context;
  const state = await requireRun(context);
  const file = evidenceFile(state, `${rest[0] ?? ""}.trace.json`);
  const traced = await withPage(
    state,
    async (page) => await trace(page, file, Number(values.seconds))
  );
  const { summary } = traced;
  print(
    `${file}: ${traced.events} events; long tasks ${summary.longTasks.count}, longest task ${summary.longestTaskMs.toFixed(1)} ms; minor gc ${summary.minorGc.count} (${summary.minorGc.totalMs.toFixed(1)} ms); major gc ${summary.majorGc.count} (${summary.majorGc.totalMs.toFixed(1)} ms); cpu x${state.cpu}, network ${state.network}`
  );
  for (const each of traced.threads) {
    print(`  ${each.busyMs.toFixed(0).padStart(7)} ms busy  ${each.thread}`);
  }
  await journal(
    command,
    state,
    `${file}: longest task ${summary.longestTaskMs.toFixed(1)} ms`
  );
};

export const sampleCommand = async (context: CommandContext) => {
  const { command, print, rest, values } = context;
  const state = await requireRun(context);
  const file = evidenceFile(state, `${rest[0] ?? ""}.sample.json`);
  const sampled = await withPage(
    state,
    async (page) => await sample(page, Number(values.seconds))
  );
  const { interval } = sampled;
  const result = `ticks ${sampled.fromTick}-${sampled.toTick}: ${sampled.frames} frames, ${sampled.fps.toFixed(1)} fps, frame p50 ${interval.p50.toFixed(1)} p95 ${interval.p95.toFixed(1)} p99 ${interval.p99.toFixed(1)} worst ${interval.max.toFixed(1)} ms, late ${JSON.stringify(sampled.late)}, js ${sampled.jsFrame.mean.toFixed(2)} ms/frame, ${sampled.calls.toFixed(0)} calls, ratio ${sampled.pixelRatios.join(",")}, rung ${sampled.rungs.join(",")}, cpu x${state.cpu}, network ${state.network}`;
  await appendFile(
    file,
    `${JSON.stringify({ cpu: state.cpu, network: state.network, ...sampled }, null, 1)}\n`
  );
  print(result);
  print(file);
  await journal(command, state, result);
};

export const throttleCommand = async (context: CommandContext) => {
  const { command, print, script, values } = context;
  const state = await requireRun(context);
  const network = values.network ?? state.network;
  if (network !== "off" && !networkProfiles.has(network)) {
    throw new Error(
      `Network ${network} is not one of off, ${[...networkProfiles.keys()].join(", ")}.`
    );
  }
  await stopWatcher(state);
  const next = await launchWatcher(
    {
      ...state,
      cpu: Number(values.cpu ?? state.cpu),
      network,
    },
    script
  );
  const result = `cpu x${next.cpu}, network ${next.network}, held by watcher pid ${next.watcherPid}`;
  print(result);
  await journal(command, next, result);
};

export const rebuild = async (context: CommandContext) => {
  const { command, print } = context;
  const state = await requireRun(context);
  if (state.serverMode !== "preview") {
    throw new Error(
      `A ${state.serverMode} server rebuilds itself; reload the page with rv open.`
    );
  }
  print(await stopServer(state));
  const built = await build(state);
  const served = await startServer(built);
  await writeState(served);
  const result = `rebuilt ${served.builtFrom}; server pid ${served.serverPid}`;
  print(result);
  await journal(command, served, result);
};

export const consoleCommand = async (context: CommandContext) => {
  const { print, rest } = context;
  const state = await requireRun(context);
  const lines = await readConsole(state);
  const shown = rest[0] === "errors" ? lines.filter(isError) : lines;
  for (const line of shown) {
    print(`${line.kind} ${line.level}: ${line.text}`);
  }
  print(
    `${shown.length} lines from ${path.join(state.evidence, "console.jsonl")}`
  );
};
