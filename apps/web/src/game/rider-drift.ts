import type { RiderCorrection } from "@racer/sim/room-client";

const SETTLE_MS = 100;
const MOST_ALONG_METRES = 6;
const MOST_ACROSS_METRES = 3;

export interface RiderDrift {
  heading: number;
  lean: number;
  s: number;
  x: number;
}

export const stillDrift = (): RiderDrift => ({
  heading: 0,
  lean: 0,
  s: 0,
  x: 0,
});

export const clearDrift = (drift: RiderDrift): void => {
  drift.heading = 0;
  drift.lean = 0;
  drift.s = 0;
  drift.x = 0;
};

export const driftBy = (drift: RiderDrift, moved: RiderCorrection): void => {
  drift.heading += moved.heading;
  drift.lean += moved.lean;
  drift.s += moved.s;
  drift.x += moved.x;
  if (
    Math.abs(drift.s) > MOST_ALONG_METRES ||
    Math.abs(drift.x) > MOST_ACROSS_METRES
  ) {
    clearDrift(drift);
  }
};

export const driftSettle = (drift: RiderDrift, seconds: number): void => {
  const left = Math.exp((-seconds * 1000) / SETTLE_MS);
  drift.heading *= left;
  drift.lean *= left;
  drift.s *= left;
  drift.x *= left;
};
