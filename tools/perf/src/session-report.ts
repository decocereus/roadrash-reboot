import {
  meterText,
  qualityText,
  seconds,
  topParts,
} from "./session-summary.ts";
import type { SessionSummary } from "./session-summary.ts";

export const printSummary = (
  summary: SessionSummary,
  parts: readonly string[]
) => {
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
