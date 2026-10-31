import { CONTROL_BYTES, readControl, writeControl } from "./control.ts";
import { clearFrame } from "./room-frame.ts";
import type { TickFrame } from "./room-frame.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { controllers, riderIdAt } from "./state.ts";
import type { Control } from "./state.ts";

const INPUT_KIND = 1;
const TICK_KIND = 2;
const KIND_BYTES = 1;
const TICK_BYTES = 4;
const COUNT_BYTES = 1;
const RIDER_BYTES = 1;
const CONTROLLER_BYTES = 1;
const FLAG_BYTES = 1;
const WORD_BYTES = 4;
const HASH_BYTES = HASH_WORDS * WORD_BYTES;
const LARGEST_TICK = 0xff_ff_ff_ff;

export const MOST_BATCHED_CONTROLS = 8;

const INPUT_HEADER_BYTES = KIND_BYTES + TICK_BYTES + COUNT_BYTES;
const HANDOVER_BYTES = RIDER_BYTES + CONTROLLER_BYTES;
const CONTROL_ENTRY_BYTES = RIDER_BYTES + CONTROL_BYTES;

export interface InputBatch {
  firstTick: number;
  readonly controls: Control[];
}

export const createInputBatch = (): InputBatch => ({
  controls: [],
  firstTick: 0,
});

export const inputBytes = (count: number): number =>
  INPUT_HEADER_BYTES + count * CONTROL_BYTES;

const isTick = (tick: number): boolean =>
  Number.isSafeInteger(tick) && tick >= 0 && tick <= LARGEST_TICK;

const refuseBatch = (firstTick: number, count: number): never => {
  throw new RangeError(
    `An input packet carries 1 to ${MOST_BATCHED_CONTROLS} controls from a whole tick, not ${count} from ${firstTick}.`
  );
};

export const writeInput = (
  view: DataView,
  firstTick: number,
  controls: readonly Control[]
): number => {
  if (
    !isTick(firstTick) ||
    controls.length === 0 ||
    controls.length > MOST_BATCHED_CONTROLS
  ) {
    refuseBatch(firstTick, controls.length);
  }
  view.setUint8(0, INPUT_KIND);
  view.setUint32(KIND_BYTES, firstTick, true);
  view.setUint8(KIND_BYTES + TICK_BYTES, controls.length);
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    if (control !== undefined) {
      writeControl(view, INPUT_HEADER_BYTES + index * CONTROL_BYTES, control);
    }
  }
  return inputBytes(controls.length);
};

export const readInput = (view: DataView, into: InputBatch): boolean => {
  if (view.byteLength < INPUT_HEADER_BYTES || view.getUint8(0) !== INPUT_KIND) {
    return false;
  }
  const count = view.getUint8(KIND_BYTES + TICK_BYTES);
  if (
    count === 0 ||
    count > MOST_BATCHED_CONTROLS ||
    view.byteLength !== inputBytes(count)
  ) {
    return false;
  }
  into.firstTick = view.getUint32(KIND_BYTES, true);
  into.controls.length = 0;
  for (let index = 0; index < count; index += 1) {
    const control = readControl(
      view,
      INPUT_HEADER_BYTES + index * CONTROL_BYTES
    );
    if (control === undefined) {
      return false;
    }
    into.controls.push(control);
  }
  return true;
};

export const tickBytes = (frame: TickFrame, hashed: boolean): number =>
  KIND_BYTES +
  TICK_BYTES +
  COUNT_BYTES +
  frame.handovers.size * HANDOVER_BYTES +
  COUNT_BYTES +
  frame.controls.size * CONTROL_ENTRY_BYTES +
  FLAG_BYTES +
  (hashed ? HASH_BYTES : 0);

