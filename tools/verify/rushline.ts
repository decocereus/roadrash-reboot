import { createWriteStream } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import * as Schema from "effect/Schema";

import { connect, evaluate } from "../perf/cdp.ts";
import type { Session } from "../perf/cdp.ts";
import { listenerOf, pageTarget } from "../perf/chrome.ts";
import {
  SLOTS,
  USER_PORTS,
  alive,
  build,
  checkoutRoot,
  claimSlot,
  devtoolsPortOf,
  ensureStateDir,
  evidenceRoot,
  git,
  newestSourceChange,
  profileFor,
  readState,
  reclaimStale,
  runIdFor,
  serverAnswers,
  serverPortOf,
  startBrowser,
  startServer,
  startWatcher,
  stateOfRun,
  statePath,
  stopBrowser,
  stopServer,
  stopWatcher,
  writeState,
} from "./instance.ts";
import type { InstanceState, ServerMode } from "./instance.ts";
import {
  ariaSnapshot,
  attach,
  click,
  expressionFor,
  navigate,
  networkProfiles,
  press,
  sample,
  screencast,
  screenshot,
  throttle,
  trace,
  waitFor,
} from "./page.ts";

const SCRIPT = import.meta.filename;
const DEFAULT_TIMEOUT_S = 60;
const WATCH_ATTEMPTS = 100;
const WATCH_POLL_MS = 100;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    cpu: { type: "string" },
    dev: { default: false, type: "boolean" },
    every: { default: "1", type: "string" },
    hold: { default: "120", type: "string" },
    network: { type: "string" },
    path: { default: "/", type: "string" },
    run: { type: "string" },
    seconds: { default: "5", type: "string" },
    server: { type: "string" },
    slot: { type: "string" },
    sound: { default: false, type: "boolean" },
    timeout: { default: String(DEFAULT_TIMEOUT_S), type: "string" },
    until: { type: "string" },
    "user-asked": { default: false, type: "boolean" },
    within: { default: "", type: "string" },
  },
});

const [command = "help", ...rest] = positionals;

const deadline = (): number => Date.now() + Number(values.timeout) * 1000;

const print = (line: string) => {
  process.stdout.write(`${line}\n`);
};

const requireRun = async (): Promise<InstanceState> => {
  if (values.run === undefined || values.run === "") {
    throw new Error("Pass --run <id>; rv up prints it.");
  }
  return await stateOfRun(values.run);
};

const journal = async (state: InstanceState, result: string) => {
  await appendFile(
    path.join(state.evidence, "journal.jsonl"),
    `${JSON.stringify({ args: process.argv.slice(3), at: new Date().toISOString(), command, result })}\n`
  );
};

const withPage = async <T>(
  state: InstanceState,
  act: (page: Session) => Promise<T>
): Promise<T> => {
  const page = await attach(state);
  try {
    return await act(page);
  } finally {
    page.close();
  }
};

const evidenceFile = (state: InstanceState, name: string): string => {
  if (name === "" || name.includes("/") || name.startsWith(".")) {
    throw new Error("Name the artifact with a plain file name, like jump-air.");
  }
  return path.join(state.evidence, name);
};

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

