import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  awaitPortClosed,
  browsers,
  sharedFlags,
  startInBackground,
} from "@racer/devtools/chrome";
import { spawnLogged } from "@racer/devtools/node/detached-process";
import { listenerOf, run, stopOwned } from "@racer/devtools/process";

import { VIEWPORT, serverPortOf, writeState } from "./state.ts";
import type { InstanceState } from "./state.ts";

const POLL_MS = 200;

const SERVER_ATTEMPTS = 300;

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

export const startServer = async (
  state: InstanceState
): Promise<InstanceState> => {
  const pid = await spawnLogged(
    serverArgs(state),
    webDir(state.checkout),
    path.join(state.evidence, "server.log"),
    devEnv()
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
    path.join(state.evidence, "watch.log"),
    devEnv()
  );
  return { ...state, watcherPid: pid };
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
