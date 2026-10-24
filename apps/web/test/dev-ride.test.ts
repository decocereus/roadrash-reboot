import { createRaceLog, outcomeOf, recordTick } from "@racer/career/outcome";
import {
  createRace,
  defaultSetup,
  neutralInput,
  stepRace,
} from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { benchPlan } from "../src/career/bench.ts";
import { quickReport } from "../src/career/flow.ts";
import { devRideFrom } from "../src/game/dev-ride.ts";

const freshRun = (): RaceRun =>
  createRaceRun(defaultSetup(trackFor("ridge-road", 1), 3));

const playerOf = (run: RaceRun) => {
  const me = riderOf(run.view.riders, PLAYER_RIDER);
  if (!me) {
    throw new Error("The race has no rider.");
  }
  return me;
};

describe("dev ride placement", () => {
  it("at and kmh move the player and its body along the road and set its speed, keeping its line", () => {
    const run = freshRun();
    const me = playerOf(run);
    const { bodyS, s, x } = me;
    devRideFrom("?at=600&kmh=90").place(run);
    expect(me.s).toBe(600);
    expect(me.bodyS).toBe(bodyS + 600 - s);
    expect(me.x).toBe(x);
    expect(me.speed).toBe(25);
  });

  it("kmh alone changes nothing while the start is not past the line", () => {
    const run = freshRun();
    const before = structuredClone(run.view);
    devRideFrom("?kmh=90&clear").place(run);
    expect(run.view).toStrictEqual(before);
  });

  it("hazard puts the player on the hazard's line a lead before it, and leaves its speed alone", () => {
    const run = freshRun();
    const [hazard] = run.view.hazards;
    if (!hazard) {
      throw new Error("The road has no hazard.");
    }
    const me = playerOf(run);
    const { speed } = me;
    devRideFrom(`?hazard=${hazard.id}&before=150`).place(run);
    expect(me.s).toBe(hazard.s - 150);
    expect(me.x).toBe(hazard.x);
    expect(me.bodyX).toBe(hazard.x);
    expect(me.speed).toBe(speed);
  });

  it("clear moves the cars near the start to gaps past it and leaves the rest", () => {
    const run = freshRun();
    const before = run.view.cars.map((car) => car.s);
    devRideFrom("?at=600&clear").place(run);
    let moved = 0;
    const expected = before.map((s) => {
      if (s > 540 && s < 1000) {
        moved += 1;
        return 1300 + (moved - 1) * 35;
      }
      return s;
    });
    expect(moved).toBeGreaterThan(0);
    expect(run.view.cars.map((car) => car.s)).toStrictEqual(expected);
  });
});

describe("dev race plans", () => {
  it("a stress race reports its field under the recorded rules it was set up with", () => {
    const plan = benchPlan("stress");
    const track = trackFor(plan.setup.roadId, plan.setup.level);
    const state = createRace(plan.setup);
    const log = createRaceLog(plan.setup);
    stepRace(state, track, new Map([[PLAYER_RIDER, neutralInput]]));
    recordTick(log, state, plan.setup);
    const report = quickReport(plan, outcomeOf(state, plan.setup, log));
    const ridden = new Map(
      plan.setup.field.map((rival, index) => [
        rival,
        plan.setup.rivals[index]?.bike.id,
      ])
    );
    expect(report.summary.rows).toHaveLength(15);
    expect(
      report.summary.rows.flatMap((row) =>
        row.racer === "player" || ridden.get(row.racer) === row.bikeId
          ? []
          : [row.racer]
      )
    ).toStrictEqual([]);
  });
});
