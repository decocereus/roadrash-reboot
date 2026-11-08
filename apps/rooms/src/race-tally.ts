import type { RoomClient } from "@racer/sim/room-client";
import type { RaceStats } from "@racer/sim/room-wire";

import {
  MOST_TRACE_ROWS,
  TRACE_ROW_FIELDS,
  TRACE_ROW_MS,
  TraceField,
} from "./tape.ts";

const SLOW_FRAME_MS = 50;
const CENTIMETRES = 100;
const LONGEST_COUNTED_FRAME_MS = 255;
const P50 = 0.5;
const P95 = 0.95;
const P99 = 0.99;
const SLOWED_BELOW_PACE = 0.95;
const STOPPED_BELOW_PACE = 0.5;
const SURGED_FROM_METRES = 0.05;

export interface RaceTally {
  readonly heardRtt: (rttMs: number) => void;
  readonly heardTick: (now: number) => void;
  readonly frameDrawn: (
    now: number,
    roadMetres: number,
    confirmedTick: number,
    pace: number,
    ownOffMetres: number,
    rivalOffMetres: number
  ) => void;
  readonly read: (client: RoomClient, rttWorstMs: number) => RaceStats;
  readonly closedTraceRows: () => readonly number[] | null;
  readonly lastTraceRows: () => readonly number[] | null;
  readonly traceOff: () => readonly number[] | null;
  readonly traceOn: (now: number) => void;
}

const percentileOf = (
  counts: Uint32Array,
  total: number,
  share: number
): number => {
  const wanted = Math.ceil(total * share);
  let seen = 0;
  for (let frameMs = 0; frameMs < counts.length; frameMs += 1) {
    seen += counts[frameMs] ?? 0;
    if (seen >= wanted && seen > 0) {
      return frameMs;
    }
  }
  return 0;
};

