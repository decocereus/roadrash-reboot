import { isCelebrity } from "@racer/sim/cast";
import { createRace } from "@racer/sim/race";
import { riderIdAt } from "@racer/sim/state";
import type { RaceEvent } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createRaceLog, recordTick } from "./outcome.ts";
import { seatedRace } from "./room-race.ts";

const finishOf = (rider: number): RaceEvent => ({
  kind: "finish",
  rider: riderIdAt(rider),
  tick: 0,
});

describe("a room's field", () => {
  it("has no celebrity riding among the humans", () => {
    const seeds = Array.from({ length: 20 }, (_, seed) => seed);
    const field = seeds.flatMap((seed) => seatedRace(seed, 2).setup.field);
    expect(field.filter((rival) => isCelebrity(rival))).toStrictEqual([]);
  });
});

describe("a seat's race log", () => {
  it("settles on its own rider's finish, not on rider 0's", () => {
    const { setup } = seatedRace(7, 2);
    const state = createRace(setup);
    const me = riderIdAt(1);
    const log = createRaceLog(setup, me);
    recordTick(log, { ...state, events: [finishOf(0)] }, setup);
    expect(log.outcome).toBeNull();
    recordTick(log, { ...state, events: [finishOf(1)] }, setup);
    expect(log.outcome?.result).toBe("finished");
  });

  it("tallies every other rider as a rival and names only itself the player", () => {
    const { setup } = seatedRace(7, 2);
    const me = riderIdAt(1);
    const log = createRaceLog(setup, me);
    const riders = log.entrants.map((entrant) => entrant.rider);
    expect(riders).not.toContain(me);
    expect(riders).toContain(riderIdAt(0));
    const state = createRace(setup);
    recordTick(log, { ...state, events: [finishOf(1)] }, setup);
    const players = log.outcome?.placings.filter(
      (placing) => placing.racer === "player"
    );
    expect(players).toHaveLength(1);
  });
});
