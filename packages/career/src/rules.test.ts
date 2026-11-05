import { bikeIds } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { tierAfter } from "@racer/sim/difficulty";
import type { Tier } from "@racer/sim/difficulty";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  decentSeason,
  enter,
  ledgerOf,
  play,
  playAll,
  road,
  seasonsOf,
  settle,
  sprint,
  weakSeason,
} from "./career-fixtures.ts";
import { fieldFor, practiceSetup, roadsFor, setupFor } from "./field.ts";
import { launchRules } from "./rules.ts";
import type { RaceRules } from "./rules.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { startRace } from "./settle.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { chapterOf } from "./story.ts";
import {
  policeFor,
  prizeFor,
  roadList,
  stockArrivingAt,
  tiers,
} from "./tables.ts";

const served = launchRules;

const qualifyOn = (career: CareerState, roads: typeof roadList): CareerState =>
  playAll(
    career,
    roads.map((entry) => ({ place: 3, roadId: entry.id })),
    served
  );

const bikesOn = (
  rules: RaceRules,
  bikeId: BikeId,
  tier: Tier
): readonly (readonly [string, BikeId])[] =>
  practiceSetup(
    rules,
    { bikeId, roadId: "breakwater-run", seed: 5, tier },
    trackFor("breakwater-run")
  ).rivals.map((rival) => [rival.name, rival.bike.id] as const);

describe("bike matches", () => {
  const kiteRiders = bikesOn(served, "halden-wren-400", 1).filter(
    ([, bikeId]) => bikeId === "halden-kite-500"
  );

  it("puts the Kite riders of tier 1 on the Sesta when the player rides one", () => {
    expect(kiteRiders.length).toBeGreaterThan(0);
    const matched = new Map(bikesOn(served, "ostra-sesta-600", 1));
    for (const [name] of kiteRiders) {
      expect(matched.get(name)).toBe("ostra-sesta-600");
    }
  });

  it("leaves them on the Kite against a rider on any other bike, and at any other tier", () => {
    const onKite = new Map(bikesOn(served, "halden-kite-500", 1));
    for (const [name] of kiteRiders) {
      expect(onKite.get(name)).toBe("halden-kite-500");
    }
    expect(bikesOn(served, "ostra-sesta-600", 2)).toStrictEqual(
      bikesOn({ ...served, bikeMatches: [] }, "ostra-sesta-600", 2)
    );
  });

  it("leaves the recorded rules, which the perf scenarios race on, alone", () => {
    expect(recordedRules.bikeMatches).toStrictEqual([]);
    expect(bikesOn(recordedRules, "ostra-sesta-600", 1)).toStrictEqual(
      bikesOn(recordedRules, "halden-wren-400", 1)
    );
  });
});

describe("ten racers over three tiers", () => {
  it("draws nine different rivals for every road at every tier", () => {
    const fields = tiers.flatMap((tier) =>
      roadList.map((entry) => fieldFor(served, entry.id, tier, 5))
    );
    expect(
      fields.map((field) => [field.length, new Set(field).size])
    ).toStrictEqual(fields.map(() => [9, 9]));
  });

  it("starts each race with ten racers and pays a winner ten points", () => {
    const race = enter(newCareer(11), "slag-row", 3, served);
    sprint(race, 1);
    const won = settle(race);
    expect([
      race.setup.field.length + 1,
      won.career.season.player.points,
    ]).toStrictEqual([10, 10]);
  });

  it("moves up twice, opens the Long Ridge at tier 3, and ends the season there", () => {
    const two = qualifyOn(newCareer(11), roadList);
    const three = qualifyOn(two, roadList);
    const four = qualifyOn(
      three,
      roadList.filter((entry) => entry.id !== "ridge-road")
    );
    const won = play(four, { place: 1, roadId: "ridge-road" }, 1, served);
    expect([
      two.tier,
      three.tier,
      tierAfter(three.tier),
      roadsFor(served, three).finaleOpen,
      roadsFor(served, four).finaleOpen,
      ledgerOf(won).ending,
      won.career.tier,
    ]).toStrictEqual([2, 3, null, false, true, "clean-crown", 3]);
    expect(startRace(won.career, "slag-row", 1)).toMatchObject({
      reason: "seasonOver",
      started: false,
    });
  });

  it("refuses a save made at a tier the game no longer holds", () => {
    const text = serialiseCareer(newCareer(11)).replace('"tier":1', '"tier":4');
    expect(parseCareer(text)).toStrictEqual({
      error: { field: "tier", kind: "invalid" },
      ok: false,
    });
  });

  it("stocks every bike at some tier and puts every bike under some rival", () => {
    const ridden = new Set(
      tiers.flatMap((tier) =>
        roadList.flatMap((entry) =>
          [1, 2, 3, 4].flatMap((seed) =>
            setupFor(
              served,
              { ...newCareer(seed), tier },
              entry.id,
              seed,
              road
            ).rivals.map((rival) => rival.bike.id)
          )
        )
      )
    );
    expect(tiers.flatMap(stockArrivingAt).toSorted()).toStrictEqual(
      bikeIds.toSorted()
    );
    expect(bikeIds.filter((bikeId) => !ridden.has(bikeId))).toStrictEqual([]);
  });

  it("pays and fines more at each tier", () => {
    expect(
      tiers.map((tier) => [
        [1, 2, 3, 10].map((place) => prizeFor(tier, place)),
        policeFor(tier, "lowtown").fine,
      ])
    ).toStrictEqual([
      [[5000, 3400, 2400, 100], 400],
      [[12_000, 8160, 5760, 240], 1500],
      [[23_000, 15_640, 11_040, 460], 3000],
    ]);
  });

  it("lets the decent and the weak player buy one bike a tier, the Sesta and then the Meridian", () => {
    const purchases = ["ostra-sesta-600", "halden-meridian-900"] as const;
    const cash = (steps: typeof decentSeason) =>
      seasonsOf(steps, purchases, served).map((season) => [
        season.end.bikeId,
        season.start.cash,
        season.end.cash,
      ]);
    expect(cash(decentSeason)).toStrictEqual([
      ["halden-wren-400", 1500, 9300],
      ["ostra-sesta-600", 3100, 20_590],
      ["halden-meridian-900", 6890, 39_050],
    ]);
    expect(cash(weakSeason)).toStrictEqual([
      ["halden-wren-400", 1500, 8920],
      ["ostra-sesta-600", 2720, 19_148],
      ["halden-meridian-900", 5448, 34_460],
    ]);
  });

  it("gives each tier its chapter, and tier 3 is the Long Ridge", () => {
    expect(tiers.map((tier) => chapterOf(tier).name)).toStrictEqual([
      "New Meat",
      "Dee's Tip",
      "The Long Ridge",
    ]);
    expect(chapterOf(3).note).toContain("Ridge Road");
  });
});
