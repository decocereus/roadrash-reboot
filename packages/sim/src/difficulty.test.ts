import { eased } from "@racer/track/alignment";
import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { rivalAt, rivals } from "./cast.ts";
import { difficulties, tierAfter, tiers } from "./difficulty.ts";
import type { Tier } from "./difficulty.ts";
import { frameOf, player, rivalNamed, scripted } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace, validateSetup } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceState } from "./state.ts";

const slagRow = compileTrack(roads["slag-row"]);

const raceAt = (tier: Tier): RaceState =>
  createRace({
    ...defaultSetup(slagRow, 7),
    conditions: difficulties[tier].conditions,
  });

const CONVOY_CRUISE = 15;

const hitsToDrop = (tier: Tier, kicking: boolean): number => {
  const flat = compileTrack({
    ...ridgeRoad,
    carriers: [],
    chevrons: [],
    hazardsPerKilometre: 0,
    pieces: eased([[6000, 0, 0]]),
    trafficPerKilometre: 0,
  });
  const base = defaultSetup(flat, 1);
  const state = scripted(
    createRace({
      ...base,
      conditions: difficulties[tier].conditions,
      police: { ...base.police, count: 0 },
      rivals: [rivalAt(rivals["dee-santangelo"], 1)],
    })
  );
  const me = player(state);
  const rival = rivalNamed(state, "dee-santangelo");
  const idle = {
    brake: 0,
    kick: false,
    punch: false,
    remount: false,
    steer: 0,
    throttle: 0.5,
  };
  let hits = 0;
  for (
    let tick = 0;
    tick < 20 * TICK_RATE && rival.mode === "riding";
    tick += 1
  ) {
    me.s = rival.s;
    me.x = 0.3;
    me.speed = 30;
    rival.x = 1.8;
    rival.speed = 30;
    const swinging = tick % 40 === 0;
    stepRace(
      state,
      flat,
      frameOf(
        state,
        [
          me.id,
          { ...idle, kick: kicking && swinging, punch: !kicking && swinging },
        ],
        [rival.id, idle]
      )
    );
    hits += state.events.filter((event) => event.kind === "hit").length;
  }
  return hits;
};

describe("the difficulty table", () => {
  it.each([
    { kicks: 2, punches: 3, tier: 1 },
    { kicks: 2, punches: 3, tier: 2 },
    { kicks: 1, punches: 2, tier: 3 },
  ] as const)(
    "at tier $tier a rider goes down to $punches punches or $kicks kicks",
    ({ kicks, punches, tier }) => {
      expect([hitsToDrop(tier, false), hitsToDrop(tier, true)]).toStrictEqual([
        punches,
        kicks,
      ]);
    }
  );

  it("places more hazards at each tier on every road, and keeps the ones before", () => {
    for (const roadId of [
      "breakwater-run",
      "slag-row",
      "ridge-road",
    ] as const) {
      const track = compileTrack(roads[roadId]);
      const placedAt = (tier: Tier) =>
        track.hazards
          .filter(
            (hazard) =>
              hazard.rarity < difficulties[tier].conditions.hazardShare
          )
          .map((hazard) => hazard.id);
      const [first, second, third] = tiers.map(placedAt);
      expect(second?.length).toBeGreaterThan(first?.length ?? 0);
      expect(third?.length).toBeGreaterThan(second?.length ?? 0);
      expect(second).toStrictEqual(expect.arrayContaining(first ?? []));
      expect(third).toStrictEqual(expect.arrayContaining(second ?? []));
    }
  });

  it("adds traffic and slow convoys at each tier, on the same road", () => {
    const races = tiers.map(raceAt);
    const counts = races.map((race) => race.cars.length);
    expect(counts[1]).toBeGreaterThan(counts[0] ?? 0);
    expect(counts[2]).toBeGreaterThan(counts[1] ?? 0);
    expect(
      races.map(
        (race) =>
          race.cars.filter((car) => car.cruiseSpeed === CONVOY_CRUISE).length
      )
    ).toStrictEqual([0, 6, 12]);
  });

  it("keeps every hazard of a lower tier and adds more above it", () => {
    const placed = tiers.map((tier) =>
      raceAt(tier).hazards.map((hazard) => hazard.id)
    );
    expect(placed[2]).toStrictEqual(expect.arrayContaining(placed[1] ?? []));
    expect(placed[1]).toStrictEqual(expect.arrayContaining(placed[0] ?? []));
    expect(placed[2]?.length).toBeGreaterThan(placed[0]?.length ?? 0);
  });

  it("lifts every rival's riding skill at each tier, and never past 1", () => {
    const cast = Object.values(rivals);
    expect(cast.map((rival) => rivalAt(rival, 1).skill)).toStrictEqual(
      cast.map((rival) => rival.skill)
    );
    expect(
      cast.every(
        (rival) =>
          rivalAt(rival, 2).skill > rival.skill || rivalAt(rival, 2).skill === 1
      )
    ).toBeTruthy();
    expect(
      Math.max(...cast.map((rival) => rivalAt(rival, 3).skill))
    ).toBeLessThanOrEqual(1);
  });

  it("every tier passes the race's own range checks, and has a next tier but the last", () => {
    expect(
      tiers.flatMap((tier) =>
        validateSetup({
          ...defaultSetup(slagRow, 1),
          conditions: difficulties[tier].conditions,
          pacing: difficulties[tier].pacing,
        })
      )
    ).toStrictEqual([]);
    expect(tiers.map(tierAfter)).toStrictEqual([2, 3, null]);
  });

  it("refuses a rule outside its range before the race starts", () => {
    const setup = defaultSetup(slagRow, 1);
    const bad = {
      ...setup,
      conditions: {
        ...setup.conditions,
        hazardShare: 2,
        hitDamage: Number.NaN,
      },
    };
    expect(validateSetup(bad)).toStrictEqual([
      { kind: "outOfRange", rule: "hazardShare", value: 2 },
      { kind: "outOfRange", rule: "hitDamage", value: Number.NaN },
    ]);
    expect(() => createRace(bad)).toThrow("The rule hazardShare cannot be 2.");
  });
});
