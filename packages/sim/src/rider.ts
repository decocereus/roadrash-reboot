import type { Track } from "@racer/track/track";

import { hitCar, hitProps } from "./rider-collisions.ts";
import { throwRider } from "./rider-crash.ts";
import { ride } from "./rider-drive.ts";
import { fly } from "./rider-flight.ts";
import { stepOffBike } from "./rider-recovery.ts";
import { clamp } from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";

const FINISH_BRAKE = 0.35;

const coasting: RiderInput = {
  brake: FINISH_BRAKE,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
};

const standing: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
};

export const stepRider = (
  state: RaceState,
  track: Track,
  rider: RiderState,
  input: RiderInput
): void => {
  if (rider.mode !== "riding") {
    stepOffBike(state, track, rider, rider.finishTick < 0 ? input : standing);
    return;
  }

  rider.modeTicks += 1;
  if (rider.airborne) {
    fly(state, track, rider);
  } else {
    ride(state, track, rider, rider.finishTick < 0 ? input : coasting);
  }

  let thrown = rider.mode !== "riding";
  if (!thrown && Math.abs(rider.x) > track.vergeHalfWidth) {
    rider.x = clamp(rider.x, -track.vergeHalfWidth, track.vergeHalfWidth);
    throwRider(state, rider, "offTrack", 0.3, 0.5);
    thrown = true;
  }
  if (!thrown) {
    thrown = hitProps(state, track, rider);
  }
  for (const car of state.cars) {
    if (thrown) {
      break;
    }
    if (Math.abs(car.s - rider.s) < 12) {
      thrown = hitCar(state, rider, car);
    }
  }
  if (thrown) {
    return;
  }

  if (rider.stamina <= 0) {
    throwRider(state, rider, "combat", 0.6, 0.65);
    return;
  }
  rider.bodyS = rider.s;
  rider.bodyX = rider.x;
  rider.bodyAir = rider.air;
  if (
    rider.finishTick < 0 &&
    rider.s >= track.length &&
    rider.profile.role === "racer"
  ) {
    rider.finishTick = state.tick;
    state.events.push({ kind: "finish", rider: rider.id, tick: state.tick });
  }
};
