import {
  faultSources,
  governReasons,
  HISTOGRAM_BUCKETS,
  histogramBucket,
  MAX_BATCH_BYTES,
  MAX_FAULT_TEXT,
  MAX_WORST_FRAMES,
  raceStages,
  reportIdOf,
  resizeSources,
  TELEMETRY_VERSION,
} from "@racer/telemetry/limits";
import type {
  BatchKind,
  FaultSource,
  GovernReason,
  RaceStage,
  ResizeSource,
} from "@racer/telemetry/limits";
import type {
  Batch,
  Quality,
  Session,
  TelemetryEvent,
  WorstFrame,
} from "@racer/telemetry/schema";

import { parts } from "../game/profile.ts";
import type { ProfileFrame } from "../game/profile.ts";

const EVENT_CAPACITY = 4096;
const SLOTS = 15;
const FAULT_CAPACITY = 64;
const FAULTS_PER_BATCH = 32;
const EVENTS_PER_BATCH = 256;
const FROM = 3;
const TO = 9;

const eventKinds = [
  "governor",
  "canvas",
  "invalidated",
  "incomplete-pass",
  "context",
  "fault",
  "race",
  "marker",
  "visibility",
  "overlay",
] as const;
type EventKind = (typeof eventKinds)[number];

export interface QualityState {
  rung: number;
  pixelRatio: number;
  bloomScale: number;
  shadowMap: number;
  samples: number;
  pace: number;
}

export const emptyQuality = (): QualityState => ({
  bloomScale: 0,
  pace: 0,
  pixelRatio: 0,
  rung: 0,
  samples: 0,
  shadowMap: 0,
});

export type FrameLookup = (frame: number) => ProfileFrame | null;

export interface Outgoing {
  readonly batch: Batch;
  readonly body: string;
}

export interface Recorder {
  recording: boolean;
  readonly beginFrame: (frame: number) => void;
  readonly frame: (
    frame: number,
    intervalMs: number,
    discardedMs: number
  ) => void;
  readonly governor: (
    reason: GovernReason,
    from: QualityState,
    to: QualityState,
    lateCredit: number,
    calmMs: number
  ) => void;
  readonly canvas: (
    source: ResizeSource,
    epoch: number,
    cssWidth: number,
    cssHeight: number,
    bufferWidth: number,
    bufferHeight: number
  ) => void;
  readonly invalidated: (
    frame: number,
    drawnEpoch: number,
    sizeEpoch: number,
    drawRung: number,
    nextRung: number
  ) => void;
  readonly incompletePass: (frame: number) => void;
  readonly enterRace: () => number;
  readonly leaveRace: () => void;
  readonly raceId: () => number;
  readonly race: (stage: RaceStage, tick: number) => void;
  readonly marker: (tick: number) => boolean;
  readonly context: (lost: boolean) => void;
  readonly fault: (source: FaultSource, message: string, where: string) => void;
  readonly visibility: (hidden: boolean) => void;
  readonly overlay: (on: boolean) => void;
  readonly flush: (
    kind: BatchKind,
    session: Session,
    quality: Quality | null,
    lookup: FrameLookup | null,
    droppedBatches: number
  ) => Outgoing;
  readonly events: (afterSeq: number, limit: number) => TelemetryEvent[];
  readonly droppedEvents: () => number;
}

interface Stamp {
  readonly at: number;
  readonly frame: number;
  readonly race: number;
  readonly seq: number;
}

interface FaultText {
  message: string;
  where: string;
  serial: number;
}

const overwritten: FaultText = {
  message: "(overwritten)",
  serial: -1,
  where: "",
};

interface Slots {
  readonly stamp: Stamp;
  readonly base: number;
  readonly value: (slot: number) => number;
  readonly quality: (base: number) => Quality;
  readonly fault: (serial: number) => FaultText;
}

