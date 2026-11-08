import { isCelebrity } from "@racer/sim/cast";
import { difficulties, tiers } from "@racer/sim/difficulty";
import { createRace, stepRace } from "@racer/sim/race";
import { riderIdAt, riderOf } from "@racer/sim/state";
import type { RaceState, RiderId } from "@racer/sim/state";
import { arm } from "@racer/sim/weapons";
import { roadIds } from "@racer/track/road";
import { describe, expect, it } from "vitest";

import {
  enter,
  everyRider,
  flatOut,
  getArrested,
  racerIn,
  road,
  sprint,
} from "./career-fixtures.ts";
import type { Entered } from "./career-fixtures.ts";
import { createRaceLog, outcomeOf, recordTick } from "./outcome.ts";
import { summaryOf } from "./result.ts";
import {
  byGuest,
  policeChoices,
  ROOM_FIELD_SIZE,
  seatedRace,
  trafficChoices,
} from "./room-race.ts";
import type { RoomRule } from "./room-race.ts";
import { newCareer } from "./state.ts";
import { STARTING_BIKE } from "./tables.ts";

const tierTwo: RoomRule = {
  bikeId: STARTING_BIKE,
  police: "normal",
  roadId: "slag-row",
  tier: 2,
  traffic: "normal",
};

const finished = (state: RaceState, rider: number): RaceState => {
  const racer = riderOf(state.riders, riderIdAt(rider));
  if (!racer) {
    throw new RangeError(`The race has no rider ${rider}.`);
  }
  racer.finishTick = state.tick;
  return state;
};

describe("a room's field", () => {
  it("names the bike every rider rode on the results board", () => {
    const { setup } = seatedRace(7, 2, tierTwo);
    const state = createRace(setup);
    const log = createRaceLog(setup, riderIdAt(1));
    const outcome = outcomeOf(state, setup, log);
    const { rows } = summaryOf(
      {
        bikeId: STARTING_BIKE,
        raceId: outcome.raceId,
        roadId: outcome.roadId,
        seed: outcome.seed,
        started: true,
        tier: outcome.tier,
      },
      outcome,
      0
    );
    expect(new Set(rows.map((row) => row.bikeId))).toStrictEqual(
      new Set([STARTING_BIKE])
    );
  });

  it("has no celebrity riding among the humans", () => {
    const seeds = Array.from({ length: 20 }, (_, seed) => seed);
    const field = seeds.flatMap(
      (seed) => seatedRace(seed, 2, tierTwo).setup.field
    );
    expect(field.filter((rival) => isCelebrity(rival))).toStrictEqual([]);
  });
});

describe("a room's rule", () => {
  it("rides a tier 2 rule on the starting bike, with no pacing", () => {
    const { setup } = seatedRace(7, 2, tierTwo);
    expect(setup.tier).toBe(tierTwo.tier);
    expect(setup.player.bike.id).toBe(STARTING_BIKE);
    expect(setup.conditions).toStrictEqual(difficulties[2].conditions);
    expect(setup.pacing).toStrictEqual({ catchUp: 0, leadEase: 0 });
  });

  it("carries another tier when a room names one, still with no pacing", () => {
    const { setup } = seatedRace(7, 2, { ...tierTwo, tier: 3 });
    expect(setup.conditions).toStrictEqual(difficulties[3].conditions);
    expect(setup.police.count).toBe(difficulties[3].cops.count);
    expect(setup.pacing).toStrictEqual({ catchUp: 0, leadEase: 0 });
  });
});

const ruled = (over: Partial<RoomRule>) =>
  seatedRace(7, 2, { ...tierTwo, ...over }).setup;

describe("a host's choice", () => {
  it("takes the tier's traffic and police when left at normal", () => {
    const { setup } = seatedRace(7, 2, tierTwo);
    expect(setup.conditions.trafficDensity).toBe(
      difficulties[tierTwo.tier].conditions.trafficDensity
    );
    expect(setup.police.count).toBe(difficulties[tierTwo.tier].cops.count);
  });

  it("scales traffic and police from the tier", () => {
    const { tier } = tierTwo;
    expect(ruled({ traffic: "light" }).conditions.trafficDensity).toBe(
      difficulties[tier].conditions.trafficDensity * 0.5
    );
    expect(ruled({ police: "none" }).police.count).toBe(0);
    expect(ruled({ police: "many" }).police.count).toBe(
      Math.ceil(difficulties[tier].cops.count * 1.5)
    );
  });

  it("builds a valid race for every road, tier, traffic and police", () => {
    const built = roadIds.flatMap((roadId) =>
      tiers.flatMap((tier) =>
        trafficChoices.flatMap((traffic) =>
          policeChoices.map(
            (police) =>
              createRace(ruled({ police, roadId, tier, traffic })).riders.length
          )
        )
      )
    );
    expect(built.every((riders) => riders >= ROOM_FIELD_SIZE)).toBeTruthy();
  });
});

