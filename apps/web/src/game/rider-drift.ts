import type { RiderCorrection } from "@racer/sim/room-client";
import { PACE_SLEW_PER_SECOND } from "@racer/sim/room-pace";
import { riderOf, TICK_SECONDS } from "@racer/sim/state";
import { kick, punch } from "@racer/sim/weapons";

const SETTLE_SECONDS = 0.1;
const ALONG_SHARE_OF_SPEED = 0.1;
const FASTEST_ALONG_SHARE_OF_SPEED = 0.25;
const SLOWEST_ALONG_METRES_PER_SECOND = 0.5;
const ACROSS_METRES_PER_SECOND = 2.5;
const GLIDE_ACCELERATION = 25;
const PACE_SHARE_UNSEEN = 0.1;
const TRUSTED_SHARE_OF_REACH = 0.5;
const STRIKE_SECONDS = Math.min(kick.ticks, punch.ticks) * TICK_SECONDS;
const TRUSTED_ALONG_METRES = TRUSTED_SHARE_OF_REACH * punch.reachS;
const TRUSTED_ACROSS_METRES = TRUSTED_SHARE_OF_REACH * punch.reachX;
const FASTEST_ACROSS_METRES_PER_SECOND =
  ACROSS_METRES_PER_SECOND + TRUSTED_ACROSS_METRES / STRIKE_SECONDS;

export interface RiderDrift {
  across: number;
  air: number;
  along: number;
  heading: number;
  kicked: number;
  lean: number;
  s: number;
  swerved: number;
  x: number;
}

export const stillDrift = (): RiderDrift => ({
  across: 0,
  air: 0,
  along: 0,
  heading: 0,
  kicked: 0,
  lean: 0,
  s: 0,
  swerved: 0,
  x: 0,
});