const decoders = {
  canvas: ({ stamp, value }) => ({
    ...stamp,
    bufferHeight: value(5),
    bufferWidth: value(4),
    cssHeight: value(3),
    cssWidth: value(2),
    epoch: value(1),
    kind: "canvas",
    source: resizeSources[value(0)] ?? "observer",
  }),
  context: ({ stamp, value }) => ({
    ...stamp,
    kind: "context",
    lost: value(0) === 1,
  }),
  fault: ({ stamp, value, fault }) => {
    const text = fault(value(1));
    return {
      ...stamp,
      kind: "fault",
      message: text.message,
      source: faultSources[value(0)] ?? "error",
      where: text.where,
    };
  },
  governor: ({ stamp, value, quality, base }) => ({
    ...stamp,
    calmMs: value(2),
    from: quality(base + FROM),
    kind: "governor",
    lateCredit: value(1),
    reason: governReasons[value(0)] ?? "late-budget",
    to: quality(base + TO),
  }),
  "incomplete-pass": ({ stamp }) => ({ ...stamp, kind: "incomplete-pass" }),
  invalidated: ({ stamp, value }) => ({
    ...stamp,
    drawRung: value(2),
    drawnEpoch: value(0),
    kind: "invalidated",
    nextRung: value(3),
    sizeEpoch: value(1),
  }),
  marker: ({ stamp, value }) => ({ ...stamp, kind: "marker", tick: value(0) }),
  overlay: ({ stamp, value }) => ({
    ...stamp,
    kind: "overlay",
    on: value(0) === 1,
  }),
  race: ({ stamp, value }) => ({
    ...stamp,
    kind: "race",
    stage: raceStages[value(0)] ?? "start",
    tick: value(1),
  }),
  visibility: ({ stamp, value }) => ({
    ...stamp,
    hidden: value(0) === 1,
    kind: "visibility",
  }),
} satisfies Record<EventKind, (slots: Slots) => TelemetryEvent>;

const thousandths = (value: number): number => Math.round(value * 1000) / 1000;

const worstFrameOf = (
  frame: number,
  intervalMs: number,
  seen: ProfileFrame | null
): WorstFrame => {
  if (!seen) {
    return {
      at: 0,
      calls: [],
      cpu: [],
      discardedMs: 0,
      drawRung: 0,
      drawnEpoch: 0,
      frame,
      intervalMs,
      nextRung: 0,
      pixelRatio: 0,
      race: 0,
      sizeEpoch: 0,
      tick: 0,
      ticks: 0,
    };
  }
  return {
    at: seen.start,
    calls: [...seen.calls],
    cpu: seen.cpu.map(thousandths),
    discardedMs: thousandths(seen.discarded),
    drawRung: seen.drawRung,
    drawnEpoch: seen.drawnEpoch,
    frame,
    intervalMs,
    nextRung: seen.rung,
    pixelRatio: seen.pixelRatio,
    race: seen.race,
    sizeEpoch: seen.sizeEpoch,
    tick: seen.tick,
    ticks: seen.ticks,
  };
};

const indexOf = <T>(list: readonly T[], value: T): number =>
  Math.max(0, list.indexOf(value));

const byteLength = (text: string): number =>
  new TextEncoder().encode(text).length;

const clip = (text: string): string => text.slice(0, MAX_FAULT_TEXT);

