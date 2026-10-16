import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { Schema } from "effect";

import { HISTOGRAM_EDGES_MS } from "../../packages/telemetry/src/limits.ts";
import { batchSchema } from "../../packages/telemetry/src/schema.ts";
import type {
  Batch,
  Quality,
  Session,
  TelemetryEvent,
  WorstFrame,
} from "../../packages/telemetry/src/schema.ts";

const STALL_MS = 100;
const NEAR_MS = 2000;
const NEAR_FRAMES = 3;

const storedLine = Schema.fromJsonString(
  Schema.Struct({ batch: batchSchema, receivedAt: Schema.String })
);
const decodeLine = Schema.decodeUnknownOption(storedLine);

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

interface SessionSummary {
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

interface Loaded {
  readonly id: string;
  readonly batches: readonly Batch[];
  readonly received: readonly string[];
  readonly duplicateLines: number;
  readonly unreadableLines: number;
}

const options = parseArgs({
  options: {
    device: { type: "string" },
    dir: { default: "tools/perf/results/sessions", type: "string" },
    json: { default: false, type: "boolean" },
    session: { type: "string" },
    worst: { default: "10", type: "string" },
  },
}).values;

const loadSession = async (file: string): Promise<Loaded> => {
  const text = await readFile(file, "utf-8");
  const byId = new Map<number, Batch>();
  const received: string[] = [];
  let duplicateLines = 0;
  let unreadableLines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const decoded = decodeLine(line);
    if (decoded._tag === "None") {
      unreadableLines += 1;
      continue;
    }
    const { batch, receivedAt } = decoded.value;
    if (byId.has(batch.batchId)) {
      duplicateLines += 1;
      continue;
    }
    byId.set(batch.batchId, batch);
    received.push(receivedAt);
  }
  return {
    batches: [...byId.values()].toSorted(
      (left, right) => left.batchId - right.batchId
    ),
    duplicateLines,
    id: path.basename(file, ".jsonl"),
    received: received.toSorted(),
    unreadableLines,
  };
};

const bucketLabel = (index: number): string => {
  const edge = HISTOGRAM_EDGES_MS[index];
  return edge === undefined
    ? `>${HISTOGRAM_EDGES_MS.at(-1) ?? 0}`
    : `<=${edge}`;
};

const qualityText = (quality: Quality): string =>
  `rung ${quality.rung} x${quality.pixelRatio.toFixed(2)} bloom ${quality.bloomScale} shadow ${quality.shadowMap} pace ${quality.pace}`;

const seconds = (at: number): string => `${(at / 1000).toFixed(2)} s`;

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

