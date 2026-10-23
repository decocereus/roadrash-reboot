import { tmpdir } from "node:os";
import path from "node:path";

import { ToolProcesses, alive } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import { VerificationError } from "./verification-error.ts";

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

const decodeState = Schema.decodeUnknownOption(
  Schema.fromJsonString(instanceState)
);

export const statePath = (slot: number): string =>
  path.join(stateDir, `slot-${slot}.json`);

export const serverPortOf = (slot: number): number => SERVER_BASE_PORT + slot;

export const devtoolsPortOf = (slot: number): number =>
  DEVTOOLS_BASE_PORT + slot;

const slotOfRun = (runId: string) => {
  const slot = /-s(?<slot>\d)$/u.exec(runId)?.groups?.slot;
  return slot === undefined || slot === ""
    ? Effect.fail(
        new UsageError({
          message: `${runId} is not a run id; rv up prints one.`,
        })
      )
    : Effect.succeed(Number(slot));
};

const isStale = (state: InstanceState): boolean =>
  ![
    state.upPid,
    state.serverMode === "external" ? null : state.serverPid,
    state.browserPid,
    state.watcherPid,
  ].some(alive);

const padded = (value: number): string => String(value).padStart(2, "0");

export const runIdFor = (slot: number, at: Date): string => {
  const day = `${at.getFullYear()}${padded(at.getMonth() + 1)}${padded(at.getDate())}`;
  const time = `${padded(at.getHours())}${padded(at.getMinutes())}${padded(at.getSeconds())}`;
  return `${day}-${time}-s${slot}`;
};

export const profileFor = (runId: string): string =>
  path.join(stateDir, `profile-${runId}`);

export class SlotStore extends Context.Service<
  SlotStore,
  {
    readonly ensureStateDir: Effect.Effect<void, PlatformError.PlatformError>;
    readonly readState: (
      slot: number
    ) => Effect.Effect<InstanceState | null, PlatformError.PlatformError>;
    readonly writeState: (
      state: InstanceState
    ) => Effect.Effect<void, PlatformError.PlatformError>;
    readonly stateOfRun: (
      runId: string
    ) => Effect.Effect<
      InstanceState,
      UsageError | VerificationError | PlatformError.PlatformError
    >;
    readonly reclaimStale: (
      slot: number
    ) => Effect.Effect<string | null, PlatformError.PlatformError>;
    readonly claimSlot: (
      candidates: readonly number[],
      draft: (slot: number) => InstanceState
    ) => Effect.Effect<
      InstanceState,
      VerificationError | PlatformError.PlatformError
    >;
    readonly releaseClaim: (
      state: InstanceState
    ) => Effect.Effect<void, PlatformError.PlatformError>;
  }
>()("@racer/verify/SlotStore") {
  static readonly layer = Layer.effect(SlotStore)(
    Effect.gen(function* makeSlotStore() {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ToolProcesses;

      const readState = (slot: number) =>
        fs.readFileString(statePath(slot), "utf-8").pipe(
          Effect.map((text) => Option.getOrNull(decodeState(text))),
          Effect.catchReason("PlatformError", "NotFound", () =>
            Effect.succeed(null)
          )
        );

      const writeState = (state: InstanceState) =>
        fs.writeFileString(
          statePath(state.slot),
          JSON.stringify(state, null, 1)
        );

      const stateOfRun = Effect.fn("SlotStore.stateOfRun")(function* stateOfRun(
        runId: string
      ) {
        const state = yield* readState(yield* slotOfRun(runId));
        if (!state || state.run !== runId) {
          return yield* new VerificationError({
            message: `Run ${runId} holds no instance. Another run may own the slot; never drive it. List them with rv list.`,
            operation: "find",
            run: runId,
          });
        }
        return state;
      });

      const slotFree = (slot: number) =>
        Effect.all(
          [
            processes.listenerOf(serverPortOf(slot)),
            processes.listenerOf(devtoolsPortOf(slot)),
          ],
          { concurrency: "unbounded" }
        ).pipe(
          Effect.map(
            ([server, devtools]) => server === null && devtools === null
          )
        );

      const claim = (state: InstanceState) =>
        fs
          .writeFileString(
            statePath(state.slot),
            JSON.stringify(state, null, 1),
            { flag: "wx" }
          )
          .pipe(
            Effect.as(true),
            Effect.catchReason("PlatformError", "AlreadyExists", () =>
              Effect.succeed(false)
            )
          );

      const reclaimStale = Effect.fn("SlotStore.reclaimStale")(
        function* reclaimStale(slot: number) {
          const state = yield* readState(slot);
          if (!(state && isStale(state))) {
            return null;
          }
          yield* fs.remove(statePath(slot), { force: true });
          yield* fs.remove(state.profile, { force: true, recursive: true });
          return state.run;
        }
      );

      const claimSlot = Effect.fn("SlotStore.claimSlot")(function* claimSlot(
        candidates: readonly number[],
        draft: (slot: number) => InstanceState
      ) {
        for (const slot of candidates) {
          const state = draft(slot);
          if ((yield* slotFree(slot)) && (yield* claim(state))) {
            return state;
          }
        }
        return yield* new VerificationError({
          message: `No free verification slot in ${SERVER_BASE_PORT}-${SERVER_BASE_PORT + SLOTS - 1}. Run rv list; never take a slot another run holds.`,
          operation: "claim",
        });
      });

      const releaseClaim = Effect.fn("SlotStore.releaseClaim")(
        function* releaseClaim(state: InstanceState) {
          const current = yield* readState(state.slot);
          if (current?.run === state.run) {
            yield* fs.remove(statePath(state.slot), { force: true });
          }
        }
      );

      return SlotStore.of({
        claimSlot,
        ensureStateDir: fs.makeDirectory(stateDir, { recursive: true }),
        readState,
        reclaimStale,
        releaseClaim,
        stateOfRun,
        writeState,
      });
    })
  );
}
