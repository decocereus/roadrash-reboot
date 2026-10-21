import { spawn } from "node:child_process";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  awaitPortClosed,
  browsers,
  listenerOf,
  run,
  sharedFlags,
  startInBackground,
} from "@racer/devtools/chrome";
import * as Schema from "effect/Schema";

export const SLOTS = 10;
const SERVER_BASE_PORT = 1410;
const DEVTOOLS_BASE_PORT = 9410;
export const USER_PORTS: ReadonlySet<number> = new Set([1350, 1351]);
const VIEWPORT = { height: 860, scale: 2, width: 1512 } as const;

const POLL_MS = 200;
const SERVER_ATTEMPTS = 300;
const STOP_ATTEMPTS = 50;

const stateDir = path.join(tmpdir(), "rushline-verify");

const serverModes = ["preview", "dev", "external"] as const;
export type ServerMode = (typeof serverModes)[number];

const instanceState = Schema.Struct({
  browserPid: Schema.NullOr(Schema.Number),
  buildDir: Schema.NullOr(Schema.String),
  builtAt: Schema.NullOr(Schema.Number),
  builtFrom: Schema.NullOr(Schema.String),
  checkout: Schema.String,
  cpu: Schema.Number,
  devtoolsPort: Schema.Number,
  evidence: Schema.String,
  network: Schema.String,
  profile: Schema.String,
  run: Schema.String,
  serverMode: Schema.Literals(serverModes),
  serverPid: Schema.NullOr(Schema.Number),
  serverUrl: Schema.String,
  slot: Schema.Number,
  sound: Schema.Boolean,
  startedAt: Schema.String,
  upPid: Schema.Number,
  watcherPid: Schema.NullOr(Schema.Number),
});

export type InstanceState = typeof instanceState.Type;

const decodeState = Schema.decodeUnknownSync(
  Schema.fromJsonString(instanceState)
);

export const statePath = (slot: number): string =>
  path.join(stateDir, `slot-${slot}.json`);

export const serverPortOf = (slot: number): number => SERVER_BASE_PORT + slot;
export const devtoolsPortOf = (slot: number): number =>
  DEVTOOLS_BASE_PORT + slot;

export const git = async (
  cwd: string,
  args: readonly string[]
): Promise<string> => {
  const { stdout } = await run("git", [...args], { cwd });
  return stdout.trim();
};

export const checkoutRoot = async (): Promise<string> =>
  await git(process.cwd(), ["rev-parse", "--show-toplevel"]);

