import { HISTOGRAM_EDGES_MS } from "@racer/telemetry/limits";
import type {
  Batch,
  Quality,
  Session,
  TelemetryEvent,
  WorstFrame,
} from "@racer/telemetry/schema";

const STALL_MS = 100;

const NEAR_MS = 2000;

const NEAR_FRAMES = 3;

type EventOf<Kind extends TelemetryEvent["kind"]> = Extract<
  TelemetryEvent,
  { readonly kind: Kind }
>;

interface Suspect {
  readonly score: number;
  readonly kind: string;
  readonly at: number;
  readonly frame: number;
  readonly detail: string;
}

interface Period {
  readonly batchId: number;
  readonly kind: string;
  readonly endsAt: number;
  readonly frames: number;
  readonly meanMs: number;
  readonly lateShare: number;
  readonly discardedMs: number;
  readonly overlay: boolean | null;
}

interface Bucket {
  readonly bucket: string;
  readonly count: number;
  readonly share: number;
}

export interface SessionSummary {
  readonly session: Session;
  readonly devices: readonly string[];
  readonly firstReceived: string;
  readonly lastReceived: string;
  readonly batches: {
    readonly received: number;
    readonly highest: number;
    readonly missing: readonly number[];
    readonly duplicateLines: number;
    readonly unreadableLines: number;
    readonly reports: readonly string[];
  };
  readonly dropped: Batch["dropped"];
  readonly frames: number;
  readonly recordedSeconds: number;
  readonly discardedMs: number;
  readonly histogram: readonly Bucket[];
  readonly worst: readonly WorstFrame[];
  readonly rungs: readonly EventOf<"governor">[];
  readonly markers: readonly (EventOf<"marker"> & {
    readonly nearRung: string;
    readonly nearWorst: string;
  })[];
  readonly races: readonly EventOf<"race">[];
  readonly overlays: readonly EventOf<"overlay">[];
  readonly periods: readonly Period[];
  readonly faults: readonly EventOf<"fault">[];
  readonly resizes: Readonly<Record<string, number>>;
  readonly suspects: readonly Suspect[];
}

export interface Loaded {
  readonly id: string;
  readonly batches: readonly Batch[];
  readonly received: readonly string[];
  readonly duplicateLines: number;
  readonly unreadableLines: number;
}

const bucketLabel = (index: number): string => {
  const edge = HISTOGRAM_EDGES_MS[index];
  return edge === undefined
    ? `>${HISTOGRAM_EDGES_MS.at(-1) ?? 0}`
    : `<=${edge}`;
};

export const qualityText = (quality: Quality): string =>
  `rung ${quality.rung} x${quality.pixelRatio.toFixed(2)} bloom ${quality.bloomScale} shadow ${quality.shadowMap}${quality.samples === undefined ? "" : ` msaa ${quality.samples}`} pace ${quality.pace}${quality.frameRate === undefined ? "" : ` rate ${quality.frameRate}`}`;

export const seconds = (at: number): string => `${(at / 1000).toFixed(2)} s`;

const eventsOf = (batches: readonly Batch[]): TelemetryEvent[] => {
  const bySeq = new Map<number, TelemetryEvent>();
  for (const batch of batches) {
    for (const event of batch.events) {
      bySeq.set(event.seq, event);
    }
  }
  return [...bySeq.values()].toSorted((left, right) => left.seq - right.seq);
};

const only = <Kind extends TelemetryEvent["kind"]>(
  events: readonly TelemetryEvent[],
  kind: Kind
): EventOf<Kind>[] =>
  events.filter((event): event is EventOf<Kind> => event.kind === kind);

const missingIds = (batches: readonly Batch[]): number[] => {
  const have = new Set(batches.map((batch) => batch.batchId));
  const highest = Math.max(-1, ...have);
  return Array.from({ length: highest + 1 }, (_, id) => id).filter(
    (id) => !have.has(id)
  );
};

const mergedHistogram = (batches: readonly Batch[]): Bucket[] => {
  const counts = Array.from({ length: HISTOGRAM_EDGES_MS.length + 1 }, () => 0);
  for (const batch of batches) {
    for (const [index, count] of batch.histogram.entries()) {
      counts[index] = (counts[index] ?? 0) + count;
    }
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count, index) => ({
    bucket: bucketLabel(index),
    count,
    share: total > 0 ? count / total : 0,
  }));
};

const worstFrames = (
  batches: readonly Batch[],
  limit: number
): WorstFrame[] => {
  const byFrame = new Map<number, WorstFrame>();
  for (const batch of batches) {
    for (const frame of batch.worst) {
      byFrame.set(frame.frame, frame);
    }
  }
  return [...byFrame.values()]
    .toSorted((left, right) => right.intervalMs - left.intervalMs)
    .slice(0, limit);
};

const resizeSuspects = (events: readonly TelemetryEvent[]): Suspect[] => {
  const canvases = only(events, "canvas");
  return only(events, "invalidated").map((event) => {
    const resize = canvases.find((each) => each.epoch === event.sizeEpoch);
    const how = resize
      ? `${resize.source} resize to ${resize.bufferWidth}x${resize.bufferHeight}`
      : "resize";
    return {
      at: event.at,
      detail: `frame ${event.frame} drew canvas generation ${event.drawnEpoch} at rung ${event.drawRung}; a ${how} (generation ${event.sizeEpoch}, rung ${event.nextRung}) cleared it before it was presented`,
      frame: event.frame,
      kind: "resize-after-draw",
      score: 100,
    };
  });
};

const contextSuspects = (events: readonly TelemetryEvent[]): Suspect[] =>
  only(events, "context")
    .filter((event) => event.lost)
    .map((event) => ({
      at: event.at,
      detail: `WebGL context lost after frame ${event.frame}`,
      frame: event.frame,
      kind: "context-lost",
      score: 90,
    }));

