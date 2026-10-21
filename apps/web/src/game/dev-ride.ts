import { clamp, curvePushOf, lateralSpeedLimit } from "@racer/sim/state";
import type {
  Hazard,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

const SWERVE_METRES = 25;
const HAZARD_LEAD = 150;
const KMH = 3.6;
const LINE_PULL = 1.2;
const LINE_SWAY = 3;
const CLEAR_BEHIND = 60;
const CLEAR_AHEAD = 400;
const CLEAR_TO = 700;
const CLEAR_GAP = 35;

const clearTraffic = (race: RaceState, from: number, to: number): void => {
  let moved = 0;
  for (const car of race.cars) {
    if (car.s > from - CLEAR_BEHIND && car.s < to + CLEAR_AHEAD) {
      car.s = to + CLEAR_TO + moved * CLEAR_GAP;
      moved += 1;
    }
  }
};

const holdLine = (track: Track, me: RiderState, lineX: number): number => {
  const wanted = clamp((lineX - me.x) * LINE_PULL, -LINE_SWAY, LINE_SWAY);
  const push = curvePushOf(me.bike, curvatureAt(track, me.s), me.speed);
  return clamp(
    (wanted + push) / Math.max(1, lateralSpeedLimit(me.bike, me.speed)),
    -1,
    1
  );
};

export interface DevRide {
  readonly place: (race: RaceState) => void;
  readonly steer: (
    race: RaceState,
    track: Track,
    input: RiderInput | undefined
  ) => void;
  readonly holds: (race: RaceState) => boolean;
  readonly whenReleased: (resume: () => void) => void;
}

const SETTLED = -2;
const WATCHING = -1;

export const devRideFrom = (search: string): DevRide => {
  const flags = new URLSearchParams(search);
  const holdOn = flags.get("hold");
  const holdDelay = Number(flags.get("holdafter") ?? 0);
  const startAt = Number(flags.get("at") ?? 0);
  const swerveAt = Number(flags.get("swerve") ?? 0);
  const swerveFor = Number(flags.get("swervefor") ?? SWERVE_METRES);
  const swerveTo = Number(flags.get("swerveto") ?? 1);
  const hazardId = flags.get("hazard");
  const hazardLead = Number(flags.get("before") ?? HAZARD_LEAD);
  const startKmh = Number(flags.get("kmh") ?? 0);
  const straight = flags.has("straight");
  const clear = flags.has("clear");
  let holdTicks = WATCHING;

  const target = (race: RaceState): Hazard | undefined =>
    race.hazards.find((hazard) => hazard.id === hazardId);

  const seen = (race: RaceState): boolean => {
    const [me] = race.riders;
    if (!me) {
      return false;
    }
    if (holdOn === "air") {
      return me.airborne && me.airTicks >= holdDelay;
    }
    if (holdOn === "at") {
      return me.s >= holdDelay;
    }
    if (holdOn === "near") {
      const hazard = target(race);
      return hazard !== undefined && hazard.s - me.s <= holdDelay;
    }
    return race.events.some(
      (event) => event.kind === holdOn && event.rider === 0
    );
  };

  return {
    holds: (race) => {
      if (holdOn === null || holdOn === "" || holdTicks === SETTLED) {
        return false;
      }
      if (holdTicks === WATCHING && seen(race)) {
        holdTicks =
          holdOn === "air" || holdOn === "at" || holdOn === "near"
            ? 0
            : holdDelay;
      }
      if (holdTicks === 0) {
        holdTicks = SETTLED;
        Reflect.set(globalThis, "__rushlineHeld", true);
        return true;
      }
      if (holdTicks > 0) {
        holdTicks -= 1;
      }
      return false;
    },
    place: (race) => {
      const [me] = race.riders;
      if (!me) {
        return;
      }
      const hazard = target(race);
      const s = hazard ? hazard.s - hazardLead : startAt;
      if (s <= 0) {
        return;
      }
      me.bodyS += s - me.s;
      me.s = s;
      if (hazard) {
        me.x = hazard.x;
        me.bodyX = hazard.x;
      }
      if (startKmh > 0) {
        me.speed = startKmh / KMH;
      }
      if (clear) {
        clearTraffic(race, s, hazard?.s ?? s);
      }
    },
    steer: (race, track, input) => {
      const [me] = race.riders;
      if (me && input && straight) {
        input.steer = holdLine(track, me, target(race)?.x ?? me.x);
        input.throttle = 1;
        input.brake = 0;
      }
      if (me && input && swerveAt > 0 && me.s > swerveAt) {
        input.steer = me.s < swerveAt + swerveFor ? swerveTo : input.steer;
      }
    },
    whenReleased: (resume) => {
      if (holdOn === null || holdOn === "") {
        return;
      }
      Reflect.set(globalThis, "__rushlineRelease", () => {
        resume();
        Reflect.set(globalThis, "__rushlineHeld", false);
      });
    },
  };
};