export const evidenceRoot = async (checkout: string): Promise<string> => {
  const common = await git(checkout, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return path.join(path.dirname(common), "tools/perf/results/verify");
};

export const readState = async (
  slot: number
): Promise<InstanceState | null> => {
  try {
    return decodeState(await readFile(statePath(slot), "utf-8"));
  } catch {
    return null;
  }
};

export const writeState = async (state: InstanceState): Promise<void> => {
  await writeFile(statePath(state.slot), JSON.stringify(state, null, 1));
};

const slotOfRun = (runId: string): number => {
  const slot = /-s(?<slot>\d)$/u.exec(runId)?.groups?.slot;
  if (slot === undefined || slot === "") {
    throw new Error(`${runId} is not a run id; rv up prints one.`);
  }
  return Number(slot);
};

export const stateOfRun = async (runId: string): Promise<InstanceState> => {
  const state = await readState(slotOfRun(runId));
  if (!state || state.run !== runId) {
    throw new Error(
      `Run ${runId} holds no instance. Another run may own the slot; never drive it. List them with rv list.`
    );
  }
  return state;
};

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

const commandOf = async (pid: number): Promise<string> => {
  try {
    const { stdout } = await run("ps", ["-o", "command=", "-p", String(pid)]);
    return stdout.trim();
  } catch {
    return "";
  }
};

const isStale = (state: InstanceState): boolean =>
  ![
    state.upPid,
    state.serverMode === "external" ? null : state.serverPid,
    state.browserPid,
    state.watcherPid,
  ].some(alive);

const slotFree = async (slot: number): Promise<boolean> => {
  const [server, devtools] = await Promise.all([
    listenerOf(serverPortOf(slot)),
    listenerOf(devtoolsPortOf(slot)),
  ]);
  return server === null && devtools === null;
};

const claim = async (state: InstanceState): Promise<boolean> => {
  try {
    await writeFile(statePath(state.slot), JSON.stringify(state, null, 1), {
      flag: "wx",
    });
    return true;
  } catch {
    return false;
  }
};

const padded = (value: number): string => String(value).padStart(2, "0");

export const runIdFor = (slot: number, at: Date): string => {
  const day = `${at.getFullYear()}${padded(at.getMonth() + 1)}${padded(at.getDate())}`;
  const time = `${padded(at.getHours())}${padded(at.getMinutes())}${padded(at.getSeconds())}`;
  return `${day}-${time}-s${slot}`;
};

export const reclaimStale = async (slot: number): Promise<string | null> => {
  const state = await readState(slot);
  if (!(state && isStale(state))) {
    return null;
  }
  await rm(statePath(slot), { force: true });
  await rm(state.profile, { force: true, recursive: true });
  return state.run;
};

export const claimSlot = async (
  candidates: readonly number[],
  draft: (slot: number) => InstanceState
): Promise<InstanceState> => {
  const [slot, ...rest] = candidates;
  if (slot === undefined) {
    throw new Error(
      `No free verification slot in ${SERVER_BASE_PORT}-${SERVER_BASE_PORT + SLOTS - 1}. Run rv list; never take a slot another run holds.`
    );
  }
  const state = draft(slot);
  if ((await slotFree(slot)) && (await claim(state))) {
    return state;
  }
  return await claimSlot(rest, draft);
};

const vitePath = (checkout: string): string =>
  path.join(checkout, "apps/web/node_modules/vite/bin/vite.js");

const webDir = (checkout: string): string => path.join(checkout, "apps/web");

const buildDirFor = (checkout: string, slot: number): string =>
  path.join(webDir(checkout), "node_modules/.rushline-verify", `slot-${slot}`);

const devEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_ENV: "development",
});

export const build = async (state: InstanceState): Promise<InstanceState> => {
  const buildDir = buildDirFor(state.checkout, state.slot);
  const sha = await git(state.checkout, ["rev-parse", "--short", "HEAD"]);
  const dirty = await git(state.checkout, ["status", "--porcelain"]);
  const builtAt = Date.now();
  const output = await run(
    process.execPath,
    [
      vitePath(state.checkout),
      "build",
      "--mode",
      "development",
      "--outDir",
      buildDir,
      "--emptyOutDir",
    ],
    { cwd: webDir(state.checkout), env: devEnv() }
  );
  await writeFile(
    path.join(state.evidence, "build.log"),
    `${output.stdout}\n${output.stderr}`
  );
  return {
    ...state,
    buildDir,
    builtAt,
    builtFrom: dirty === "" ? sha : `${sha}+uncommitted`,
  };
};

const serverArgs = (state: InstanceState): string[] => {
  const port = String(serverPortOf(state.slot));
  const common = ["--host", "127.0.0.1", "--port", port, "--strictPort"];
  if (state.serverMode === "dev") {
    return [vitePath(state.checkout), "--mode", "development", ...common];
  }
  return [
    vitePath(state.checkout),
    "preview",
    "--mode",
    "development",
    "--outDir",
    state.buildDir ?? "",
    ...common,
  ];
};

export const serverAnswers = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url);
    const body = await response.text();
    return response.ok && body.includes("<title>Rushline</title>");
  } catch {
    return false;
  }
};

const awaitServer = async (url: string, attempt: number): Promise<void> => {
  if (await serverAnswers(url)) {
    return;
  }
  if (attempt >= SERVER_ATTEMPTS) {
    throw new Error(`The server at ${url} never served the Rushline page.`);
  }
  await sleep(POLL_MS);
  await awaitServer(url, attempt + 1);
};