const watch = async () => {
  const state = await requireRun();
  const socket = await pageTarget(state.devtoolsPort, "http");
  if (socket === undefined || socket === "") {
    throw new Error("The watcher found no page to attach to.");
  }
  const page = await connect(socket);
  const out = createWriteStream(path.join(state.evidence, "console.jsonl"), {
    flags: "a",
  });
  const write = (kind: string, level: string, text: string) => {
    out.write(
      `${JSON.stringify({ at: new Date().toISOString(), kind, level, text })}\n`
    );
  };
  page.on("Runtime.consoleAPICalled", consoleCall, (call) => {
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
  page.on("Runtime.exceptionThrown", thrown, ({ exceptionDetails }) => {
    write(
      "exception",
      "error",
      exceptionDetails.exception?.description ?? exceptionDetails.text
    );
  });
  page.on("Log.entryAdded", logEntry, ({ entry }) => {
    write(
      `log:${entry.source}`,
      entry.level,
      `${entry.text}${entry.url !== undefined && entry.url !== "" ? ` (${entry.url})` : ""}`
    );
  });
  page.on("Page.frameNavigated", navigated, ({ frame }) => {
    if (frame.parentId === undefined) {
      write("navigate", "info", frame.url);
    }
  });
  await page.send("Page.enable");
  await page.send("Log.enable");
  await page.send("Runtime.enable");
  await throttle(page, state.cpu, state.network);
  write(
    "watch",
    "info",
    `attached; cpu x${state.cpu}; network ${state.network}`
  );
};

const watcherAttached = async (
  state: InstanceState,
  attempt: number
): Promise<boolean> => {
  const text = await readFile(
    path.join(state.evidence, "console.jsonl"),
    "utf-8"
  ).catch(() => "");
  if (text.includes(`attached; cpu x${state.cpu}; network ${state.network}`)) {
    return true;
  }
  if (attempt >= WATCH_ATTEMPTS) {
    return false;
  }
  await sleep(WATCH_POLL_MS);
  return await watcherAttached(state, attempt + 1);
};

const launchWatcher = async (state: InstanceState): Promise<InstanceState> => {
  const next = await startWatcher(state, SCRIPT);
  await writeState(next);
  if (!(await watcherAttached(next, 0))) {
    throw new Error(
      `The console watcher did not attach; read ${path.join(state.evidence, "watch.log")}.`
    );
  }
  return next;
};

const serverModeOf = (): ServerMode => {
  if (values.server !== undefined && values.server !== "") {
    return "external";
  }
  return values.dev ? "dev" : "preview";
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

const checkExternal = (url: string) => {
  const { hostname, port } = new URL(url);
  const theirs = USER_PORTS.has(Number(port)) || !LOOPBACK.has(hostname);
  if (theirs && !values["user-asked"]) {
    throw new Error(
      `${url} is the user's play server or a remote one (their tunnel points at 1351). Drive it only when the user asked, and then pass --user-asked.`
    );
  }
};

const teardown = async (state: InstanceState) => {
  print(`watcher: ${await stopWatcher(state)}`);
  print(`helium: ${await stopBrowser(state)}`);
  print(`server: ${await stopServer(state)}`);
  await rm(state.profile, { force: true, recursive: true });
  if (state.buildDir !== null && state.buildDir !== "") {
    await rm(state.buildDir, { force: true, recursive: true });
  }
  await rm(statePath(state.slot), { force: true });
  const left = await readdir(state.evidence).catch(() => []);
  print(`released slot ${state.slot}; removed the profile and the build`);
  print(`evidence kept: ${state.evidence} (${left.length} entries)`);
};

const bringUp = async (state: InstanceState, mode: ServerMode) => {
  await mkdir(state.evidence, { recursive: true });
  await mkdir(state.profile, { recursive: true });
  const built = mode === "preview" ? await build(state) : state;
  if (built.builtFrom !== null && built.builtFrom !== "") {
    print(`built ${built.builtFrom} into ${built.buildDir}`);
  }
  const served = mode === "external" ? built : await startServer(built);
  if (mode === "external" && !(await serverAnswers(served.serverUrl))) {
    throw new Error(`${served.serverUrl} does not serve Rushline.`);
  }
  print(
    `server ${served.serverUrl} (${mode}, pid ${served.serverPid ?? "not ours"})`
  );
  const url = new URL(values.path, served.serverUrl).href;
  const browsing = await startBrowser(served, url);
  await writeState(browsing);
  print(
    `helium pid ${browsing.browserPid}, devtools ${browsing.devtoolsPort}, opened ${url}`
  );
  const watching = await launchWatcher(browsing);
  print(`console watcher pid ${watching.watcherPid}`);
  await journal(watching, `up ${url}`);
  print(`evidence ${watching.evidence}`);
  print(`RUN=${watching.run}`);
};

const up = async () => {
  if (values.server !== undefined && values.server !== "") {
    checkExternal(values.server);
  }
  await ensureStateDir();
  const reclaimed = await Promise.all(
    Array.from({ length: SLOTS }, async (_, slot) => await reclaimStale(slot))
  );
  for (const each of reclaimed.filter(Boolean)) {
    print(`reclaimed stale slot of run ${each}; none of its processes lived`);
  }
  const checkout = await checkoutRoot();
  const evidenceBase = await evidenceRoot(checkout);
  const wanted = values.slot === undefined ? null : Number(values.slot);
  const startedAt = new Date();
  const mode = serverModeOf();
  const state = await claimSlot(
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
  );
  print(
    `run ${state.run}: slot ${state.slot}, claimed ${statePath(state.slot)}`
  );
  try {
    await bringUp(state, mode);
  } catch (error) {
    print("startup failed; tearing down what this run started");
    await teardown((await readState(state.slot)) ?? state);
    throw error;
  }
};

const check = (ok: boolean, label: string, detail: string): boolean => {
  print(`${ok ? "ok  " : "FAIL"} ${label}: ${detail}`);
  return ok;
};

const pageFacts = Schema.Struct({
  gl: Schema.String,
  href: Schema.String,
  profiled: Schema.Boolean,
  title: Schema.String,
  visibility: Schema.String,
});

const consoleLine = Schema.Struct({
  kind: Schema.String,
  level: Schema.String,
  text: Schema.String,
});

const decodeConsoleLine = Schema.decodeUnknownSync(
  Schema.fromJsonString(consoleLine)
);

const readConsole = async (
  state: InstanceState
): Promise<(typeof consoleLine.Type)[]> => {
  const text = await readFile(
    path.join(state.evidence, "console.jsonl"),
    "utf-8"
  ).catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => decodeConsoleLine(line));
};

const KNOWN_NOISE = "favicon.ico";

const isError = (line: typeof consoleLine.Type): boolean =>
  (line.level === "error" || line.kind === "exception") &&
  !line.text.includes(KNOWN_NOISE);

const doctor = async () => {
  const state = await requireRun();
  const results: boolean[] = [];
  const owned = state.serverMode !== "external";
  const serverPort = Number(new URL(state.serverUrl).port);
  const serverListener = await listenerOf(serverPort);
  results.push(
    check(
      owned ? serverListener === state.serverPid : serverListener !== null,
      "server process",
      `${state.serverMode} on ${serverPort}, listener pid ${serverListener}, recorded ${state.serverPid ?? "external"}`
    ),
    check(
      await serverAnswers(state.serverUrl),
      "server answers",
      state.serverUrl
    )
  );
  if (state.serverMode === "preview" && state.builtAt !== null) {
    const head = await git(state.checkout, ["rev-parse", "--short", "HEAD"]);
    const changed = await newestSourceChange(state.checkout);
    results.push(
      check(
        changed <= state.builtAt && state.builtFrom?.startsWith(head) === true,
        "build is current",
        `built from ${state.builtFrom} at ${new Date(state.builtAt).toISOString()}; HEAD ${head}; newest source edit ${new Date(changed).toISOString()}${changed > state.builtAt ? " (after the build: run rv rebuild)" : ""}`
      )
    );
  }
  const browserListener = await listenerOf(state.devtoolsPort);
  results.push(
    check(
      browserListener !== null && browserListener === state.browserPid,
      "helium process",
      `devtools ${state.devtoolsPort}, listener pid ${browserListener}, recorded ${state.browserPid}`
    ),
    check(
      alive(state.watcherPid),
      "console watcher",
      `pid ${state.watcherPid}, cpu x${state.cpu}, network ${state.network}`
    )
  );
  if (browserListener === null) {
    process.exitCode = 1;
    return;
  }
  const facts = await withPage(
    state,
    async (page) =>
      await evaluate(
        page,
        `(() => { const gl = document.createElement("canvas").getContext("webgl2"); const info = gl && gl.getExtension("WEBGL_debug_renderer_info"); return { gl: gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : "no WebGL 2", href: location.href, profiled: Boolean(globalThis.__rushlineProfile), title: document.title, visibility: document.visibilityState }; })()`,
        pageFacts
      )
  );
  results.push(
    check(
      facts.href.startsWith(new URL(state.serverUrl).origin),
      "page",
      `${facts.title} at ${facts.href}${facts.profiled ? ", frame recorder on" : ""}`
    ),
    check(
      facts.visibility === "visible",
      "page visible",
      `${facts.visibility}; a hidden page pauses the race and stops frames`
    ),
    check(
      facts.gl.includes("Metal") && !facts.gl.includes("SwiftShader"),
      "gpu",
      facts.gl
    )
  );
  const lines = await readConsole(state);
  const errors = lines.filter(isError);
  results.push(
    check(
      errors.length === 0,
      "console errors",
      errors.length === 0
        ? "none"
        : `${errors.length}; last: ${errors.at(-1)?.text.slice(0, 200)}`
    )
  );
  if (results.includes(false)) {
    process.exitCode = 1;
  }
};

const listSlots = async () => {
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

const openPage = async () => {
  const state = await requireRun();
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
  await journal(state, `${url.href}: ${result}`);
};

const jsCommand = async () => {
  const state = await requireRun();
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
  await journal(state, value.slice(0, 2000));
};

const waitCommand = async () => {
  const state = await requireRun();
  const expression = expressionFor(rest.join(" "));
  const started = Date.now();
  const value = await withPage(
    state,
    async (page) => await waitFor(page, expression, deadline())
  );
  const result = `${value} after ${Date.now() - started} ms`;
  print(result);
  await journal(state, result);
};

const pressCommand = async () => {
  const state = await requireRun();
  const hold = Number(values.hold);
  await withPage(state, async (page) => {
    await press(page, rest, hold);
  });
  const result = `pressed ${rest.join("+")} for ${hold} ms`;
  print(result);
  await journal(state, result);
};

const clickCommand = async () => {
  const state = await requireRun();
  const label = await withPage(
    state,
    async (page) => await click(page, rest.join(" "), values.within)
  );
  const result = `clicked ${label}`;
  print(result);
  await journal(state, result);
};

const shotCommand = async () => {
  const state = await requireRun();
  const file = evidenceFile(state, `${rest[0] ?? ""}.png`);
  await withPage(state, async (page) => await screenshot(page, file));
  print(file);
  await journal(state, file);
};

const ariaCommand = async () => {
  const state = await requireRun();
  const file = evidenceFile(state, `${rest[0] ?? ""}.aria.txt`);
  const lines = await withPage(
    state,
    async (page) => await ariaSnapshot(page, file)
  );
  print(`${file} (${lines} nodes)`);
  print(await readFile(file, "utf-8"));
  await journal(state, file);
};

const screencastCommand = async () => {
  const state = await requireRun();
  const dir = evidenceFile(state, rest[0] ?? "");
  const cast = await withPage(
    state,
    async (page) =>
      await screencast(page, dir, Number(values.seconds), Number(values.every))
  );
  const result = `${cast.frames} frames in ${cast.seconds} s (${(cast.frames / cast.seconds).toFixed(1)} per s) in ${cast.dir}`;
  print(result);
  await journal(state, result);
};

const traceCommand = async () => {
  const state = await requireRun();
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
    state,
    `${file}: longest task ${summary.longestTaskMs.toFixed(1)} ms`
  );
};

const sampleCommand = async () => {
  const state = await requireRun();
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
  await journal(state, result);
};

const throttleCommand = async () => {
  const state = await requireRun();
  const network = values.network ?? state.network;
  if (network !== "off" && !networkProfiles.has(network)) {
    throw new Error(
      `Network ${network} is not one of off, ${[...networkProfiles.keys()].join(", ")}.`
    );
  }
  await stopWatcher(state);
  const next = await launchWatcher({
    ...state,
    cpu: Number(values.cpu ?? state.cpu),
    network,
  });
  const result = `cpu x${next.cpu}, network ${next.network}, held by watcher pid ${next.watcherPid}`;
  print(result);
  await journal(next, result);
};

const rebuild = async () => {
  const state = await requireRun();
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
  await journal(served, result);
};

const consoleCommand = async () => {
  const state = await requireRun();
  const lines = await readConsole(state);
  const shown = rest[0] === "errors" ? lines.filter(isError) : lines;
  for (const line of shown) {
    print(`${line.kind} ${line.level}: ${line.text}`);
  }
  print(
    `${shown.length} lines from ${path.join(state.evidence, "console.jsonl")}`
  );
};

const down = async () => {
  const state = await requireRun();
  await journal(state, "down");
  await teardown(state);
};

const HELP = `rv: drive a Rushline verification instance in a windowed Helium over DevTools

  rv up [--dev] [--path /?ride=...] [--slot n] [--cpu n] [--network fast4g|slow4g|3g] [--sound]
  rv up --server http://127.0.0.1:1351/ --user-asked     only when the user said to drive their server
  rv list
  rv doctor     --run <id>
  rv open       --run <id> /?ride=slag-row&autopilot&prof [--until title|race|held|<js>]
  rv js         --run <id> <js expression>
  rv wait       --run <id> title|race|held|<js> [--timeout s]
  rv press      --run <id> ArrowUp KeyJ [--hold ms]
  rv click      --run <id> <visible label> [--within <aria-label>]
  rv shot       --run <id> <name>
  rv aria       --run <id> <name>
  rv screencast --run <id> <name> [--seconds s] [--every n]
  rv trace      --run <id> <name> [--seconds s]
  rv sample     --run <id> <name> [--seconds s]
  rv throttle   --run <id> [--cpu n] [--network off|fast4g|slow4g|3g]
  rv console    --run <id> [errors]
  rv rebuild    --run <id>
  rv down       --run <id>`;

const commands = new Map<string, () => Promise<void>>([
  ["aria", ariaCommand],
  ["click", clickCommand],
  ["console", consoleCommand],
  ["doctor", doctor],
  ["down", down],
  ["js", jsCommand],
  ["list", listSlots],
  ["open", openPage],
  ["press", pressCommand],
  ["rebuild", rebuild],
  ["sample", sampleCommand],
  ["screencast", screencastCommand],
  ["shot", shotCommand],
  ["throttle", throttleCommand],
  ["trace", traceCommand],
  ["up", up],
  ["wait", waitCommand],
  ["watch", watch],
]);

const chosen = commands.get(command);
if (chosen) {
  try {
    await chosen();
  } catch (error) {
    process.stderr.write(
      `rv ${command}: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
} else {
  print(HELP);
}
