import { createHash } from "node:crypto";
import type { Hash } from "node:crypto";

import type { RoadId } from "@racer/career/tables";
import { pilotInput } from "@racer/sim/pilot";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import type { RaceView } from "@racer/sim/race-view";
import type {
  RaceSetup,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import type { Track } from "@racer/track/track";
import * as Predicate from "effect/Predicate";

import { benchPlan } from "../src/career/bench.ts";
import { planFor } from "../src/career/flow.ts";

export const TICKS = 7200;
export const WINDOW = { from: 2880, to: 3480 };

export interface ReplayCase {
  readonly id: string;
  readonly setup: () => RaceSetup;
}

const quickRace = (roadId: RoadId, seed: number): ReplayCase => ({
  id: `${roadId}/level5/seed${seed}`,
  setup: () =>
    planFor(null, {
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

const numberBuffer = new ArrayBuffer(8);
const numberBits = new DataView(numberBuffer);
const numberBytes = new Uint8Array(numberBuffer);
const hexOf = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, "0")
);

const numberText = (value: number): string => {
  numberBits.setFloat64(0, value, true);
  let text = "n";
  for (const byte of numberBytes) {
    text += hexOf[byte] ?? "";
  }
  return text;
};

const encodeAt = (holder: readonly unknown[], at: number): string => {
  const value = holder[at];
  if (Predicate.isNumber(value)) {
    return numberText(value);
  }
  if (Predicate.isString(value)) {
    return `s${value.length}:${value}`;
  }
  if (Predicate.isBoolean(value)) {
    return value ? "t" : "f";
  }
  if (Predicate.isNull(value)) {
    return "z";
  }
  if (Predicate.isUndefined(value)) {
    return "u";
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    let text = `a${items.length}:`;
    for (let index = 0; index < items.length; index += 1) {
      text += index in items ? encodeAt(items, index) : "h";
    }
    return text;
  }
  if (
    !Predicate.isReadonlyObject(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error("The replay serializer reads plain data only.");
  }
  const keys = Object.keys(value).toSorted();
  const values = keys.map((key) => value[key]);
  let text = `o${keys.length}:`;
  for (const [index, key] of keys.entries()) {
    text += `s${key.length}:${key}${encodeAt(values, index)}`;
  }
  return text;
};

const raceText = (state: RaceView): string => encodeAt([state], 0);

const frameText = (state: RaceView, inputs: readonly RiderInput[]): string =>
  encodeAt([[state, inputs]], 0);

const digest = (text: string): string =>
  createHash("sha256").update(text, "utf16le").digest("hex");

export const frameDigest = (
  state: RaceView,
  inputs: readonly RiderInput[]
): string => digest(frameText(state, inputs));

export interface Run {
  readonly id: string;
  readonly state: RaceState;
  readonly track: Track;
  readonly inputs: readonly RiderInput[];
  readonly full: Hash;
  readonly window: Hash;
  readonly frames: string[];
  readonly problems: string[];
}

export type InputProducer = (run: Run) => void;

const piloted: InputProducer = (run) => {
  for (let index = 0; index < run.inputs.length; index += 1) {
    const input = run.inputs[index];
    if (input) {
      pilotInput(run.state, run.track, index, input);
    }
  }
};

const open = (id: string, setup: RaceSetup): Run => {
  const state = createRace(setup);
  const full = createHash("sha256");
  full.update(raceText(state), "utf16le");
  return {
    frames: [],
    full,
    id,
    inputs: state.riders.map(() => ({ ...neutralInput })),
    problems: [],
    state,
    track: setup.track,
    window: createHash("sha256"),
  };
};

export const openCase = (replay: ReplayCase): Run =>
  open(replay.id, replay.setup());

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

const modes = {
  busted: true,
  lying: true,
  mounting: true,
  riding: true,
  running: true,
  thrown: true,
  wrecked: true,
} satisfies Record<RiderState["mode"], true>;

const inspect = (run: Run): void => {
  for (const [index, rider] of run.state.riders.entries()) {
    for (const field of motion) {
      if (!Number.isFinite(rider[field])) {
        run.problems.push(
          `${run.id} tick ${run.state.tick}: rider ${index} has ${field} ${rider[field]}`
        );
      }
    }
    if (!Object.hasOwn(modes, rider.mode)) {
      run.problems.push(
        `${run.id} tick ${run.state.tick}: rider ${index} is in mode ${rider.mode}`
      );
    }
  }
};

const advance = (run: Run, produce: InputProducer = piloted): void => {
  produce(run);
  stepRace(run.state, run.track, run.inputs);
  inspect(run);
  const frame = frameText(run.state, run.inputs);
  run.full.update(frame, "utf16le");
  run.frames.push(digest(frame));
  if (run.state.tick >= WINDOW.from && run.state.tick <= WINDOW.to) {
    run.window.update(frame, "utf16le");
  }
};

export const ride = (
  run: Run,
  ticks: number,
  produce: InputProducer = piloted
): Run => {
  for (let tick = 0; tick < ticks; tick += 1) {
    advance(run, produce);
  }
  return run;
};

export interface Replay {
  readonly id: string;
  readonly ticks: number;
  readonly full: string;
  readonly final: string;
  readonly window: string;
}

export const close = (run: Run): Replay => ({
  final: digest(raceText(run.state)),
  full: run.full.digest("hex"),
  id: run.id,
  ticks: run.state.tick,
  window: run.window.digest("hex"),
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
  readonly problems: readonly string[];
}

export const replayMatrix = (ticks: number): Matrix => {
  const solo = replayCases.map((replay) => ride(openCase(replay), ticks));
  const together = replayCases.map(openCase);
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const run of together) {
      advance(run);
    }
  }
  return {
    divergences: together.map((run, index) => ({
      firstDifferentTick: firstDifferentTick(
        run.frames,
        solo[index]?.frames ?? []
      ),
      id: run.id,
    })),
    interleaved: together.map(close),
    problems: [...solo, ...together].flatMap((run) => run.problems),
    solo: solo.map(close),
    soloFrames: new Map(solo.map((run) => [run.id, run.frames])),
  };
};