export const createRaceTally = (sharing: boolean): RaceTally => {
  let rttTotal = 0;
  let rttCount = 0;
  let lastFrameAt = 0;
  let lastConfirmedTick = 0;
  let slowedMs = 0;
  let stoppedMs = 0;
  let surgedFrames = 0;
  let rivalsSurgedFrames = 0;
  let worstDrawnOffMetres = 0;
  let slowFrames = 0;
  let worstFrameMs = 0;
  let worstFrameRoadMetres = 0;
  let frameCount = 0;
  const frameMsCounts = new Uint32Array(LONGEST_COUNTED_FRAME_MS + 1);

  const rows = new Uint32Array(MOST_TRACE_ROWS * TRACE_ROW_FIELDS);
  let rowsUsed = 0;
  let rowsTaken = 0;
  let firstFrameAt = 0;
  let rowStartedAt = 0;
  let lastTickAt = 0;
  const open = new Uint32Array(TRACE_ROW_FIELDS);
  let tracing = sharing;

  const closeRow = (now: number, confirmedTick: number): void => {
    if (rowsUsed < MOST_TRACE_ROWS) {
      open[TraceField.atMs] = now - firstFrameAt;
      open[TraceField.tick] = confirmedTick;
      rows.set(open, rowsUsed * TRACE_ROW_FIELDS);
      rowsUsed += 1;
    }
    open.fill(0);
    rowStartedAt = now;
  };

  const takeRows = (): readonly number[] | null => {
    if (!tracing) {
      return null;
    }
    const from = rowsTaken;
    rowsTaken = rowsUsed;
    return [
      ...rows.subarray(from * TRACE_ROW_FIELDS, rowsUsed * TRACE_ROW_FIELDS),
    ];
  };

  const lastRows = (): readonly number[] | null => {
    if (tracing && open.some((value) => value > 0)) {
      closeRow(lastFrameAt, lastConfirmedTick);
    }
    return takeRows();
  };

  return {
    closedTraceRows: takeRows,
    frameDrawn: (
      now,
      roadMetres,
      confirmedTick,
      pace,
      ownOffMetres,
      rivalOffMetres
    ) => {
      if (lastFrameAt === 0) {
        firstFrameAt = now;
        rowStartedAt = now;
      } else {
        const frameMs = now - lastFrameAt;
        slowFrames += frameMs >= SLOW_FRAME_MS ? 1 : 0;
        frameCount += 1;
        const counted = Math.min(LONGEST_COUNTED_FRAME_MS, Math.floor(frameMs));
        frameMsCounts[counted] = (frameMsCounts[counted] ?? 0) + 1;
        const slowed = pace < SLOWED_BELOW_PACE ? frameMs : 0;
        const surged = ownOffMetres > SURGED_FROM_METRES ? 1 : 0;
        slowedMs += slowed;
        stoppedMs += pace < STOPPED_BELOW_PACE ? frameMs : 0;
        surgedFrames += surged;
        rivalsSurgedFrames += rivalOffMetres > SURGED_FROM_METRES ? 1 : 0;
        worstDrawnOffMetres = Math.max(
          worstDrawnOffMetres,
          ownOffMetres,
          rivalOffMetres
        );
        if (tracing) {
          open[TraceField.slowedMs] = (open[TraceField.slowedMs] ?? 0) + slowed;
          open[TraceField.surgedFrames] =
            (open[TraceField.surgedFrames] ?? 0) + surged;
          open[TraceField.frames] = (open[TraceField.frames] ?? 0) + 1;
          open[TraceField.worstFrameMs] = Math.max(
            open[TraceField.worstFrameMs] ?? 0,
            frameMs
          );
        }
        if (frameMs > worstFrameMs) {
          worstFrameMs = frameMs;
          worstFrameRoadMetres = roadMetres;
        }
      }
      lastFrameAt = now;
      lastConfirmedTick = confirmedTick;
      if (tracing && now - rowStartedAt >= TRACE_ROW_MS) {
        closeRow(now, confirmedTick);
      }
    },
    heardRtt: (rttMs) => {
      rttTotal += rttMs;
      rttCount += 1;
      if (tracing) {
        open[TraceField.worstRttMs] = Math.max(
          open[TraceField.worstRttMs] ?? 0,
          rttMs
        );
      }
    },
    heardTick: (now) => {
      if (!tracing) {
        return;
      }
      open[TraceField.ticksHeard] = (open[TraceField.ticksHeard] ?? 0) + 1;
      if (lastTickAt > 0) {
        open[TraceField.worstTickGapMs] = Math.max(
          open[TraceField.worstTickGapMs] ?? 0,
          now - lastTickAt
        );
      }
      lastTickAt = now;
    },
    lastTraceRows: lastRows,
    read: ({ mine, predicted, stats }, rttWorstMs) => ({
      crashes: mine.crashes,
      crashesAfterCorrection: stats.crashesAfterCorrection,
      desyncs: stats.desyncs,
      finished: mine.finishTick >= 0 ? 1 : 0,
      frameCount,
      frameP50Ms: percentileOf(frameMsCounts, frameCount, P50),
      frameP95Ms: percentileOf(frameMsCounts, frameCount, P95),
      frameP99Ms: percentileOf(frameMsCounts, frameCount, P99),
      jumpsBehindServer: stats.jumps.behindServer.felt,
      jumpsOtherRiders: stats.jumps.otherRiders.felt,
      jumpsOwnControl: stats.jumps.ownControl.felt,
      refusedPredictions: stats.refusedPredictions,
      resimulatedTicks: stats.resimulatedTicks,
      retriedPresses: stats.retriedPresses,
      rivalsSurgedFrames,
      rollbacks: stats.rollbacks,
      rttMeanMs: rttCount === 0 ? 0 : rttTotal / rttCount,
      rttWorstMs,
      slowFrames,
      slowedMs,
      stoppedMs,
      surgedFrames,
      tick: predicted.tick,
      totalBehindServerCm: stats.jumps.behindServer.totalMetres * CENTIMETRES,
      totalOtherRidersCm: stats.jumps.otherRiders.totalMetres * CENTIMETRES,
      totalOwnControlCm: stats.jumps.ownControl.totalMetres * CENTIMETRES,
      worstBehindServerCm: stats.jumps.behindServer.worstMetres * CENTIMETRES,
      worstDrawnOffCm: worstDrawnOffMetres * CENTIMETRES,
      worstFrameMs,
      worstFrameRoadMetres,
      worstJumpRoadMetres: stats.worstJump.roadMetres,
      worstJumpTick: stats.worstJump.tick,
      worstOtherRidersCm: stats.jumps.otherRiders.worstMetres * CENTIMETRES,
      worstOwnControlCm: stats.jumps.ownControl.worstMetres * CENTIMETRES,
    }),
    traceOff: () => {
      const taken = lastRows();
      tracing = false;
      lastTickAt = 0;
      return taken;
    },
    traceOn: (now) => {
      if (!tracing) {
        tracing = true;
        rowStartedAt = now;
      }
    },
  };
};
