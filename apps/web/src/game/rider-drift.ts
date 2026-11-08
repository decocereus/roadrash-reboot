import type { RiderCorrection } from "@racer/sim/room-client";
import { riderOf } from "@racer/sim/state";

const SETTLE_MS = 100;
const ALONG_SHARE_OF_SPEED = 0.1;
const SLOWEST_ALONG_METRES_PER_SECOND = 0.5;
const ACROSS_METRES_PER_SECOND = 2.5;
const PACE_SHARE_UNSEEN = 0.1;

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

const settled = (
  left: number,
  by: number,
  perSecond: number,
  seconds: number
): number => {
  const most = perSecond * seconds;
  return left - Math.min(most, Math.max(-most, left * by));
};

const alongGlide = (speed: number): number =>
  Math.max(
    SLOWEST_ALONG_METRES_PER_SECOND,
    ALONG_SHARE_OF_SPEED * Math.abs(speed)
  );

export const driftBy = (drift: RiderDrift, moved: RiderCorrection): void => {
  drift.heading += moved.heading;
  drift.lean += moved.lean;
  drift.s += moved.s;
  drift.x += moved.x;
};

export const driftSettle = (
  drift: RiderDrift,
  seconds: number,
  speed: number
): void => {
  const by = 1 - Math.exp((-seconds * 1000) / SETTLE_MS);
  drift.heading -= drift.heading * by;
  drift.lean -= drift.lean * by;
  drift.s = settled(drift.s, by, alongGlide(speed), seconds);
  drift.x = settled(drift.x, by, ACROSS_METRES_PER_SECOND, seconds);
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

export const drawnOff = (
  moved: number,
  glidedAcross: number,
  speed: number,
  lastSpeed: number,
  seconds: number
): number => {
  if (!Number.isFinite(moved)) {
    return 0;
  }
  const slowest = Math.min(speed, lastSpeed) * seconds;
  const fastest = Math.max(speed, lastSpeed) * seconds;
  const unseen =
    PACE_SHARE_UNSEEN * Math.max(Math.abs(slowest), Math.abs(fastest)) +
    alongGlide(Math.max(Math.abs(speed), Math.abs(lastSpeed))) * seconds;
  const along = Math.max(0, moved - fastest - unseen, slowest - unseen - moved);
  const across = Math.max(
    0,
    Math.abs(glidedAcross) - ACROSS_METRES_PER_SECOND * seconds
  );
  return Math.hypot(along, across);
};
