import type { RoomClient } from "@racer/sim/room-client";
import type { RaceStats } from "@racer/sim/room-wire";

const SLOW_FRAME_MS = 50;
const CENTIMETRES = 100;

export interface RaceTally {
  readonly heardRtt: (rttMs: number) => void;
  readonly frameDrawn: (now: number, roadMetres: number) => void;
  readonly stepped: (steps: number) => void;
  readonly read: (client: RoomClient, rttWorstMs: number) => RaceStats;
}

export const createRaceTally = (): RaceTally => {
  let rttTotal = 0;
  let rttCount = 0;
  let lastFrameAt = 0;
  let held = 0;
  let doubled = 0;
  let mostSteps = 0;
  let slowFrames = 0;
  let worstFrameMs = 0;
  let worstFrameRoadMetres = 0;
  return {
    frameDrawn: (now, roadMetres) => {
      const frameMs = lastFrameAt === 0 ? 0 : now - lastFrameAt;
      lastFrameAt = now;
      slowFrames += frameMs >= SLOW_FRAME_MS ? 1 : 0;
      if (frameMs > worstFrameMs) {
        worstFrameMs = frameMs;
        worstFrameRoadMetres = roadMetres;
      }
    },
    heardRtt: (rttMs) => {
      rttTotal += rttMs;
      rttCount += 1;
    },
    read: ({ mine, predicted, stats }, rttWorstMs) => ({
      desyncs: stats.desyncs,
      doubledSteps: doubled,
      finished: mine.finishTick >= 0 ? 1 : 0,
      heldSteps: held,
      jumpsBehindServer: stats.jumps.behindServer.felt,
      jumpsOtherRiders: stats.jumps.otherRiders.felt,
      jumpsOwnControl: stats.jumps.ownControl.felt,
      mostSteps,
      refusedPredictions: stats.refusedPredictions,
      resimulatedTicks: stats.resimulatedTicks,
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
    },
  };
};
