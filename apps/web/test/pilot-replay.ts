import { recordedRules } from "@racer/career/bench";
import type { CareerRaceSetup } from "@racer/career/field";
import { createRaceLog, recordTick } from "@racer/career/outcome";
import type { RaceLog, RaceResult } from "@racer/career/outcome";
import type { RoadId } from "@racer/career/tables";
import {
  CONTROL_BYTES,
  controlOf,
  readControl,
  writeControl,
} from "@racer/sim/control";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import {
  restoreInto,
  snapshotCapacity,
  writeSnapshot,
} from "@racer/sim/snapshot";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { hashBytes, hashText } from "@racer/sim/snapshot-hash";
import { setupDigest } from "@racer/sim/snapshot-setup";
import { PLAYER_RIDER, riderIdAt, riderModes } from "@racer/sim/state";
import type {
  Control,
  Controller,
  RaceState,
  RiderId,
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
export const FIXED_RIDE = 7200;

interface Handover {
  readonly tick: number;
  readonly rider: RiderId;
  readonly to: Controller;
}

export interface ReplayCase {
  readonly id: string;
  readonly setup: () => CareerRaceSetup;
  readonly controller: Controller;
  readonly handovers: readonly Handover[];
}

const quickSetup = (roadId: RoadId, seed: number) => (): CareerRaceSetup =>
  planFor(recordedRules, null, {
    bikeId: "ostra-sesta-600",
    level: 5,
    mode: "quick",
    roadId,
    seed,
  }).setup;

const quickRace = (roadId: RoadId, seed: number): ReplayCase => ({
  controller: "pilot",
  handovers: [],
  id: `${roadId}/level5/seed${seed}`,
  setup: quickSetup(roadId, seed),
});

const roads: readonly RoadId[] = ["ridge-road", "slag-row"];
const seeds: readonly number[] = [1, 5, 9, 31];
const FIRST_RIVAL = riderIdAt(1);

export const replayCases: readonly ReplayCase[] = [
  ...roads.flatMap((roadId) => seeds.map((seed) => quickRace(roadId, seed))),
  {
    controller: "pilot",
    handovers: [],
    id: "stress/seed8",
    setup: () => benchPlan("stress").setup,
  },
  {
    controller: "human",
    handovers: [
      { rider: FIRST_RIVAL, tick: 600, to: "human" },
      { rider: FIRST_RIVAL, tick: 1500, to: "pilot" },
      { rider: PLAYER_RIDER, tick: 1800, to: "pilot" },
      { rider: PLAYER_RIDER, tick: 2400, to: "human" },
      { rider: PLAYER_RIDER, tick: 3000, to: "pilot" },
    ],
    id: "handover/slag-row/level5/seed5",
    setup: quickSetup("slag-row", 5),
  },
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

interface ReplayFrame {
  readonly controls: Map<RiderId, Control>;
  readonly handovers: Map<RiderId, Controller>;
}

export interface Run {
  readonly id: string;
  readonly setup: CareerRaceSetup;
  readonly log: RaceLog;
  readonly controller: Controller;
  readonly handovers: readonly Handover[];
  state: RaceState;
  readonly track: Track;
  readonly controls: RiderInput;
  readonly wire: DataView;
  readonly frame: ReplayFrame;
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
  replay: ReplayCase,
  setup: CareerRaceSetup,
  controller: Controller
): Run => {
  const state = raceFor(setup, controller);
  const run: Run = {
    buffer: new DataView(new ArrayBuffer(snapshotCapacity(state))),
    controller,
    controls: { ...neutralInput },
    frame: { controls: new Map(), handovers: new Map() },
    frames: [],
    full: openChain(),
    handovers: replay.handovers,
    hasher: hasherFor(state, setup.track),
    id: replay.id,
    log: createRaceLog(setup),
    problems: [],
    setup,
    state,
    track: setup.track,
    window: openChain(),
    wire: new DataView(new ArrayBuffer(CONTROL_BYTES)),
  };
  run.hasher.hash(state);
  foldChain(run.full, run.hasher.words);
  return run;
};

export const openCase = (
  replay: ReplayCase,
  controller: Controller = replay.controller
): Run => open(replay, replay.setup(), controller);

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

const WEAVE_TICKS = 240;
const WEAVE_STEER = 0.35;
const PUNCH_EVERY = 90;
const PUNCH_TICKS = 6;

const weave: InputProducer = (run) => {
  const { tick } = run.state;
  run.controls.steer =
    tick % WEAVE_TICKS < WEAVE_TICKS / 2 ? WEAVE_STEER : -WEAVE_STEER;
  run.controls.throttle = 1;
  run.controls.brake = 0;
  run.controls.punch = tick % PUNCH_EVERY < PUNCH_TICKS;
  run.controls.kick = false;
};

const overTheWire = (run: Run): Control => {
  writeControl(run.wire, 0, controlOf(run.controls));
  const control = readControl(run.wire, 0);
  if (control === undefined) {
    throw new Error(`${run.id} wrote a control it cannot read back.`);
  }
  return control;
};

const frameFor = (run: Run): ReplayFrame => {
  const { controls, handovers } = run.frame;
  handovers.clear();
  controls.clear();
  for (const handover of run.handovers) {
    if (handover.tick === run.state.tick) {
      handovers.set(handover.rider, handover.to);
    }
  }
  const control = overTheWire(run);
  for (const rider of run.state.riders) {
    if ((handovers.get(rider.id) ?? rider.controller) === "human") {
      controls.set(rider.id, control);
    }
  }
  return run.frame;
};

const advance = (run: Run, produce: InputProducer = weave): void => {
  produce(run);
  stepRace(run.state, run.track, frameFor(run));
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

const sharedTicks = (
  frames: readonly string[],
  reference: readonly string[]
): number => Math.min(frames.length, reference.length);

const firstSharedDifference = (
  frames: readonly string[],
  reference: readonly string[]
): number | null => {
  const shared = sharedTicks(frames, reference);
  for (let tick = 0; tick < shared; tick += 1) {
    if (frames[tick] !== reference[tick]) {
      return tick + 1;
    }
  }
  return null;
};

export const firstDifferentTick = (
  frames: readonly string[],
  reference: readonly string[]
): number | null =>
  firstSharedDifference(frames, reference) ??
  (frames.length === reference.length
    ? null
    : sharedTicks(frames, reference) + 1);

interface Divergence {
  readonly id: string;
  readonly firstDifferentTick: number | null;
}

type Comparison = (
  frames: readonly string[],
  reference: readonly string[]
) => number | null;

const against = (
  runs: readonly Run[],
  reference: readonly Run[],
  compare: Comparison
): readonly Divergence[] =>
  runs.map((run, index) => ({
    firstDifferentTick: compare(run.frames, reference[index]?.frames ?? []),
    id: run.id,
  }));

export interface Matrix {
  readonly fixed: readonly Replay[];
  readonly fixedStart: readonly Divergence[];
  readonly solo: readonly Replay[];
  readonly soloFrames: ReadonlyMap<string, readonly string[]>;
  readonly interleaved: readonly Replay[];
  readonly divergences: readonly Divergence[];
  readonly restored: readonly Divergence[];
  readonly problems: readonly string[];
}

export const replayMatrix = (limit: number): Matrix => {
  const fixed = replayCases.map((replay) => ride(openCase(replay), FIXED_RIDE));
  const solo = replayCases.map((replay) => rideToEnd(openCase(replay), limit));
  const together = rideTogether(limit);
  const restored = rideTogether(limit, restoredFrom);
  return {
    divergences: against(together, solo, firstDifferentTick),
    fixed: fixed.map(close),
    fixedStart: against(fixed, solo, firstSharedDifference),
    interleaved: together.map(close),
    problems: [...fixed, ...solo, ...together, ...restored].flatMap(
      (run) => run.problems
    ),
    restored: against(restored, solo, firstDifferentTick),
    solo: solo.map(close),
    soloFrames: new Map(solo.map((run) => [run.id, run.frames])),
  };
};