export const clearDrift = (drift: RiderDrift): void => {
  drift.across = 0;
  drift.air = 0;
  drift.along = 0;
  drift.heading = 0;
  drift.kicked = 0;
  drift.lean = 0;
  drift.s = 0;
  drift.swerved = 0;
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

const pastTrusted = (gap: number, trusted: number): number =>
  Math.max(0, Math.abs(gap) - trusted) / SETTLE_SECONDS;

const alongGlide = (speed: number, gap: number): number =>
  Math.max(
    SLOWEST_ALONG_METRES_PER_SECOND,
    Math.min(
      FASTEST_ALONG_SHARE_OF_SPEED * Math.abs(speed),
      ALONG_SHARE_OF_SPEED * Math.abs(speed) +
        pastTrusted(gap, TRUSTED_ALONG_METRES)
    )
  );

const acrossGlide = (gap: number): number =>
  Math.min(
    FASTEST_ACROSS_METRES_PER_SECOND,
    ACROSS_METRES_PER_SECOND + pastTrusted(gap, TRUSTED_ACROSS_METRES)
  );

export const driftBy = (drift: RiderDrift, moved: RiderCorrection): void => {
  drift.across += moved.lateralSpeed;
  drift.air += moved.air;
  drift.along += moved.speed;
  drift.heading += moved.heading;
  drift.kicked += moved.speed;
  drift.lean += moved.lean;
  drift.s += moved.s;
  drift.swerved += moved.lateralSpeed;
  drift.x += moved.x;
};

export const driftSettle = (
  drift: RiderDrift,
  seconds: number,
  speed: number
): void => {
  const by = 1 - Math.exp(-seconds / SETTLE_SECONDS);
  drift.air -= drift.air * by;
  drift.heading -= drift.heading * by;
  drift.lean -= drift.lean * by;
  drift.along = glided(
    drift.s,
    drift.along,
    alongGlide(speed, drift.s),
    seconds
  );
  drift.across = glided(drift.x, drift.across, acrossGlide(drift.x), seconds);
  drift.s += drift.along * seconds;
  drift.x += drift.across * seconds;
};

interface Placed {
  air: number;
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
      view.before.air -= moved.air;
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
  drawnAcrossRate: number;
  drawnAlongRate: number;
  ridingAcrossRate: number;
  ridingAlongRate: number;
}

const rateOff = (
  drawnRate: number,
  lastDrawnRate: number,
  ridingRate: number,
  lastRidingRate: number,
  carried: number,
  most: number,
  seconds: number
): number =>
  Number.isNaN(lastDrawnRate)
    ? 0
    : beyond(
        drawnRate - lastDrawnRate,
        ridingRate - lastRidingRate + carried,
        most,
        seconds
      );

export const drawnOff = (
  measured: boolean,
  drawnAlong: number,
  ridingAlong: number,
  drawnAcross: number,
  ridingAcross: number,
  ridingSeconds: number,
  carried: Pick<RiderDrift, "kicked" | "swerved">,
  speed: number,
  seconds: number,
  last: DrawnRates
): number => {
  if (!measured) {
    last.drawnAcrossRate = Number.NaN;
    last.drawnAlongRate = Number.NaN;
    last.ridingAcrossRate = Number.NaN;
    last.ridingAlongRate = Number.NaN;
    return 0;
  }
  const atPace = ridingSeconds > 0 ? seconds / ridingSeconds : 0;
  const most = GLIDE_ACCELERATION + PACE_SLEW_PER_SECOND * Math.abs(speed);
  const drawnAlongRate = drawnAlong / seconds;
  const ridingAlongRate = (ridingAlong * atPace) / seconds;
  const drawnAcrossRate = drawnAcross / seconds;
  const ridingAcrossRate = (ridingAcross * atPace) / seconds;
  const sped = rateOff(
    drawnAlongRate,
    last.drawnAlongRate,
    ridingAlongRate,
    last.ridingAlongRate,
    carried.kicked,
    most,
    seconds
  );
  const swerved = rateOff(
    drawnAcrossRate,
    last.drawnAcrossRate,
    ridingAcrossRate,
    last.ridingAcrossRate,
    carried.swerved,
    most,
    seconds
  );
  last.drawnAcrossRate = drawnAcrossRate;
  last.drawnAlongRate = drawnAlongRate;
  last.ridingAcrossRate = ridingAcrossRate;
  last.ridingAlongRate = ridingAlongRate;
  return Math.hypot(sped, swerved) * seconds;
};

export interface DrawnPlace extends DrawnRates {
  air: number;
  blend: number;
  fromTick: number;
  off: number;
  riding: boolean;
  s: number;
  toTick: number;
  x: number;
}

export const stillDrawn = (): DrawnPlace => ({
  air: 0,
  blend: 0,
  drawnAcrossRate: 0,
  drawnAlongRate: 0,
  fromTick: 0,
  off: 0,
  riding: false,
  ridingAcrossRate: 0,
  ridingAlongRate: 0,
  s: 0,
  toTick: 0,
  x: 0,
});

interface Ticked {
  readonly air: number;
  readonly s: number;
  readonly tick: number;
  readonly x: number;
}

interface DrawnView {
  readonly after: Ticked;
  readonly before: Ticked;
  readonly drawn: DrawnPlace;
  readonly drift: RiderDrift;
}

const mix = (from: number, to: number, blend: number): number =>
  from + (to - from) * blend;

export const placeDrawn = (
  { after, before, drawn, drift }: DrawnView,
  rider: { readonly mode: string; readonly speed: number },
  blend: number,
  seconds: number
): void => {
  const fromS = drift.s;
  const fromX = drift.x;
  if (rider.mode === "riding" || rider.mode === "mounting") {
    driftSettle(drift, seconds, rider.speed);
  } else {
    clearDrift(drift);
  }
  const ridingS = mix(before.s, after.s, blend);
  const ridingX = mix(before.x, after.x, blend);
  const s = ridingS + drift.s;
  const x = ridingX + drift.x;
  const riding = rider.mode === "riding";
  drawn.off = drawnOff(
    riding && drawn.riding,
    s - drawn.s,
    ridingS + fromS - drawn.s,
    x - drawn.x,
    ridingX + fromX - drawn.x,
    (mix(before.tick, after.tick, blend) -
      mix(drawn.fromTick, drawn.toTick, drawn.blend)) *
      TICK_SECONDS,
    drift,
    rider.speed,
    seconds,
    drawn
  );
  drift.kicked = 0;
  drift.swerved = 0;
  drawn.air = mix(before.air, after.air, blend) + drift.air;
  drawn.riding = riding;
  drawn.blend = blend;
  drawn.fromTick = before.tick;
  drawn.s = s;
  drawn.toTick = after.tick;
  drawn.x = x;
};