export const createRecorder = (): Recorder => {
  const kinds = new Uint8Array(EVENT_CAPACITY);
  const times = new Float64Array(EVENT_CAPACITY);
  const frames = new Int32Array(EVENT_CAPACITY);
  const races = new Uint32Array(EVENT_CAPACITY);
  const values = new Float64Array(EVENT_CAPACITY * SLOTS);
  const faultText: FaultText[] = Array.from({ length: FAULT_CAPACITY }, () => ({
    message: "",
    serial: -1,
    where: "",
  }));
  const histogram = new Uint32Array(HISTOGRAM_BUCKETS);
  const worstFrames = new Int32Array(MAX_WORST_FRAMES);
  const worstMs = new Float64Array(MAX_WORST_FRAMES);
  let worstCount = 0;
  let seq = 0;
  let sentSeq = 0;
  let lostEvents = 0;
  let faultSerial = 0;
  let faultsThisBatch = 0;
  let lostFaults = 0;
  let currentFrame = -1;
  let raceId = 0;
  let raceCount = 0;
  let frameCount = 0;
  let firstFrame = -1;
  let lastFrame = -1;
  let totalMs = 0;
  let discardedMs = 0;
  let skipNext = false;
  let nextBatch = 0;

  const push = (kind: EventKind): number => {
    const at = seq % EVENT_CAPACITY;
    kinds[at] = eventKinds.indexOf(kind);
    times[at] = performance.now();
    frames[at] = currentFrame;
    races[at] = raceId;
    seq += 1;
    return at * SLOTS;
  };

  const writeQuality = (base: number, quality: QualityState): void => {
    values[base] = quality.rung;
    values[base + 1] = quality.pixelRatio;
    values[base + 2] = quality.bloomScale;
    values[base + 3] = quality.shadowMap;
    values[base + 4] = quality.pace;
    values[base + 5] = quality.samples;
  };

  const readQuality = (base: number): Quality => ({
    bloomScale: values[base + 2] ?? 0,
    pace: values[base + 4] ?? 0,
    pixelRatio: values[base + 1] ?? 0,
    rung: values[base] ?? 0,
    samples: values[base + 5] ?? 0,
    shadowMap: values[base + 3] ?? 0,
  });

  const faultOf = (serial: number): FaultText => {
    const text = faultText[serial % FAULT_CAPACITY];
    return text?.serial === serial ? text : overwritten;
  };

  const eventAt = (serial: number): TelemetryEvent => {
    const at = serial % EVENT_CAPACITY;
    const base = at * SLOTS;
    const stamp: Stamp = {
      at: times[at] ?? 0,
      frame: frames[at] ?? -1,
      race: races[at] ?? 0,
      seq: serial,
    };
    const kind = eventKinds[kinds[at] ?? 0] ?? "marker";
    return decoders[kind]({
      base,
      fault: faultOf,
      quality: readQuality,
      stamp,
      value: (slot) => values[base + slot] ?? 0,
    });
  };

  const oldestKept = (): number => Math.max(0, seq - EVENT_CAPACITY);

  const takeEvents = (): number[] => {
    if (sentSeq < oldestKept()) {
      lostEvents += oldestKept() - sentSeq;
      sentSeq = oldestKept();
    }
    const serials: number[] = [];
    for (
      let serial = sentSeq;
      serial < seq && serials.length < EVENTS_PER_BATCH;
      serial += 1
    ) {
      serials.push(serial);
    }
    return serials;
  };

  const worstOf = (lookup: FrameLookup | null): WorstFrame[] =>
    Array.from({ length: worstCount }, (_, slot) => slot)
      .toSorted((left, right) => (worstMs[right] ?? 0) - (worstMs[left] ?? 0))
      .map((slot) => {
        const id = worstFrames[slot] ?? 0;
        return worstFrameOf(id, worstMs[slot] ?? 0, lookup?.(id) ?? null);
      });

  const keepWorst = (frame: number, intervalMs: number): void => {
    if (worstCount < MAX_WORST_FRAMES) {
      worstFrames[worstCount] = frame;
      worstMs[worstCount] = intervalMs;
      worstCount += 1;
      return;
    }
    let least = 0;
    for (let slot = 1; slot < MAX_WORST_FRAMES; slot += 1) {
      if ((worstMs[slot] ?? 0) < (worstMs[least] ?? 0)) {
        least = slot;
      }
    }
    if (intervalMs > (worstMs[least] ?? 0)) {
      worstFrames[least] = frame;
      worstMs[least] = intervalMs;
    }
  };

  const resetPeriod = (): void => {
    histogram.fill(0);
    worstCount = 0;
    frameCount = 0;
    firstFrame = -1;
    totalMs = 0;
    discardedMs = 0;
    faultsThisBatch = 0;
  };

  const recorder: Recorder = {
    beginFrame(frame) {
      currentFrame = frame;
    },
    canvas(source, epoch, cssWidth, cssHeight, bufferWidth, bufferHeight) {
      if (!recorder.recording) {
        return;
      }
      const base = push("canvas");
      values[base] = indexOf(resizeSources, source);
      values[base + 1] = epoch;
      values[base + 2] = cssWidth;
      values[base + 3] = cssHeight;
      values[base + 4] = bufferWidth;
      values[base + 5] = bufferHeight;
    },
    context(lost) {
      if (!recorder.recording) {
        return;
      }
      values[push("context")] = lost ? 1 : 0;
    },
    droppedEvents: () => lostEvents + lostFaults,
    enterRace() {
      raceCount += 1;
      raceId = raceCount;
      return raceId;
    },
    events(afterSeq, limit) {
      const list: TelemetryEvent[] = [];
      for (
        let serial = Math.max(afterSeq + 1, oldestKept());
        serial < seq && list.length < limit;
        serial += 1
      ) {
        list.push(eventAt(serial));
      }
      return list;
    },
    fault(source, message, where) {
      if (!recorder.recording) {
        return;
      }
      if (faultsThisBatch >= FAULTS_PER_BATCH) {
        lostFaults += 1;
        return;
      }
      faultsThisBatch += 1;
      const serial = faultSerial;
      faultSerial += 1;
      const text = faultText[serial % FAULT_CAPACITY];
      if (text) {
        text.message = clip(message);
        text.where = clip(where);
        text.serial = serial;
      }
      const base = push("fault");
      values[base] = indexOf(faultSources, source);
      values[base + 1] = serial;
    },
    flush(kind, session, quality, lookup, droppedBatches) {
      const batchId = nextBatch;
      nextBatch += 1;
      const serials = takeEvents();
      const worst = worstOf(lookup);
      const build = (count: number): Batch => ({
        at: performance.now(),
        batchId,
        discardedMs: Math.round(discardedMs * 100) / 100,
        dropped: {
          batches: droppedBatches,
          events: lostEvents,
          faults: lostFaults,
        },
        events: serials.slice(0, count).map(eventAt),
        frames: frameCount,
        fromFrame: Math.max(0, firstFrame),
        histogram: [...histogram],
        kind,
        parts: [...parts],
        quality,
        reportId:
          kind === "report" ? reportIdOf(session.sessionId, batchId) : null,
        sentAt: new Date().toISOString(),
        session,
        toFrame: Math.max(0, lastFrame),
        totalMs: Math.round(totalMs * 100) / 100,
        version: TELEMETRY_VERSION,
        worst,
      });
      let count = serials.length;
      let batch = build(count);
      let body = JSON.stringify(batch);
      while (byteLength(body) > MAX_BATCH_BYTES && count > 0) {
        count = Math.floor(count / 2);
        batch = build(count);
        body = JSON.stringify(batch);
      }
      sentSeq += count;
      resetPeriod();
      return { batch, body };
    },
    frame(frame, intervalMs, discarded) {
      if (!recorder.recording) {
        return;
      }
      lastFrame = frame;
      if (skipNext) {
        skipNext = false;
        return;
      }
      if (firstFrame < 0) {
        firstFrame = frame;
      }
      frameCount += 1;
      totalMs += intervalMs;
      discardedMs += discarded;
      const bucket = histogramBucket(intervalMs);
      histogram[bucket] = (histogram[bucket] ?? 0) + 1;
      keepWorst(frame, intervalMs);
    },
    governor(reason, from, to, lateCredit, calmMs) {
      if (!recorder.recording) {
        return;
      }
      const base = push("governor");
      values[base] = indexOf(governReasons, reason);
      values[base + 1] = lateCredit;
      values[base + 2] = calmMs;
      writeQuality(base + FROM, from);
      writeQuality(base + TO, to);
    },
    incompletePass(frame) {
      if (!recorder.recording) {
        return;
      }
      push("incomplete-pass");
      frames[(seq - 1) % EVENT_CAPACITY] = frame;
    },
    invalidated(frame, drawnEpoch, sizeEpoch, drawRung, nextRung) {
      if (!recorder.recording) {
        return;
      }
      const base = push("invalidated");
      frames[(seq - 1) % EVENT_CAPACITY] = frame;
      values[base] = drawnEpoch;
      values[base + 1] = sizeEpoch;
      values[base + 2] = drawRung;
      values[base + 3] = nextRung;
    },
    leaveRace() {
      raceId = 0;
    },
    marker(tick) {
      if (!recorder.recording) {
        return false;
      }
      values[push("marker")] = tick;
      return true;
    },
    overlay(on) {
      if (!recorder.recording) {
        return;
      }
      values[push("overlay")] = on ? 1 : 0;
    },
    race(stage, tick) {
      if (!recorder.recording) {
        return;
      }
      const base = push("race");
      values[base] = indexOf(raceStages, stage);
      values[base + 1] = tick;
    },
    raceId: () => raceId,
    recording: false,
    visibility(hidden) {
      if (!hidden) {
        skipNext = true;
      }
      if (!recorder.recording) {
        return;
      }
      values[push("visibility")] = hidden ? 1 : 0;
    },
  };
  return recorder;
};
