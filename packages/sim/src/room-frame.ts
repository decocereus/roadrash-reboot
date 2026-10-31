import { snapshotCapacity } from "./snapshot.ts";
import type {
  Control,
  Controller,
  InputFrame,
  RaceState,
  RiderId,
} from "./state.ts";

export interface TickFrame extends InputFrame {
  tick: number;
  readonly controls: Map<RiderId, Control>;
  readonly handovers: Map<RiderId, Controller>;
}

export const createTickFrame = (): TickFrame => ({
  controls: new Map(),
  handovers: new Map(),
  tick: 0,
});

export const clearFrame = (frame: TickFrame, tick: number): void => {
  frame.tick = tick;
  frame.controls.clear();
  frame.handovers.clear();
};

const sameEntries = <Value>(
  left: ReadonlyMap<RiderId, Value>,
  right: ReadonlyMap<RiderId, Value>
): boolean => {
  if (left.size !== right.size) {
    return false;
  }
  for (const [rider, value] of left) {
    if (right.get(rider) !== value) {
      return false;
    }
  }
  return true;
};

export const sameFrame = (left: TickFrame, right: TickFrame): boolean =>
  left.tick === right.tick &&
  sameEntries(left.controls, right.controls) &&
  sameEntries(left.handovers, right.handovers);

const SCRATCH_GROWTH = 2;

export interface Scratch {
  view: DataView;
}

const viewOf = (bytes: number): DataView =>
  new DataView(new ArrayBuffer(bytes * SCRATCH_GROWTH));

export const createScratch = (state: RaceState): Scratch => ({
  view: viewOf(snapshotCapacity(state)),
});

export const scratchFor = (scratch: Scratch, state: RaceState): DataView => {
  const needed = snapshotCapacity(state);
  if (needed > scratch.view.byteLength) {
    scratch.view = viewOf(needed);
  }
  return scratch.view;
};