const meterText = (on: boolean | null): string => {
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

const summarise = (
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

const topParts = (frame: WorstFrame, parts: readonly string[]): string =>
  frame.cpu
    .map((cpu, index) => ({ cpu, part: parts[index] ?? `#${index}` }))
    .toSorted((left, right) => right.cpu - left.cpu)
    .slice(0, 4)
    .map((each) => `${each.part} ${each.cpu.toFixed(1)}`)
    .join(", ");

const printSummary = (summary: SessionSummary, parts: readonly string[]) => {
  const { session, batches } = summary;
  const lines = [
    `Session ${session.sessionId}`,
    `  build ${session.build.sha}${session.build.dirty ? " (dirty)" : ""}  device ${summary.devices.join(", ")}  ratio x${session.pixelRatio}  screen ${session.screenWidth}x${session.screenHeight}`,
    `  renderer ${session.renderer || "(not recorded)"}`,
    `  received ${summary.firstReceived} .. ${summary.lastReceived}`,
    `  batches ${batches.received} of ${batches.highest + 1}; missing ${batches.missing.length > 0 ? batches.missing.join(", ") : "none"}; duplicate lines ${batches.duplicateLines}; unreadable ${batches.unreadableLines}`,
    `  reports ${batches.reports.length > 0 ? batches.reports.join(", ") : "none"}`,
    `  dropped: batches ${summary.dropped.batches}, events ${summary.dropped.events}, faults ${summary.dropped.faults}`,
    `  frames ${summary.frames} over ${summary.recordedSeconds.toFixed(1)} s; simulation time discarded ${summary.discardedMs.toFixed(0)} ms`,
    "",
    "Frame intervals",
    ...summary.histogram.map(
      (bucket) =>
        `  ${bucket.bucket.padStart(9)} ms ${String(bucket.count).padStart(7)}  ${(bucket.share * 100).toFixed(1).padStart(5)}%  ${"#".repeat(Math.round(bucket.share * 50))}`
    ),
    "",
    "Quality timeline",
    ...(summary.rungs.length === 0
      ? ["  no changes"]
      : summary.rungs.map(
          (event) =>
            `  ${seconds(event.at).padStart(9)}  frame ${event.frame}  ${event.reason.padEnd(13)} ${qualityText(event.from)}  ->  ${qualityText(event.to)}  late ${event.lateCredit.toFixed(1)} calm ${(event.calmMs / 1000).toFixed(1)} s`
        )),
    `  canvas resizes: ${Object.entries(summary.resizes)
      .map(([source, count]) => `${source} ${count}`)
      .join(", ")}`,
    "",
    "Batches (late is the share of frames over 23.33 ms)",
    ...summary.periods.map(
      (period) =>
        `  ${String(period.batchId).padStart(3)} ${period.kind.padEnd(8)} to ${seconds(period.endsAt).padStart(9)}  frames ${String(period.frames).padStart(5)}  mean ${period.meanMs.toFixed(1).padStart(5)} ms  late ${(period.lateShare * 100).toFixed(1).padStart(5)}%  discarded ${period.discardedMs.toFixed(0).padStart(5)} ms  meter ${meterText(period.overlay)}`
    ),
    `  frame meter: ${summary.overlays.map((event) => `${event.on ? "on" : "off"} at ${seconds(event.at)}`).join(", ") || "never recorded"}`,
    "",
    "Race markers",
    ...summary.races.map(
      (event) =>
        `  ${seconds(event.at).padStart(9)}  race ${event.race}  ${event.stage} at tick ${event.tick}`
    ),
    "",
    "Report markers",
    ...(summary.markers.length === 0
      ? ["  none"]
      : summary.markers.map(
          (marker) =>
            `  ${seconds(marker.at).padStart(9)}  race ${marker.race} tick ${marker.tick} frame ${marker.frame}${marker.nearRung ? `  rung: ${marker.nearRung}` : ""}${marker.nearWorst ? `  slow: ${marker.nearWorst}` : ""}`
        )),
    "",
    `Worst ${summary.worst.length} frames`,
    ...summary.worst.map(
      (frame) =>
        `  frame ${String(frame.frame).padStart(6)} ${frame.intervalMs.toFixed(1).padStart(7)} ms  at ${seconds(frame.at)}  race ${frame.race} tick ${frame.tick}  rung ${frame.drawRung}->${frame.nextRung} x${frame.pixelRatio.toFixed(2)}  ${topParts(frame, parts)}`
    ),
    "",
    "Faults",
    ...(summary.faults.length === 0
      ? ["  none"]
      : summary.faults.map(
          (fault) =>
            `  ${seconds(fault.at)}  ${fault.source}  ${fault.message}  ${fault.where}`
        )),
    "",
    "Black-frame suspects",
    ...(summary.suspects.length === 0
      ? ["  none: no resize after draw, no context loss, no unfinished pass"]
      : summary.suspects.map(
          (suspect, index) =>
            `  ${index + 1}. [${suspect.kind}] ${seconds(suspect.at)}  ${suspect.detail}`
        )),
  ];
  console.log(lines.join("\n"));
};

const names = await readdir(options.dir).catch((): string[] => []);
const files = names
  .filter((name) => name.endsWith(".jsonl"))
  .map((name) => path.join(options.dir, name));
const loaded = await Promise.all(files.map(loadSession));
const worstLimit = Number(options.worst);
const summaries = loaded
  .filter((each) => !options.session || each.id.startsWith(options.session))
  .map((each) => ({
    parts: each.batches.at(-1)?.parts ?? [],
    summary: summarise(each, worstLimit),
  }))
  .filter(
    (each): each is { parts: string[]; summary: SessionSummary } =>
      each.summary !== null &&
      (!options.device || each.summary.devices.includes(options.device))
  )
  .toSorted((left, right) =>
    left.summary.lastReceived.localeCompare(right.summary.lastReceived)
  );

if (options.json) {
  console.log(
    JSON.stringify(
      summaries.map((each) => each.summary),
      null,
      2
    )
  );
} else if (summaries.length === 0) {
  console.log(`No sessions in ${options.dir}.`);
} else {
  console.log(`${summaries.length} session(s) in ${options.dir}`);
  for (const { summary } of summaries) {
    console.log(
      `  ${summary.session.sessionId}  ${summary.devices.join(",").padEnd(11)}  ${summary.session.build.sha}${summary.session.build.dirty ? "+" : " "}  ${summary.lastReceived}  batches ${summary.batches.received}  frames ${summary.frames}  markers ${summary.markers.length}  suspects ${summary.suspects.length}`
    );
  }
  const latest = summaries.at(-1);
  if (latest) {
    console.log("");
    printSummary(latest.summary, latest.parts);
  }
}
