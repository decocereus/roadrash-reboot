import { roadIds } from "@racer/track/road";
import { roads, trackFor } from "@racer/track/roads";
import { compileTrack, curvatureAt } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { streetBike } from "./bikes.ts";
import { inJumpZone, toeOf } from "./carrier.ts";
import { difficulties, tiers } from "./difficulty.ts";
import { KMH, frameOf, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { TICK_RATE, clamp, curvePushOf, lateralSpeedLimit } from "./state.ts";
import type { RaceEvent } from "./state.ts";
import { CONVOY_CRUISE } from "./traffic.ts";

describe("trucks on the roads", () => {
  it("move every car out of a truck's jump zone, so every road keeps its traffic and nothing waits where riders take off or land", () => {
    const races = roadIds.flatMap((roadId) => {
      const track = trackFor(roadId);
      const bare = compileTrack({ ...roads[roadId], carriers: [] });
      return tiers.flatMap((tier) =>
        [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
          const { conditions } = difficulties[tier];
          const all = createRace({
            ...defaultSetup(track, seed),
            conditions,
          }).cars;
          const trucks = all.filter((car) => car.carrier);
          const cars = all.filter(
            (car) => !car.carrier && car.cruiseSpeed !== CONVOY_CRUISE
          );
          const without = createRace({
            ...defaultSetup(bare, seed),
            conditions,
          }).cars.filter((car) => car.cruiseSpeed !== CONVOY_CRUISE);
          const inZone = (car: (typeof all)[number]) =>
            trucks.some((truck) => inJumpZone(car, car.s, car.x, truck));
          return {
            inTheWay: without.filter(inZone).length,
            inZone: cars.filter(inZone).length,
            kept: cars.length === without.length,
            overlaps: cars.filter((car, index) =>
              cars.some(
                (other, before) =>
                  before < index &&
                  Math.abs(other.x - car.x) <= 1 &&
                  Math.abs(other.s - car.s) < other.halfLength + car.halfLength
              )
            ).length,
          };
        })
      );
    });
    expect(races.filter(({ kept }) => !kept)).toStrictEqual([]);
    expect(races.reduce((sum, { overlaps }) => sum + overlaps, 0)).toBe(0);
    expect(races.reduce((sum, { inZone }) => sum + inZone, 0)).toBe(0);
    expect(races.some(({ inTheWay }) => inTheWay > 0)).toBeTruthy();
  });

  it("a skill-one pilot that meets Ridge Road's 4,500 m truck at 220 km/h on tier 1, seed 21, launches at speed and lands clean", () => {
    const track = trackFor("ridge-road");
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
      rivals: [],
    });
    const truck = state.cars.find((car) => car.carrier && car.s === 4500);
    if (truck === undefined) {
      throw new Error("Ridge Road has a truck starting at 4,500 m");
    }
    const rider = player(state);
    rider.s = toeOf(truck) - 30;
    rider.x = truck.x;
    rider.speed = 220 / KMH;
    const lock = lateralSpeedLimit(streetBike, rider.speed);
    rider.lateralSpeed = clamp(
      curvePushOf(streetBike, curvatureAt(track, rider.s), rider.speed),
      -lock,
      lock
    );
    let launchSpeed = 0;
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      const onDeck = rider.onCarrier >= 0;
      stepRace(state, track, frameOf(state));
      if (onDeck && rider.airborne) {
        launchSpeed = rider.speed;
      }
      events.push(...state.events.filter((event) => event.rider === rider.id));
    }
    expect(launchSpeed).toBeGreaterThan(55);
    expect(events.filter((event) => event.kind === "crash")).toStrictEqual([]);
    expect(events.some((event) => event.kind === "land")).toBeTruthy();
  });

  it.each(tiers)(
    "at tier %i the trucks are the last cars, where the ramp and the pilot look for them",
    (tier) => {
      const track = trackFor("slag-row");
      const { cars } = createRace({
        ...defaultSetup(track, 1),
        conditions: difficulties[tier].conditions,
      });
      expect(
        cars.slice(-track.carrierStarts.length).map((car) => car.carrier)
      ).toStrictEqual(track.carrierStarts.map(() => true));
    }
  );

  it.each([
    ["breakwater-run", [1750, 3650]],
    ["slag-row", [2600, 4100]],
    ["ridge-road", [4500]],
  ] as const)(
    "%s starts its trucks at the plan's stretches, in the first lane the same way, first among the cars",
    (road, starts) => {
      const track = trackFor(road);
      const { cars } = createRace(defaultSetup(track, 1));
      const trucks = cars.slice(cars.length - starts.length);
      expect(trucks.map((car) => car.s)).toStrictEqual([...starts]);
      expect(trucks.every((car) => car.carrier)).toBeTruthy();
      expect(
        trucks.every((car) => car.x === track.sameWayLanes[0])
      ).toBeTruthy();
      expect(
        cars.slice(0, cars.length - starts.length).some((car) => car.carrier)
      ).toBeFalsy();
    }
  );
});