const spawnLogged = async (
  args: readonly string[],
  cwd: string,
  log: string
): Promise<number> => {
  const file = await open(log, "a");
  const child = spawn(process.execPath, [...args], {
    cwd,
    detached: true,
    env: devEnv(),
    stdio: ["ignore", file.fd, file.fd],
  });
  child.unref();
  await file.close();
  if (child.pid === undefined) {
    throw new Error(`Could not start ${args.join(" ")}.`);
  }
  return child.pid;
};

export const startServer = async (
  state: InstanceState
): Promise<InstanceState> => {
  const pid = await spawnLogged(
    serverArgs(state),
    webDir(state.checkout),
    path.join(state.evidence, "server.log")
  );
  const next = { ...state, serverPid: pid };
  await writeState(next);
  await awaitServer(state.serverUrl, 0);
  const listener = await listenerOf(serverPortOf(state.slot));
  if (listener !== pid) {
    throw new Error(
      `Port ${serverPortOf(state.slot)} is held by pid ${listener}, not the server this run started (${pid}).`
    );
  }
  return next;
};

export const startBrowser = async (
  state: InstanceState,
  url: string
): Promise<InstanceState> => {
  const flags = [
    ...sharedFlags(state.devtoolsPort, state.profile, VIEWPORT),
    ...(state.sound ? [] : ["--mute-audio"]),
    url,
  ];
  const pid = await startInBackground(
    browsers.helium,
    flags,
    state.devtoolsPort
  );
  return { ...state, browserPid: pid };
};

export const startWatcher = async (
  state: InstanceState,
  script: string
): Promise<InstanceState> => {
  const pid = await spawnLogged(
    [script, "watch", "--run", state.run],
    state.checkout,
    path.join(state.evidence, "watch.log")
  );
  return { ...state, watcherPid: pid };
};

const awaitGone = async (pid: number, attempt: number): Promise<boolean> => {
  if (!alive(pid)) {
    return true;
  }
  if (attempt >= STOP_ATTEMPTS) {
    return false;
  }
  await sleep(POLL_MS);
  return await awaitGone(pid, attempt + 1);
};

const stopOwned = async (
  pid: number | null,
  expect: string
): Promise<string> => {
  if (pid === null || !alive(pid)) {
    return "already gone";
  }
  const command = await commandOf(pid);
  if (!command.includes(expect)) {
    return `left alone: pid ${pid} is now "${command.slice(0, 80)}", not ours`;
  }
  process.kill(pid, "SIGTERM");
  if (await awaitGone(pid, 0)) {
    return `stopped pid ${pid}`;
  }
  process.kill(pid, "SIGKILL");
  return `killed pid ${pid} after SIGTERM timed out`;
};

export const stopServer = async (state: InstanceState): Promise<string> => {
  if (state.serverMode === "external") {
    return "external server left running";
  }
  const result = await stopOwned(state.serverPid, "vite.js");
  await awaitPortClosed(serverPortOf(state.slot));
  return result;
};

export const stopBrowser = async (state: InstanceState): Promise<string> => {
  const result = await stopOwned(state.browserPid, "Helium");
  await awaitPortClosed(state.devtoolsPort);
  return result;
};

export const stopWatcher = async (state: InstanceState): Promise<string> =>
  await stopOwned(state.watcherPid, "rushline.ts");

export const newestSourceChange = async (checkout: string): Promise<number> => {
  const roots = ["apps/web/src", "apps/web/public", "packages"].map((each) =>
    path.join(checkout, each)
  );
  const listed = await Promise.all(
    roots.map(async (root) => {
      const names = await readdir(root, { recursive: true });
      return names
        .filter((name) => !name.includes("node_modules"))
        .map((name) => path.join(root, name));
    })
  );
  const times = await Promise.all(
    listed.flat().map(async (file) => {
      const info = await stat(file);
      return info.mtimeMs;
    })
  );
  return Math.max(0, ...times);
};

export const profileFor = (runId: string): string =>
  path.join(stateDir, `profile-${runId}`);

export const ensureStateDir = async (): Promise<void> => {
  await mkdir(stateDir, { recursive: true });
};
