import type { RiderCorrection } from "@racer/sim/room-client";
import { riderOf } from "@racer/sim/state";

const SETTLE_MS = 100;
const MOST_ALONG_METRES = 15;
const MOST_ACROSS_METRES = 6;
const ALONG_SHARE_OF_SPEED = 0.1;
const SLOWEST_ALONG_METRES_PER_SECOND = 0.5;
const ACROSS_METRES_PER_SECOND = 2.5;
const MEASURED_FROM_METRES = 0.1;

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

const clamped = (value: number, most: number): number =>
  Math.min(most, Math.max(-most, value));

const settled = (left: number, by: number, most: number): number =>
  left - clamped(left * by, most);

export const driftBy = (drift: RiderDrift, moved: RiderCorrection): void => {
  drift.heading += moved.heading;
  drift.lean += moved.lean;
  drift.s = clamped(drift.s + moved.s, MOST_ALONG_METRES);
  drift.x = clamped(drift.x + moved.x, MOST_ACROSS_METRES);
};

export const driftSettle = (
  drift: RiderDrift,
  seconds: number,
  speed: number
): void => {
  const by = 1 - Math.exp((-seconds * 1000) / SETTLE_MS);
  drift.heading -= drift.heading * by;
  drift.lean -= drift.lean * by;
  drift.s = settled(
    drift.s,
    by,
    Math.max(
      SLOWEST_ALONG_METRES_PER_SECOND,
      ALONG_SHARE_OF_SPEED * Math.abs(speed)
    ) * seconds
  );
  drift.x = settled(drift.x, by, ACROSS_METRES_PER_SECOND * seconds);
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

export const drawnShare = (
  drawnS: number,
  lastDrawnS: number,
  speed: number,
  seconds: number
): number => {
  const expected = speed * seconds;
  return Number.isFinite(drawnS) &&
    Number.isFinite(lastDrawnS) &&
    expected > MEASURED_FROM_METRES
    ? (drawnS - lastDrawnS) / expected
    : 1;
};
