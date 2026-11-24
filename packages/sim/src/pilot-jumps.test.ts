import { trackFor } from "@racer/track/roads";
import { curvatureAt } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { streetBike } from "./bikes.ts";
import { lipAt, toeOf } from "./carrier.ts";
import { difficulties } from "./difficulty.ts";
import { spawnRock } from "./hazards.ts";
import { KMH, frameOf, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { clamp, curvePushOf, lateralSpeedLimit, TICK_RATE } from "./state.ts";
import type { RaceEvent } from "./state.ts";

const track = trackFor("ridge-road");
const TRUCK_START = 4500;

const approach = (short: number, rivalCount = 0) => {
  const setup = defaultSetup(track, 21);
  const state = createRace({
    ...setup,
    conditions: difficulties[1].conditions,
    player: {
      ...setup.player,
      bike: streetBike,
      controller: "pilot",
      skill: 1,
    },
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals.slice(0, rivalCount),
  });
  const truck = state.cars.find((car) => car.carrier && car.s === TRUCK_START);
  const kept = state.cars.find((car) => !car.carrier);
  if (!truck || !kept) {
    throw new Error("Ridge Road keeps a truck at 4,500 m and a car");
  }
  const rider = player(state);
  rider.s = toeOf(truck) - short;
  rider.x = truck.x;
  rider.speed = 220 / KMH;
  const lock = lateralSpeedLimit(streetBike, rider.speed);
  rider.lateralSpeed = clamp(
    curvePushOf(streetBike, curvatureAt(track, rider.s), rider.speed),
    -lock,
    lock
  );
  const keepCar = (s: number, speed: number): void => {
    Object.assign(kept, { cruiseSpeed: speed, s, speed, x: truck.x });
  };
  return { keepCar, rider, state, truck };
};

const ride = (
  { rider, state, truck }: ReturnType<typeof approach>,
  each?: (tick: number) => void
) => {
  const events: RaceEvent[] = [];
  let brakedCommitted = false;
  let committed = false;
  let droppedShort = false;
  let launchSpeed = 0;
  for (let tick = 1; tick <= 6 * TICK_RATE; tick += 1) {
    stepRace(state, track, frameOf(state));
    events.push(...state.events.filter((event) => event.rider === rider.id));
    const beforeLip = !rider.airborne && rider.s <= lipAt(truck.s);
    committed ||= rider.jumpTaken;
    brakedCommitted ||= rider.jumpTaken && beforeLip && rider.input.brake > 0;
    droppedShort ||= committed && !rider.jumpTaken && rider.s < toeOf(truck);
    if (rider.airborne && launchSpeed === 0) {
      launchSpeed = rider.speed;
    }
    each?.(tick);
    if (rider.mode !== "riding") {
      break;
    }
  }
  return { brakedCommitted, committed, droppedShort, events, launchSpeed };
};

describe("a pilot committed to a truck jump keeps the approach its forecast judged", () => {
  it("does not brake before the lip for a car cruising beyond the truck, launches near its approach speed and lands", () => {
    const run = approach(30);
    run.keepCar(4531, 21.727188607677817);
    const rode = ride(run);
    expect(rode.committed).toBeTruthy();
    expect(rode.brakedCommitted).toBeFalsy();
    expect(rode.launchSpeed).toBeGreaterThan(200 / KMH);
    expect(rode.events.find((event) => event.kind === "crash")).toBeUndefined();
    expect(rode.events.some((event) => event.kind === "land")).toBeTruthy();
  });

  it("drops the jump before the toe, without braking on the ramp's line, when a car pulls into the approach after it committed", () => {
    const run = approach(100);
    const rode = ride(run, (tick) => {
      if (tick === 1) {
        run.keepCar(toeOf(run.truck) - 10, run.truck.speed);
      }
    });
    expect(rode.committed).toBeTruthy();
    expect(rode.brakedCommitted).toBeFalsy();
    expect(rode.droppedShort).toBeTruthy();
    expect(rode.events.find((event) => event.kind === "crash")).toBeUndefined();
  });

  it("brakes while committed for a rock that lands in its approach, and rides on", () => {
    const run = approach(100);
    const rode = ride(run, (tick) => {
      if (tick === 1) {
        spawnRock(run.state, track, {
          command: null,
          id: "late-rock",
          s: run.rider.s + 60,
          x: run.rider.x,
        });
      }
    });
    expect(rode.committed).toBeTruthy();
    expect(rode.brakedCommitted).toBeTruthy();
    expect(rode.events.find((event) => event.kind === "crash")).toBeUndefined();
  });

  it("brakes while committed for riders stopped in its approach, and rides on", () => {
    const run = approach(100, 2);
    const rode = ride(run, (tick) => {
      if (tick === 1) {
        const others = run.state.riders.filter((each) => each !== run.rider);
        for (const [index, other] of others.entries()) {
          Object.assign(other, {
            profile: { ...other.profile, aggression: 0 },
            s: run.rider.s + 85,
            speed: 0,
            x: index === 0 ? 1.8 : -1.8,
          });
        }
      }
    });
    expect(rode.committed).toBeTruthy();
    expect(rode.brakedCommitted).toBeTruthy();
    expect(rode.events.find((event) => event.kind === "crash")).toBeUndefined();
  });
});
