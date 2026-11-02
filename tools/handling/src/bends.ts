import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

const BEND_CURVATURE = 3e-4;
const MERGE_GAP = 15;
const MIN_TURN_DEGREES = 2;
const TAIL_METRES = 30;

export interface Bend {
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly peakCurvature: number;
  readonly turnDegrees: number;
  readonly watchTo: number;
}

interface Run {
  readonly from: number;
  readonly sign: number;
  to: number;
}

const runsOf = (track: Track): readonly Run[] => {
  const runs: Run[] = [];
  for (let s = 0; s < track.length; s += 1) {
    const curvature = curvatureAt(track, s);
    if (Math.abs(curvature) > BEND_CURVATURE) {
      const sign = Math.sign(curvature);
      const last = runs.at(-1);
      if (last && last.sign === sign && s - last.to <= MERGE_GAP) {
        last.to = s + 1;
      } else {
        runs.push({ from: s, sign, to: s + 1 });
      }
    }
  }
  return runs;
};

export const bendsOf = (track: Track): readonly Bend[] => {
  const bends: Bend[] = [];
  for (const run of runsOf(track)) {
    let turn = 0;
    let peak = 0;
    for (let s = run.from; s < run.to; s += 1) {
      const curvature = curvatureAt(track, s);
      turn += curvature;
      peak = Math.max(peak, Math.abs(curvature));
    }
    const turnDegrees = Math.abs((turn * 180) / Math.PI);
    if (turnDegrees >= MIN_TURN_DEGREES) {
      bends.push({
        from: run.from,
        index: bends.length,
        peakCurvature: peak,
        to: run.to,
        turnDegrees,
        watchTo: run.to + TAIL_METRES,
      });
    }
  }
  return bends.map((bend, at) => ({
    ...bend,
    watchTo: Math.min(bend.watchTo, bends[at + 1]?.from ?? bend.watchTo),
  }));
};