export const writeTick = (
  view: DataView,
  frame: TickFrame,
  hash: Uint32Array | null
): number => {
  let at = 0;
  view.setUint8(at, TICK_KIND);
  at += KIND_BYTES;
  view.setUint32(at, frame.tick, true);
  at += TICK_BYTES;
  view.setUint8(at, frame.handovers.size);
  at += COUNT_BYTES;
  for (const [rider, controller] of frame.handovers) {
    view.setUint8(at, rider);
    view.setUint8(at + RIDER_BYTES, controllers.indexOf(controller));
    at += HANDOVER_BYTES;
  }
  view.setUint8(at, frame.controls.size);
  at += COUNT_BYTES;
  for (const [rider, control] of frame.controls) {
    view.setUint8(at, rider);
    writeControl(view, at + RIDER_BYTES, control);
    at += CONTROL_ENTRY_BYTES;
  }
  view.setUint8(at, hash ? 1 : 0);
  at += FLAG_BYTES;
  if (hash) {
    for (let word = 0; word < HASH_WORDS; word += 1) {
      view.setUint32(at + word * WORD_BYTES, hash[word] ?? 0, true);
    }
    at += HASH_BYTES;
  }
  return at;
};

export interface ReadTick {
  readonly frame: TickFrame;
  readonly hash: Uint32Array;
  hashed: boolean;
}

const fits = (view: DataView, at: number, bytes: number): boolean =>
  at + bytes <= view.byteLength;

const readHandovers = (
  view: DataView,
  at: number,
  frame: TickFrame
): number => {
  const count = view.getUint8(at);
  let next = at + COUNT_BYTES;
  if (!fits(view, next, count * HANDOVER_BYTES)) {
    return -1;
  }
  for (let index = 0; index < count; index += 1) {
    const rider = riderIdAt(view.getUint8(next));
    const controller = controllers[view.getUint8(next + RIDER_BYTES)];
    if (controller === undefined || frame.handovers.has(rider)) {
      return -1;
    }
    frame.handovers.set(rider, controller);
    next += HANDOVER_BYTES;
  }
  return next;
};

const readControls = (view: DataView, at: number, frame: TickFrame): number => {
  if (!fits(view, at, COUNT_BYTES)) {
    return -1;
  }
  const count = view.getUint8(at);
  let next = at + COUNT_BYTES;
  if (!fits(view, next, count * CONTROL_ENTRY_BYTES)) {
    return -1;
  }
  for (let index = 0; index < count; index += 1) {
    const rider = riderIdAt(view.getUint8(next));
    const control = readControl(view, next + RIDER_BYTES);
    if (control === undefined || frame.controls.has(rider)) {
      return -1;
    }
    frame.controls.set(rider, control);
    next += CONTROL_ENTRY_BYTES;
  }
  return next;
};

const readHash = (view: DataView, at: number, into: ReadTick): boolean => {
  if (!fits(view, at, FLAG_BYTES)) {
    return false;
  }
  const flag = view.getUint8(at);
  const from = at + FLAG_BYTES;
  if (flag === 0) {
    into.hashed = false;
    return from === view.byteLength;
  }
  if (flag !== 1 || from + HASH_BYTES !== view.byteLength) {
    return false;
  }
  for (let word = 0; word < HASH_WORDS; word += 1) {
    into.hash[word] = view.getUint32(from + word * WORD_BYTES, true);
  }
  into.hashed = true;
  return true;
};

export const createReadTick = (frame: TickFrame): ReadTick => ({
  frame,
  hash: new Uint32Array(HASH_WORDS),
  hashed: false,
});

export const readTick = (view: DataView, into: ReadTick): boolean => {
  const headerBytes = KIND_BYTES + TICK_BYTES + COUNT_BYTES;
  if (view.byteLength < headerBytes || view.getUint8(0) !== TICK_KIND) {
    return false;
  }
  clearFrame(into.frame, view.getUint32(KIND_BYTES, true));
  const afterHandovers = readHandovers(
    view,
    KIND_BYTES + TICK_BYTES,
    into.frame
  );
  if (afterHandovers < 0) {
    return false;
  }
  const afterControls = readControls(view, afterHandovers, into.frame);
  return afterControls >= 0 && readHash(view, afterControls, into);
};