describe("a room's fairness", () => {
  it.each([1, 7, 99])("puts every human on one spec (seed %i)", (seed) => {
    const { humans, setup } = seatedRace(seed, 4, tierTwo);
    const specs = createRace(setup)
      .riders.filter((rider) => humans.includes(rider.id))
      .map(({ bike, profile, weaponHits }) => ({
        aggression: profile.aggression,
        bike: bike.id,
        skill: profile.skill,
        weapon: profile.weapon,
        weaponHits,
      }));
    expect(new Set(specs.map((spec) => JSON.stringify(spec))).size).toBe(1);
    expect(specs[0]?.bike).toBe(STARTING_BIKE);
  });

  it.each([1, 7, 99])(
    "puts the AI racers on the same bike, with their own skill (seed %i)",
    (seed) => {
      const { humans, setup } = seatedRace(seed, 2, tierTwo);
      const ai = createRace(setup).riders.filter(
        (rider) => !humans.includes(rider.id) && rider.profile.role === "racer"
      );
      expect(ai.every((rider) => rider.bike.id === STARTING_BIKE)).toBeTruthy();
      expect(
        new Set(ai.map((rider) => rider.profile.skill)).size
      ).toBeGreaterThan(1);
    }
  );

  it("leaves the police on the tier's bike", () => {
    const riders = createRace(seatedRace(7, 2, tierTwo).setup).riders.filter(
      (rider) => rider.profile.role === "police"
    );
    expect(riders.length).toBeGreaterThan(0);
    expect(
      riders.every((rider) => rider.bike.id !== STARTING_BIKE)
    ).toBeTruthy();
  });

  it("starts two humans side by side, ahead of no one but the AI", () => {
    const { humans, setup } = seatedRace(7, 2, tierTwo);
    const state = createRace(setup);
    const startOf = (rider: RiderId) =>
      state.riders.find((each) => each.id === rider)?.s ?? 0;
    const [first, second] = humans.map(startOf);
    expect(first).toBe(second);
    const ai = state.riders.filter(
      (rider) => rider.controller === "pilot" && rider.profile.role === "racer"
    );
    expect(ai.every((rider) => rider.s <= (first ?? 0))).toBeTruthy();
  });

  it("keeps eight humans within the front rows", () => {
    const { humans, setup } = seatedRace(7, 8, tierTwo);
    const starts = createRace(setup)
      .riders.filter((rider) => humans.includes(rider.id))
      .map((rider) => rider.s);
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(21);
  });
});

describe("a seat's race log", () => {
  it("settles on its own rider's finish, not on rider 0's", () => {
    const { setup } = seatedRace(7, 2, tierTwo);
    const state = createRace(setup);
    const me = riderIdAt(1);
    const log = createRaceLog(setup, me);
    recordTick(log, finished(state, 0), setup);
    expect(log.outcome).toBeNull();
    recordTick(log, finished(state, 1), setup);
    expect(log.outcome?.result).toBe("finished");
  });

  it("tallies every other rider as a rival and names only itself the player", () => {
    const { setup } = seatedRace(7, 2, tierTwo);
    const me = riderIdAt(1);
    const log = createRaceLog(setup, me);
    const riders = log.entrants.map((entrant) => entrant.rider);
    expect(riders).not.toContain(me);
    expect(riders).toContain(riderIdAt(0));
    const state = createRace(setup);
    recordTick(log, finished(state, 1), setup);
    const players = log.outcome?.placings.filter(
      (placing) => placing.racer === "player"
    );
    expect(players).toHaveLength(1);
  });
});

const lateLog = (race: Entered) => {
  const log = createRaceLog(race.setup);
  stepRace(race.state, road, everyRider(race, flatOut));
  recordTick(log, race.state, race.setup);
  return log;
};

describe("a race log that starts after its rider is out, as a rejoined seat's does", () => {
  it("settles the bust the rider took while away", () => {
    const race = enter(newCareer(2), "slag-row");
    arm(racerIn(race, "player"), "chain");
    getArrested(race);
    expect(lateLog(race).outcome).toMatchObject({
      arrest: { fine: 400, officer: "wendell-haverty", weapon: "chain" },
      place: 15,
      result: "busted",
    });
  });

  it("settles the finish the rider made while away", () => {
    const race = enter(newCareer(3), "slag-row");
    sprint(race, 2);
    expect(lateLog(race).outcome).toMatchObject({
      finishTick: race.log.outcome?.finishTick,
      place: 2,
      result: "finished",
    });
  });
});

describe("the humans' names in a result", () => {
  const seed = 11;

  it("name the other humans' rows and never mine", () => {
    const { humans, setup } = seatedRace(seed, 3, tierTwo);
    const [first, second, third] = humans;
    if (first === undefined || second === undefined || third === undefined) {
      throw new RangeError("A three-seat race has three humans.");
    }
    const names = byGuest(setup, second, ["Ann", "Bo", "Cy"]);
    const log = createRaceLog(setup, second);
    const racerOf = (rider: number) =>
      log.entrants.find((entrant) => entrant.rider === rider)?.rival;
    expect(names.size).toBe(2);
    expect([...names.values()]).not.toContain("Bo");
    expect(names.get(racerOf(first) ?? "player")).toBe("Ann");
    expect(names.get(racerOf(third) ?? "player")).toBe("Cy");
  });

  it("name every other human for the first seat too", () => {
    const { humans, setup } = seatedRace(seed, 2, tierTwo);
    const [me] = humans;
    if (me === undefined) {
      throw new RangeError("A two-seat race has a first human.");
    }
    expect([...byGuest(setup, me, ["Ann", "Bo"]).values()]).toStrictEqual([
      "Bo",
    ]);
  });
});
