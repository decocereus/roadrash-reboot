import type { RiderCorrection } from "@racer/sim/room-client";
import { PACE_SLEW_PER_SECOND } from "@racer/sim/room-pace";
import { riderOf } from "@racer/sim/state";

const SETTLE_SECONDS = 0.1;
const ALONG_SHARE_OF_SPEED = 0.1;
const SLOWEST_ALONG_METRES_PER_SECOND = 0.5;
const ACROSS_METRES_PER_SECOND = 2.5;
const GLIDE_ACCELERATION = 25;
const PACE_SHARE_UNSEEN = 0.1;

export interface RiderDrift {
  across: number;
  along: number;
  heading: number;
  kicked: number;
  lean: number;
  s: number;
  x: number;
}

export const stillDrift = (): RiderDrift => ({
  across: 0,
  along: 0,
  heading: 0,
  kicked: 0,
  lean: 0,
  s: 0,
  x: 0,
});

export const clearDrift = (drift: RiderDrift): void => {
  drift.across = 0;
  drift.along = 0;
  drift.heading = 0;
  drift.kicked = 0;
  drift.lean = 0;
  drift.s = 0;
  drift.x = 0;
};

const glided = (
  gap: number,
  rate: number,
  most: number,
  seconds: number
): number => {
  const size = Math.abs(gap);
  const wanted =
    -Math.sign(gap) *
    Math.min(
      most,
      size / SETTLE_SECONDS,
      Math.sqrt(2 * GLIDE_ACCELERATION * size)
    );
  const step = GLIDE_ACCELERATION * seconds;
  return rate + Math.min(step, Math.max(-step, wanted - rate));
};

const alongGlide = (speed: number): number =>
  Math.max(
    SLOWEST_ALONG_METRES_PER_SECOND,
    ALONG_SHARE_OF_SPEED * Math.abs(speed)
  );

export const driftBy = (drift: RiderDrift, moved: RiderCorrection): void => {
  drift.along += moved.speed;
  drift.heading += moved.heading;
  drift.kicked += moved.speed;
  drift.lean += moved.lean;
  drift.s += moved.s;
  drift.x += moved.x;
};

export const driftSettle = (
  drift: RiderDrift,
  seconds: number,
  speed: number
): void => {
  const by = 1 - Math.exp(-seconds / SETTLE_SECONDS);
  drift.heading -= drift.heading * by;
  drift.lean -= drift.lean * by;
  drift.along = glided(drift.s, drift.along, alongGlide(speed), seconds);
  drift.across = glided(
    drift.x,
    drift.across,
    ACROSS_METRES_PER_SECOND,
    seconds
  );
  drift.s += drift.along * seconds;
  drift.x += drift.across * seconds;
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

const beyond = (
  drawn: number,
  riding: number,
  perSecond: number,
  seconds: number
): number =>
  Math.max(
    0,
    Math.abs(drawn - riding) -
      PACE_SHARE_UNSEEN * Math.abs(riding) -
      perSecond * seconds
  );

export interface DrawnRates {
  drawnRate: number;
  ridingRate: number;
}

export const drawnOff = (
  drawnAlong: number,
  ridingAlong: number,
  drawnAcross: number,
  ridingAcross: number,
  ridingSeconds: number,
  kicked: number,
  speed: number,
  seconds: number,
  last: DrawnRates
): number => {
  const atPace = ridingSeconds > 0 ? seconds / ridingSeconds : 0;
  const drawnRate = drawnAlong / seconds;
  const ridingRate = (ridingAlong * atPace) / seconds;
  const sped = beyond(
    drawnRate - last.drawnRate,
    ridingRate - last.ridingRate + kicked,
    GLIDE_ACCELERATION + PACE_SLEW_PER_SECOND * Math.abs(speed),
    seconds
  );
  last.drawnRate = drawnRate;
  last.ridingRate = ridingRate;
  return Math.hypot(
    sped * seconds,
    beyond(
      drawnAcross,
      ridingAcross * atPace,
      ACROSS_METRES_PER_SECOND,
      seconds
    )
  );
};
