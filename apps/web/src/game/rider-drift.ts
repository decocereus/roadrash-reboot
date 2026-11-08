import type { RiderCorrection } from "@racer/sim/room-client";
import { riderOf } from "@racer/sim/state";

const SETTLE_MS = 100;
const MOST_ALONG_METRES = 15;
const MOST_ACROSS_METRES = 6;

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

interface Placed {
  heading: number;
  lean: number;
  s: number;
  x: number;
}

interface PlacedView<Pose extends Placed> {
  readonly after: Pose;
  readonly before: Pose;
  readonly drift: RiderDrift;
}

export const captureCast = <Rider, Pose extends Placed>(
  into: "after" | "before",
  riders: readonly Rider[],
  views: readonly PlacedView<Pose>[],
  corrections: readonly RiderCorrection[],
  capture: (rider: Rider, pose: Pose) => void
): void => {
  for (const moved of corrections) {
    const view = riderOf(views, moved.rider);
    if (view) {
      view.before.heading -= moved.heading;
      view.before.lean -= moved.lean;
      view.before.s -= moved.s;
      view.before.x -= moved.x;
      driftBy(view.drift, moved);
    }
  }
  for (let index = 0; index < riders.length; index += 1) {
    const rider = riders[index];
    const view = views[index];
    if (rider !== undefined && view) {
      capture(rider, view[into]);
    }
  }
};
