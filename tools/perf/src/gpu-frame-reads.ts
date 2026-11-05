import * as Schema from "effect/Schema";

const SLOT_MS = 1000 / 60;

export const gpuFrame = Schema.Struct({
  calls: Schema.Array(Schema.Number),
  cpu: Schema.Array(Schema.Number),
  discarded: Schema.Number,
  drawnEpoch: Schema.Number,
  frame: Schema.Number,
  interval: Schema.Number,
  pixelRatio: Schema.Number,
  programs: Schema.Number,
  race: Schema.Number,
  sizeEpoch: Schema.Number,
  start: Schema.Number,
  textures: Schema.Number,
  tick: Schema.Number,
  ticks: Schema.Number,
  triangles: Schema.Array(Schema.Number),
});

export type GpuFrame = typeof gpuFrame.Type;

interface Framed {
  readonly capture: { readonly frames: readonly GpuFrame[] };
}

export const total = (values: readonly number[]): number =>
  values.reduce((sum, each) => sum + each, 0);

const missedSlots = (interval: number): number =>
  Math.max(0, Math.round(interval / SLOT_MS) - 1);

export const intervalsOf = (samples: readonly Framed[]): number[] =>
  samples
    .flatMap((sample) => sample.capture.frames.map((frame) => frame.interval))
    .toSorted((left, right) => left - right);

export const missedFractionOf = (samples: readonly Framed[]): number => {
  const intervals = intervalsOf(samples);
  const missed = total(intervals.map(missedSlots));
  return missed / (intervals.length + missed);
};

export const frameReaders = {
  "render.calls.max": (frame: GpuFrame) => total(frame.calls),
  "render.programs.max": (frame: GpuFrame) => frame.programs,
  "render.textures.max": (frame: GpuFrame) => frame.textures,
  "render.triangles.max": (frame: GpuFrame) => total(frame.triangles),
};

export const peakOf = (
  samples: readonly Framed[],
  read: (frame: GpuFrame) => number
): number =>
  Math.max(...samples.flatMap((sample) => sample.capture.frames.map(read)));
