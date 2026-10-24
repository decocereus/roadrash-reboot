import { defaultSetup, neutralInput } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import type { RaceView, RiderView, TrafficView } from "@racer/sim/race-view";
import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import type {
  BikeSpec,
  Hazard,
  RaceEvent,
  RaceState,
  RiderId,
  RiderState,
  TrafficCar,
} from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import { describe, expect, expectTypeOf, it } from "vitest";

const ride = (run: RaceRun, ticks: number): void => {
  const inputs = run.view.riders.map(() => ({ ...neutralInput }));
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const rider of run.view.riders) {
      const input = inputs[rider.id];
      if (input && rider.id === PLAYER_RIDER) {
        input.throttle = 1;
      } else if (input) {
        run.pilot(rider.id, input);
      }
    }
    run.step(inputs);
  }
};

describe("the browser's race view", () => {
  it("is readonly all the way down", () => {
    expectTypeOf<RaceView["riders"]>().toEqualTypeOf<readonly RiderView[]>();
    expectTypeOf<RaceView["cars"]>().toEqualTypeOf<readonly TrafficView[]>();
    expectTypeOf<RaceView["hazards"]>().toEqualTypeOf<readonly Hazard[]>();
    expectTypeOf<RaceView["events"]>().toEqualTypeOf<readonly RaceEvent[]>();
    expectTypeOf<Pick<RaceView, "dice" | "tick">>().toEqualTypeOf<{
      readonly dice: number;
      readonly tick: number;
    }>();
    expectTypeOf<
      Pick<RiderView, "mode" | "s" | "speed" | "x">
    >().toEqualTypeOf<{
      readonly mode: RiderState["mode"];
      readonly s: number;
      readonly speed: number;
      readonly x: number;
    }>();
    expectTypeOf<RiderView["hazardContacts"]>().toEqualTypeOf<
      readonly number[]
    >();
    expectTypeOf<RiderView["bike"]>().toEqualTypeOf<BikeSpec>();
    expectTypeOf<
      Pick<RiderView, "chase" | "grudge" | "id" | "lastHitBy">
    >().toEqualTypeOf<{
      readonly chase: RiderId | null;
      readonly grudge: RiderId | null;
      readonly id: RiderId;
      readonly lastHitBy: RiderId | null;
    }>();
    expectTypeOf<Pick<TrafficView, "s" | "speed">>().toEqualTypeOf<{
      readonly s: number;
      readonly speed: number;
    }>();
    expectTypeOf<RaceView>().not.toExtend<RaceState>();
    expectTypeOf<RiderView>().not.toExtend<RiderState>();
    expectTypeOf<TrafficCar>().toExtend<TrafficView>();
  });

  it("is the race itself, shared across real steps rather than copied", () => {
    const run = createRaceRun(defaultSetup(trackFor("ridge-road", 1), 3));
    const { view } = run;
    const { cars, riders } = view;
    const me = riderOf(riders, PLAYER_RIDER);
    ride(run, 120);
    expect(run.view).toBe(view);
    expect(view.riders).toBe(riders);
    expect(riderOf(view.riders, PLAYER_RIDER)).toBe(me);
    expect(view.cars).toBe(cars);
  });

  it("shows each real step as it happens", () => {
    const run = createRaceRun(defaultSetup(trackFor("ridge-road", 1), 3));
    const start = riderOf(run.view.riders, PLAYER_RIDER)?.s ?? 0;
    ride(run, 120);
    expect(run.view.tick).toBe(120);
    expect(riderOf(run.view.riders, PLAYER_RIDER)?.s).toBeGreaterThan(
      start + 10
    );
  });
});
