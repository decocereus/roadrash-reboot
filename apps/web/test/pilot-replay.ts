import { recordedRules } from "@racer/career/bench";
import type { CareerRaceSetup } from "@racer/career/field";
import { createRaceLog, recordTick } from "@racer/career/outcome";
import type { RaceLog, RaceResult } from "@racer/career/outcome";
import type { RoadId } from "@racer/career/tables";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import {
  restoreInto,
  snapshotCapacity,
  writeSnapshot,
} from "@racer/sim/snapshot";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { hashBytes, hashText } from "@racer/sim/snapshot-hash";
import { setupDigest } from "@racer/sim/snapshot-setup";
import { PLAYER_RIDER, riderModes } from "@racer/sim/state";
import type {
  Controller,
  InputFrame,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import type { Track } from "@racer/track/track";

import { benchPlan } from "../src/career/bench.ts";
import { planFor } from "../src/career/flow.ts";
import { hasherFor } from "./race-hash.ts";
import type { RaceHasher } from "./race-hash.ts";

export const TICK_LIMIT = 54_000;
export const WINDOW = { from: 2880, to: 3480 };

export interface ReplayCase {
  readonly id: string;
  readonly setup: () => CareerRaceSetup;
}

const quickRace = (roadId: RoadId, seed: number): ReplayCase => ({
  id: `${roadId}/level5/seed${seed}`,
  setup: () =>
    planFor(recordedRules, null, {
      bikeId: "ostra-sesta-600",
      level: 5,
      mode: "quick",
      roadId,
      seed,
    }).setup,
});

const roads: readonly RoadId[] = ["ridge-road", "slag-row"];
const seeds: readonly number[] = [1, 5, 9, 31];

export const replayCases: readonly ReplayCase[] = [
  ...roads.flatMap((roadId) => seeds.map((seed) => quickRace(roadId, seed))),
  { id: "stress/seed8", setup: () => benchPlan("stress").setup },
];

const CHAIN_BYTES = 8 * HASH_WORDS;
const CHAIN_WORD_BYTES = 4;

interface Chain {
  readonly words: Uint32Array;
  readonly scratch: DataView;
}

const openChain = (): Chain => ({
  scratch: new DataView(new ArrayBuffer(CHAIN_BYTES)),
  words: new Uint32Array(HASH_WORDS),
});

const foldChain = (chain: Chain, frame: Uint32Array): void => {
  for (let word = 0; word < HASH_WORDS; word += 1) {
    chain.scratch.setUint32(
      word * CHAIN_WORD_BYTES,
      chain.words[word] ?? 0,
      true
    );
    chain.scratch.setUint32(
      (HASH_WORDS + word) * CHAIN_WORD_BYTES,
      frame[word] ?? 0,
      true
    );
  }
  hashBytes(chain.scratch, 0, CHAIN_BYTES, chain.words);
};

export interface Run {
  readonly id: string;
  readonly setup: CareerRaceSetup;
  readonly log: RaceLog;
  readonly controller: Controller;
  state: RaceState;
  readonly track: Track;
  readonly controls: RiderInput;
  readonly frame: InputFrame;
  readonly hasher: RaceHasher;
  buffer: DataView;
  readonly full: Chain;
  readonly window: Chain;
  readonly frames: string[];
  readonly problems: string[];
}

export type InputProducer = (run: Run) => void;

const bufferFor = (run: Run): DataView => {
  const needed = snapshotCapacity(run.state);
  if (run.buffer.byteLength < needed) {
    run.buffer = new DataView(new ArrayBuffer(needed));
  }
  return run.buffer;
};

const raceFor = (setup: CareerRaceSetup, controller: Controller): RaceState =>
  createRace({ ...setup, player: { ...setup.player, controller } });

const open = (
  id: string,
  setup: CareerRaceSetup,
  controller: Controller
): Run => {
  const state = raceFor(setup, controller);
  const controls = { ...neutralInput };
  const run: Run = {
    buffer: new DataView(new ArrayBuffer(snapshotCapacity(state))),
    controller,
    controls,
    frame: new Map(controller === "human" ? [[PLAYER_RIDER, controls]] : []),
    frames: [],
    full: openChain(),
    hasher: hasherFor(state, setup.track),
    id,
    log: createRaceLog(setup),
    problems: [],
    setup,
    state,
    track: setup.track,
    window: openChain(),
  };
  run.hasher.hash(state);
  foldChain(run.full, run.hasher.words);
  return run;
};

export const openCase = (
  replay: ReplayCase,
  controller: Controller = "pilot"
): Run => open(replay.id, replay.setup(), controller);

export const checkpointOf = (run: Run): Uint8Array => {
  const written = writeSnapshot(run.state, run.hasher.digest, bufferFor(run));
  return new Uint8Array(run.buffer.buffer, run.buffer.byteOffset, written);
};

export const restoredWith = (run: Run, checkpoint: Uint8Array): Run => {
  const fresh = raceFor(run.setup, run.controller);
  restoreInto(
    fresh,
    setupDigest(fresh, run.track),
    new DataView(
      checkpoint.buffer,
      checkpoint.byteOffset,
      checkpoint.byteLength
    )
  );
  run.state = fresh;
  return run;
};

const restoredFrom = (run: Run): Run => restoredWith(run, checkpointOf(run));

const motion = [
  "s",
  "x",
  "speed",
  "lateralSpeed",
  "air",
  "verticalSpeed",
  "bodyS",
  "bodyX",
  "bodyAir",
  "bodySpeed",
  "bodyLateralSpeed",
  "bodyVerticalSpeed",
] as const satisfies readonly (keyof RiderState)[];

const inspect = (run: Run): void => {
  for (const rider of run.state.riders) {
    for (const field of motion) {
      if (!Number.isFinite(rider[field])) {
        run.problems.push(
          `${run.id} tick ${run.state.tick}: rider ${rider.id} has ${field} ${rider[field]}`
        );
      }
    }
    if (!riderModes.includes(rider.mode)) {
      run.problems.push(
        `${run.id} tick ${run.state.tick}: rider ${rider.id} is in mode ${rider.mode}`
      );
    }
  }
};

const advance = (run: Run, produce?: InputProducer): void => {
  produce?.(run);
  stepRace(run.state, run.track, run.frame);
  recordTick(run.log, run.state, run.setup);
  inspect(run);
  run.frames.push(run.hasher.hash(run.state));
  foldChain(run.full, run.hasher.words);
  if (run.state.tick >= WINDOW.from && run.state.tick <= WINDOW.to) {
    foldChain(run.window, run.hasher.words);
  }
};

export const ride = (run: Run, ticks: number, produce?: InputProducer): Run => {
  for (let tick = 0; tick < ticks; tick += 1) {
    advance(run, produce);
  }
  return run;
};

const settled = (run: Run): boolean => run.log.outcome !== null;

const stillRiding = (run: Run, limit: number): boolean =>
  !settled(run) && run.state.tick < limit;

const noteUnsettled = (run: Run, limit: number): void => {
  if (!settled(run)) {
    run.problems.push(
      `${run.id} had no outcome after ${limit} ticks, at ${run.state.tick}.`
    );
  }
};

export const rideToEnd = (
  run: Run,
  limit: number,
  produce?: InputProducer
): Run => {
  while (stillRiding(run, limit)) {
    advance(run, produce);
  }
  noteUnsettled(run, limit);
  return run;
};

const RESTORE_EVERY = 600;

const rideTogether = (
  limit: number,
  restore: (run: Run) => Run = (run) => run
): readonly Run[] => {
  let runs = replayCases.map((replay) => openCase(replay));
  for (let tick = 0; runs.some((run) => stillRiding(run, limit)); tick += 1) {
    if (tick % RESTORE_EVERY === 0) {
      runs = runs.map((run) => (stillRiding(run, limit) ? restore(run) : run));
    }
    for (const run of runs) {
      if (stillRiding(run, limit)) {
        advance(run);
      }
    }
  }
  for (const run of runs) {
    noteUnsettled(run, limit);
  }
  return runs;
};

export interface Replay {
  readonly id: string;
  readonly ticks: number;
  readonly full: string;
  readonly final: string;
  readonly result: RaceResult | null;
  readonly window: string;
}

export const close = (run: Run): Replay => ({
  final: run.hasher.hash(run.state),
  full: hashText(run.full.words),
  id: run.id,
  result: run.log.outcome?.result ?? null,
  ticks: run.state.tick,
  window: hashText(run.window.words),
});

export const firstDifferentTick = (
  frames: readonly string[],
  reference: readonly string[]
): number | null => {
  const first = frames.findIndex((frame, tick) => frame !== reference[tick]);
  return first === -1 ? null : first + 1;
};

interface Divergence {
  readonly id: string;
  readonly firstDifferentTick: number | null;
}

export interface Matrix {
  readonly solo: readonly Replay[];
  readonly soloFrames: ReadonlyMap<string, readonly string[]>;
  readonly interleaved: readonly Replay[];
  readonly divergences: readonly Divergence[];
  readonly restored: readonly Divergence[];
  readonly problems: readonly string[];
}

export const replayMatrix = (limit: number): Matrix => {
  const solo = replayCases.map((replay) => rideToEnd(openCase(replay), limit));
  const together = rideTogether(limit);
  const restored = rideTogether(limit, restoredFrom);
  return {
    divergences: together.map((run, index) => ({
      firstDifferentTick: firstDifferentTick(
        run.frames,
        solo[index]?.frames ?? []
      ),
      id: run.id,
    })),
    interleaved: together.map(close),
    problems: [...solo, ...together, ...restored].flatMap(
      (run) => run.problems
    ),
    restored: restored.map((run, index) => ({
      firstDifferentTick: firstDifferentTick(
        run.frames,
        solo[index]?.frames ?? []
      ),
      id: run.id,
    })),
    solo: solo.map(close),
    soloFrames: new Map(solo.map((run) => [run.id, run.frames])),
  };
};