const passSuspects = (events: readonly TelemetryEvent[]): Suspect[] =>
  only(events, "incomplete-pass").map((event) => ({
    at: event.at,
    detail: `frame ${event.frame} started its render passes and never finished them`,
    frame: event.frame,
    kind: "incomplete-final-pass",
    score: 70,
  }));

const stallSuspects = (
  worst: readonly WorstFrame[],
  events: readonly TelemetryEvent[]
): Suspect[] =>
  worst
    .filter((frame) => frame.intervalMs >= STALL_MS)
    .map((frame) => {
      const overlapping = events.filter(
        (event) =>
          (event.kind === "governor" || event.kind === "canvas") &&
          Math.abs(event.frame - frame.frame) <= 1
      );
      return {
        at: frame.at,
        detail: `frame ${frame.frame} took ${frame.intervalMs.toFixed(1)} ms${overlapping.length > 0 ? ` beside ${overlapping.map((event) => event.kind).join(", ")}` : ""}`,
        frame: frame.frame,
        kind: "stall",
        score: overlapping.length > 0 ? 30 : 10,
      };
    });

const nearestRung = (
  rungs: readonly EventOf<"governor">[],
  at: number
): string => {
  const near = rungs.filter((event) => Math.abs(event.at - at) <= NEAR_MS);
  return near
    .map(
      (event) =>
        `${event.reason} ${event.from.rung}->${event.to.rung} at ${seconds(event.at)}`
    )
    .join("; ");
};

const nearestWorst = (worst: readonly WorstFrame[], at: number): string =>
  worst
    .filter((frame) => frame.at > 0 && Math.abs(frame.at - at) <= NEAR_MS)
    .slice(0, NEAR_FRAMES)
    .map((frame) => `frame ${frame.frame} ${frame.intervalMs.toFixed(1)} ms`)
    .join("; ");

const LATE_BUCKET = 2;

export const meterText = (on: boolean | null): string => {
  if (on === null) {
    return "?";
  }
  return on ? "on" : "off";
};

const periodsOf = (
  batches: readonly Batch[],
  overlays: readonly EventOf<"overlay">[]
): Period[] =>
  batches.map((batch) => {
    const late = batch.histogram
      .slice(LATE_BUCKET + 1)
      .reduce((sum, count) => sum + count, 0);
    return {
      batchId: batch.batchId,
      discardedMs: batch.discardedMs,
      endsAt: batch.at,
      frames: batch.frames,
      kind: batch.kind,
      lateShare: batch.frames > 0 ? late / batch.frames : 0,
      meanMs: batch.frames > 0 ? batch.totalMs / batch.frames : 0,
      overlay: overlays.findLast((event) => event.at <= batch.at)?.on ?? null,
    };
  });

export const summarise = (
  loaded: Loaded,
  worstLimit: number
): SessionSummary | null => {
  const last = loaded.batches.at(-1);
  if (!last) {
    return null;
  }
  const events = eventsOf(loaded.batches);
  const rungs = only(events, "governor");
  const allWorst = worstFrames(loaded.batches, Number.POSITIVE_INFINITY);
  const resizes: Record<string, number> = {};
  for (const event of only(events, "canvas")) {
    resizes[event.source] = (resizes[event.source] ?? 0) + 1;
  }
  const suspects = [
    ...resizeSuspects(events),
    ...contextSuspects(events),
    ...passSuspects(events),
    ...stallSuspects(allWorst, events),
  ].toSorted((left, right) => right.score - left.score || left.at - right.at);
  return {
    batches: {
      duplicateLines: loaded.duplicateLines,
      highest: last.batchId,
      missing: missingIds(loaded.batches),
      received: loaded.batches.length,
      reports: loaded.batches.flatMap((batch) =>
        batch.reportId === null ? [] : [batch.reportId]
      ),
      unreadableLines: loaded.unreadableLines,
    },
    devices: [...new Set(loaded.batches.map((batch) => batch.session.device))],
    discardedMs: loaded.batches.reduce(
      (sum, batch) => sum + batch.discardedMs,
      0
    ),
    dropped: {
      batches: Math.max(
        ...loaded.batches.map((batch) => batch.dropped.batches)
      ),
      events: Math.max(...loaded.batches.map((batch) => batch.dropped.events)),
      faults: Math.max(...loaded.batches.map((batch) => batch.dropped.faults)),
    },
    faults: only(events, "fault"),
    firstReceived: loaded.received[0] ?? "",
    frames: loaded.batches.reduce((sum, batch) => sum + batch.frames, 0),
    histogram: mergedHistogram(loaded.batches),
    lastReceived: loaded.received.at(-1) ?? "",
    markers: only(events, "marker").map((marker) => ({
      ...marker,
      nearRung: nearestRung(rungs, marker.at),
      nearWorst: nearestWorst(allWorst, marker.at),
    })),
    overlays: only(events, "overlay"),
    periods: periodsOf(loaded.batches, only(events, "overlay")),
    races: only(events, "race"),
    recordedSeconds:
      loaded.batches.reduce((sum, batch) => sum + batch.totalMs, 0) / 1000,
    resizes,
    rungs,
    session: last.session,
    suspects,
    worst: allWorst.slice(0, worstLimit),
  };
};

export const topParts = (frame: WorstFrame, parts: readonly string[]): string =>
  frame.cpu
    .map((cpu, index) => ({ cpu, part: parts[index] ?? `#${index}` }))
    .toSorted((left, right) => right.cpu - left.cpu)
    .slice(0, 4)
    .map((each) => `${each.part} ${each.cpu.toFixed(1)}`)
    .join(", ");
