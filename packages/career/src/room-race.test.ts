import { isCelebrity } from "@racer/sim/cast";
import { difficulties } from "@racer/sim/difficulty";
import { createRace } from "@racer/sim/race";
import { riderIdAt } from "@racer/sim/state";
import type { RaceEvent } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createRaceLog, recordTick } from "./outcome.ts";
import { guestNames, publicRoomRule, seatedRace } from "./room-race.ts";
import { STARTING_BIKE } from "./tables.ts";

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

describe("a room's rule", () => {
  it("rides public rooms at tier 2, on the starting bike, with no pacing", () => {
    const { setup } = seatedRace(7, 2);
    expect(setup.tier).toBe(publicRoomRule.tier);
    expect(publicRoomRule.tier).toBe(2);
    expect(setup.player.bike.id).toBe(STARTING_BIKE);
    expect(setup.conditions).toStrictEqual(difficulties[2].conditions);
    expect(setup.pacing).toStrictEqual({ catchUp: 0, leadEase: 0 });
  });

  it("carries another tier when a room names one, still with no pacing", () => {
    const { setup } = seatedRace(7, 2, { ...publicRoomRule, tier: 3 });
    expect(setup.conditions).toStrictEqual(difficulties[3].conditions);
    expect(setup.police.count).toBe(difficulties[3].cops.count);
    expect(setup.pacing).toStrictEqual({ catchUp: 0, leadEase: 0 });
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

describe("the humans' names in a result", () => {
  const seed = 11;

  it("name the other humans' rows and never mine", () => {
    const { humans, setup } = seatedRace(seed, 3);
    const [first, second, third] = humans;
    if (first === undefined || second === undefined || third === undefined) {
      throw new RangeError("A three-seat race has three humans.");
    }
    const names = guestNames(setup, second, ["Ann", "Bo", "Cy"]);
    const log = createRaceLog(setup, second);
    const racerOf = (rider: number) =>
      log.entrants.find((entrant) => entrant.rider === rider)?.rival;
    expect(names.size).toBe(2);
    expect([...names.values()]).not.toContain("Bo");
    expect(names.get(racerOf(first) ?? "player")).toBe("Ann");
    expect(names.get(racerOf(third) ?? "player")).toBe("Cy");
  });

  it("name every other human for the first seat too", () => {
    const { humans, setup } = seatedRace(seed, 2);
    const [me] = humans;
    if (me === undefined) {
      throw new RangeError("A two-seat race has a first human.");
    }
    expect([...guestNames(setup, me, ["Ann", "Bo"]).values()]).toStrictEqual([
      "Bo",
    ]);
  });
});
