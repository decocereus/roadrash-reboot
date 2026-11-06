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

export interface RaceTally {
  readonly heardRtt: (rttMs: number) => void;
  readonly heardTick: (now: number) => void;
  readonly frameDrawn: (
    now: number,
    roadMetres: number,
    confirmedTick: number
  ) => void;
  readonly stepped: (steps: number) => void;
  readonly read: (client: RoomClient, rttWorstMs: number) => RaceStats;
  readonly closedTraceRows: () => readonly number[];
  readonly lastTraceRows: () => readonly number[];
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

export const createRaceTally = (): RaceTally => {
  let rttTotal = 0;
  let rttCount = 0;
  let lastFrameAt = 0;
  let lastConfirmedTick = 0;
  let held = 0;
  let doubled = 0;
  let mostSteps = 0;
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

  const takeRows = (): readonly number[] => {
    const from = rowsTaken;
    rowsTaken = rowsUsed;
    return [
      ...rows.subarray(from * TRACE_ROW_FIELDS, rowsUsed * TRACE_ROW_FIELDS),
    ];
  };

  return {
    closedTraceRows: takeRows,
    frameDrawn: (now, roadMetres, confirmedTick) => {
      if (lastFrameAt === 0) {
        firstFrameAt = now;
        rowStartedAt = now;
      } else {
        const frameMs = now - lastFrameAt;
        slowFrames += frameMs >= SLOW_FRAME_MS ? 1 : 0;
        frameCount += 1;
        const counted = Math.min(LONGEST_COUNTED_FRAME_MS, Math.floor(frameMs));
        frameMsCounts[counted] = (frameMsCounts[counted] ?? 0) + 1;
        open[TraceField.frames] = (open[TraceField.frames] ?? 0) + 1;
        open[TraceField.worstFrameMs] = Math.max(
          open[TraceField.worstFrameMs] ?? 0,
          frameMs
        );
        if (frameMs > worstFrameMs) {
          worstFrameMs = frameMs;
          worstFrameRoadMetres = roadMetres;
        }
      }
      lastFrameAt = now;
      lastConfirmedTick = confirmedTick;
      if (now - rowStartedAt >= TRACE_ROW_MS) {
        closeRow(now, confirmedTick);
      }
    },
    heardRtt: (rttMs) => {
      rttTotal += rttMs;
      rttCount += 1;
      open[TraceField.worstRttMs] = Math.max(
        open[TraceField.worstRttMs] ?? 0,
        rttMs
      );
    },
    heardTick: (now) => {
      open[TraceField.ticksHeard] = (open[TraceField.ticksHeard] ?? 0) + 1;
      if (lastTickAt > 0) {
        open[TraceField.worstTickGapMs] = Math.max(
          open[TraceField.worstTickGapMs] ?? 0,
          now - lastTickAt
        );
      }
      lastTickAt = now;
    },
    lastTraceRows: () => {
      if (open.some((value) => value > 0)) {
        closeRow(lastFrameAt, lastConfirmedTick);
      }
      return takeRows();
    },
    read: ({ mine, predicted, stats }, rttWorstMs) => ({
      crashes: mine.crashes,
      crashesAfterCorrection: stats.crashesAfterCorrection,
      desyncs: stats.desyncs,
      doubledSteps: doubled,
      finished: mine.finishTick >= 0 ? 1 : 0,
      frameCount,
      frameP50Ms: percentileOf(frameMsCounts, frameCount, P50),
      frameP95Ms: percentileOf(frameMsCounts, frameCount, P95),
      frameP99Ms: percentileOf(frameMsCounts, frameCount, P99),
      heldSteps: held,
      jumpsBehindServer: stats.jumps.behindServer.felt,
      jumpsOtherRiders: stats.jumps.otherRiders.felt,
      jumpsOwnControl: stats.jumps.ownControl.felt,
      mostSteps,
      refusedPredictions: stats.refusedPredictions,
      resimulatedTicks: stats.resimulatedTicks,
      retriedPresses: stats.retriedPresses,
      rollbacks: stats.rollbacks,
      rttMeanMs: rttCount === 0 ? 0 : rttTotal / rttCount,
      rttWorstMs,
      slowFrames,
      tick: predicted.tick,
      totalBehindServerCm: stats.jumps.behindServer.totalMetres * CENTIMETRES,
      totalOtherRidersCm: stats.jumps.otherRiders.totalMetres * CENTIMETRES,
      totalOwnControlCm: stats.jumps.ownControl.totalMetres * CENTIMETRES,
      worstBehindServerCm: stats.jumps.behindServer.worstMetres * CENTIMETRES,
      worstFrameMs,
      worstFrameRoadMetres,
      worstJumpRoadMetres: stats.worstJump.roadMetres,
      worstJumpTick: stats.worstJump.tick,
      worstOtherRidersCm: stats.jumps.otherRiders.worstMetres * CENTIMETRES,
      worstOwnControlCm: stats.jumps.ownControl.worstMetres * CENTIMETRES,
    }),
    stepped: (steps) => {
      held += steps === 0 ? 1 : 0;
      doubled += steps >= 2 ? 1 : 0;
      mostSteps = Math.max(mostSteps, steps);
      open[TraceField.held] =
        (open[TraceField.held] ?? 0) + (steps === 0 ? 1 : 0);
      open[TraceField.doubled] =
        (open[TraceField.doubled] ?? 0) + (steps >= 2 ? 1 : 0);
    },
  };
};
