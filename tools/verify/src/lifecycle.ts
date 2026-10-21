import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { requireRun } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { journal } from "./evidence.ts";
import {
  build,
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
  USER_PORTS,
  claimSlot,
  devtoolsPortOf,
  ensureStateDir,
  profileFor,
  readState,
  reclaimStale,
  runIdFor,
  serverPortOf,
  statePath,
  writeState,
} from "./state.ts";
import type { InstanceState, ServerMode } from "./state.ts";
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
  if (theirs && !values["user-asked"]) {
    throw new Error(
      `${url} is the user's play server or a remote one (their tunnel points at 1351). Drive it only when the user asked, and then pass --user-asked.`
    );
  }
};

const teardown = async ({ print }: CommandContext, state: InstanceState) => {
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

const bringUp = async (
  context: CommandContext,
  state: InstanceState,
  mode: ServerMode
) => {
  const { command, print, script, values } = context;
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
  const watching = await launchWatcher(browsing, script);
  print(`console watcher pid ${watching.watcherPid}`);
  await journal(command, watching, `up ${url}`);
  print(`evidence ${watching.evidence}`);
  print(`RUN=${watching.run}`);
};

export const up = async (context: CommandContext) => {
  const { print, values } = context;
  if (values.server !== undefined && values.server !== "") {
    checkExternal(context, values.server);
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
  const mode = serverModeOf(context);
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
    await bringUp(context, state, mode);
  } catch (error) {
    print("startup failed; tearing down what this run started");
    await teardown(context, (await readState(state.slot)) ?? state);
    throw error;
  }
};

export const down = async (context: CommandContext) => {
  const state = await requireRun(context);
  await journal(context.command, state, "down");
  await teardown(context, state);
};
