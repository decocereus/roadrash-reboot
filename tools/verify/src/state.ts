import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { alive, listenerOf } from "@racer/devtools/process";
import * as Schema from "effect/Schema";

export const SLOTS = 10;

const SERVER_BASE_PORT = 1410;

const DEVTOOLS_BASE_PORT = 9410;

export const USER_PORTS: ReadonlySet<number> = new Set([1350, 1351]);

export const VIEWPORT = { height: 860, scale: 2, width: 1512 } as const;

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

export const profileFor = (runId: string): string =>
  path.join(stateDir, `profile-${runId}`);

export const ensureStateDir = async (): Promise<void> => {
  await mkdir(stateDir, { recursive: true });
};
