import type { RaceState, RiderInput } from "@racer/sim/state";

const SWERVE_METRES = 25;

export interface DevRide {
  readonly place: (race: RaceState) => void;
  readonly steer: (race: RaceState, input: RiderInput | undefined) => void;
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
  let holdTicks = WATCHING;

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
    return race.events.some(
      (event) => event.kind === holdOn && event.rider === 0
    );
  };

  return {
    holds: (race) => {
      if (!holdOn || holdTicks === SETTLED) {
        return false;
      }
      if (holdTicks === WATCHING && seen(race)) {
        holdTicks = holdOn === "air" || holdOn === "at" ? 0 : holdDelay;
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
      if (!me || startAt <= 0) {
        return;
      }
      me.bodyS += startAt - me.s;
      me.s = startAt;
    },
    steer: (race, input) => {
      const [me] = race.riders;
      if (me && input && swerveAt > 0 && me.s > swerveAt) {
        input.steer = me.s < swerveAt + swerveFor ? 1 : input.steer;
      }
    },
    whenReleased: (resume) => {
      if (!holdOn) {
        return;
      }
      Reflect.set(globalThis, "__rushlineRelease", () => {
        resume();
        Reflect.set(globalThis, "__rushlineHeld", false);
      });
    },
  };
};
