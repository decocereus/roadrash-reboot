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
const hexUnits = Uint16Array.from(
  { length: 512 },
  (_, at) =>
    Math.floor(at / 2)
      .toString(16)
      .padStart(2, "0")
      .codePointAt(at % 2) ?? 0
);
const NUMBER_UNIT = "n".codePointAt(0) ?? 0;
const SUPPLEMENTARY = 0x1_00_00;
const HIGH_SURROGATE = 0xd8_00;
const SURROGATE_SPAN = 0x4_00;

const codeUnitAt = (value: string, at: number): number => {
  const point = value.codePointAt(at) ?? 0;
  return point < SUPPLEMENTARY
    ? point
    : HIGH_SURROGATE + Math.floor((point - SUPPLEMENTARY) / SURROGATE_SPAN);
};

const text = { length: 0, units: new Uint16Array(131_072) };

const reserve = (count: number): void => {
  if (text.length + count > text.units.length) {
    const grown = new Uint16Array(2 * (text.length + count));
    grown.set(text.units.subarray(0, text.length));
    text.units = grown;
  }
};

const writeString = (value: string): void => {
  reserve(value.length);
  for (let at = 0; at < value.length; at += 1) {
    text.units[text.length + at] = codeUnitAt(value, at);
  }
  text.length += value.length;
};

const writeCount = (tag: string, count: number): void => {
  writeString(tag);
  writeString(String(count));
  writeString(":");
};

const textUnits = new Map<string, Uint16Array>();

const writeText = (value: string): void => {
  let units = textUnits.get(value);
  if (!units) {
    const encoding = `s${value.length}:${value}`;
    units = Uint16Array.from({ length: encoding.length }, (_, at) =>
      codeUnitAt(encoding, at)
    );
    textUnits.set(value, units);
  }
  reserve(units.length);
  text.units.set(units, text.length);
  text.length += units.length;
};

interface SortedKeys {
  readonly keys: readonly string[];
  readonly sorted: readonly string[];
  readonly from: readonly number[];
}

const sortedKeys = (keys: readonly string[]): SortedKeys => {
  const sorted = keys.toSorted();
  return { from: sorted.map((key) => keys.indexOf(key)), keys, sorted };
};

const sortedKeysOf = new WeakMap<WeakKey, SortedKeys>();

const sameKeys = (
  known: SortedKeys | undefined,
  keys: readonly string[]
): known is SortedKeys =>
  known !== undefined &&
  known.keys.length === keys.length &&
  known.keys.every((key, index) => key === keys[index]);

const writeNumber = (value: number): void => {
  numberBits.setFloat64(0, value, true);
  reserve(1 + 2 * numberBytes.length);
  text.units[text.length] = NUMBER_UNIT;
  let at = text.length + 1;
  for (const byte of numberBytes) {
    text.units[at] = hexUnits[2 * byte] ?? 0;
    text.units[at + 1] = hexUnits[2 * byte + 1] ?? 0;
    at += 2;
  }
  text.length = at;
};

const writeAt = (holder: readonly unknown[], at: number): void => {
  const value = holder[at];
  if (Predicate.isNumber(value)) {
    writeNumber(value);
  } else if (Predicate.isString(value)) {
    writeText(value);
  } else if (Predicate.isBoolean(value)) {
    writeString(value ? "t" : "f");
  } else if (Predicate.isNull(value)) {
    writeString("z");
  } else if (Predicate.isUndefined(value)) {
    writeString("u");
  } else if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    writeCount("a", items.length);
    for (let index = 0; index < items.length; index += 1) {
      if (index in items) {
        writeAt(items, index);
      } else {
        writeString("h");
      }
    }
  } else if (
    Predicate.isReadonlyObject(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const keys = Object.keys(value);
    const values = Object.values(value);
    const known = sortedKeysOf.get(value);
    const order = sameKeys(known, keys) ? known : sortedKeys(keys);
    if (order !== known) {
      sortedKeysOf.set(value, order);
    }
    writeCount("o", order.sorted.length);
    for (const [index, key] of order.sorted.entries()) {
      writeText(key);
      writeAt(values, order.from[index] ?? 0);
    }
  } else {
    throw new Error("The replay serializer reads plain data only.");
  }
};

const encoded = (holder: readonly unknown[]): Uint8Array => {
  text.length = 0;
  writeAt(holder, 0);
  return new Uint8Array(text.units.buffer, 0, 2 * text.length);
};

const raceBytes = (state: RaceView): Uint8Array => encoded([state]);

const frameBytes = (
  state: RaceView,
  inputs: readonly RiderInput[]
): Uint8Array => encoded([[state, inputs]]);

const digest = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export const frameDigest = (
  state: RaceView,
  inputs: readonly RiderInput[]
): string => digest(frameBytes(state, inputs));

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
  full.update(raceBytes(state));
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
  const frame = frameBytes(run.state, run.inputs);
  run.full.update(frame);
  run.frames.push(digest(frame));
  if (run.state.tick >= WINDOW.from && run.state.tick <= WINDOW.to) {
    run.window.update(frame);
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
  final: digest(raceBytes(run.state)),
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
