import type { RaceRun } from "@racer/sim/race-run";
import type { RaceView, RiderView } from "@racer/sim/race-view";
import {
  clamp,
  curvePushOf,
  PLAYER_RIDER,
  riderOf,
  steerFor,
} from "@racer/sim/state";
import type { Hazard, RiderInput } from "@racer/sim/state";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

const SWERVE_METRES = 25;
const HAZARD_LEAD = 150;
const KMH = 3.6;
const LINE_PULL = 1.2;
const LINE_SWAY = 3;
const holdLine = (track: Track, me: RiderView, lineX: number): number => {
  const wanted = clamp((lineX - me.x) * LINE_PULL, -LINE_SWAY, LINE_SWAY);
  const curvature = curvatureAt(track, me.s);
  return clamp(
    steerFor(
      me.bike,
      curvature,
      me.speed,
      wanted + curvePushOf(me.bike, curvature, me.speed)
    ),
    -1,
    1
  );
};

export interface DevRide {
  readonly place: (run: RaceRun) => void;
  readonly steer: (race: RaceView, track: Track, input: RiderInput) => void;
  readonly holds: (race: RaceView) => boolean;
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

  const target = (race: RaceView): Hazard | undefined =>
    race.hazards.find((hazard) => hazard.id === hazardId);

  const seen = (race: RaceView): boolean => {
    const me = riderOf(race.riders, PLAYER_RIDER);
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
      (event) => event.kind === holdOn && event.rider === PLAYER_RIDER
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
    place: (run) => {
      if (!riderOf(run.view.riders, PLAYER_RIDER)) {
        return;
      }
      const hazard = target(run.view);
      const s = hazard ? hazard.s - hazardLead : startAt;
      if (s <= 0) {
        return;
      }
      run.placeRiderAt(PLAYER_RIDER, s);
      if (hazard) {
        run.placeRiderAcross(PLAYER_RIDER, hazard.x);
      }
      if (startKmh > 0) {
        run.setRiderSpeed(PLAYER_RIDER, startKmh / KMH);
      }
      if (clear) {
        run.relocateTraffic(s, hazard?.s ?? s);
      }
    },
    steer: (race, track, input) => {
      const me = riderOf(race.riders, PLAYER_RIDER);
      if (me && straight) {
        input.steer = holdLine(track, me, target(race)?.x ?? me.x);
        input.throttle = 1;
        input.brake = 0;
      }
      if (me && swerveAt > 0 && me.s > swerveAt) {
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
