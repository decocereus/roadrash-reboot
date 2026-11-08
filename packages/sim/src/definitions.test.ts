import { bikeDefinitions } from "@racer/content/bikes";
import { celebrityRiders } from "@racer/content/celebrities";
import { ordinaryRiders } from "@racer/content/riders";
import { byId } from "@racer/content/rows";
import { roads } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { bikeIds, bikes, streetBike } from "./bikes.ts";
import { rivalAt, rivalIds, rivals } from "./cast.ts";
import { difficulties, tiers } from "./difficulty.ts";
import { player } from "./race-fixtures.ts";
import {
  createRace,
  defaultPlayer,
  defaultSetup,
  validateSetup,
} from "./race.ts";

const slagRow = compileTrack(roads["slag-row"]);

const onBike = (bike: typeof streetBike) => ({
  ...defaultSetup(slagRow, 1),
  player: { ...defaultPlayer, bike },
});

describe("the bike and rider tables", () => {
  it("refuses two rows with one id", () => {
    expect(() => byId([{ id: "same" }, { id: "same" }], () => 1)).toThrow(
      "Two rows share an id"
    );
  });

  it("gives every bike numbers a race accepts", () => {
    expect(
      bikeIds.flatMap((id) => validateSetup(onBike(bikes[id])))
    ).toStrictEqual([]);
  });

  it("gives every rider numbers a race accepts on every tier", () => {
    expect(
      tiers.flatMap((tier) =>
        rivalIds.flatMap((id) =>
          validateSetup({
            ...defaultSetup(slagRow, 1),
            conditions: difficulties[tier].conditions,
            rivals: [rivalAt(rivals[id], tier)],
          })
        )
      )
    ).toStrictEqual([]);
  });

  it("refuses a bike or a rider outside its range before the race starts", () => {
    const bad = {
      ...defaultSetup(slagRow, 1),
      player: {
        ...defaultPlayer,
        bike: {
          ...streetBike,
          curvePush: 0,
          gears: [30, 20],
          launchAcceleration: Number.NaN,
        },
        skill: 2,
      },
    } as const;
    expect(validateSetup(bad)).toStrictEqual([
      { kind: "outOfRange", rule: "You.skill", value: 2 },
      { kind: "outOfRange", rule: "ostra-sesta-600.curvePush", value: 0 },
      {
        kind: "outOfRange",
        rule: "ostra-sesta-600.launchAcceleration",
        value: Number.NaN,
      },
      { kind: "outOfRange", rule: "ostra-sesta-600.gears", value: 20 },
    ]);
    expect(() => createRace(bad)).toThrow("You.skill");
  });

  it("refuses a gearbox whose upshift drops the revs low enough to shift straight back down", () => {
    const hunting = {
      ...defaultSetup(slagRow, 1),
      player: { ...defaultPlayer, bike: { ...streetBike, gears: [10, 100] } },
    } as const;
    expect(validateSetup(hunting)).toStrictEqual([
      { kind: "outOfRange", rule: "ostra-sesta-600.gears", value: 100 },
    ]);
    expect(() => createRace(hunting)).toThrow("ostra-sesta-600.gears");
  });

  it("refuses an officer outside the rider ranges before the race starts", () => {
    const setup = defaultSetup(slagRow, 1);
    const reckless = {
      ...setup,
      police: {
        ...setup.police,
        officer: { ...setup.police.officer, aggression: 3 },
      },
    };
    expect(validateSetup(reckless)).toStrictEqual([
      {
        kind: "outOfRange",
        rule: `${setup.police.officer.name}.aggression`,
        value: 3,
      },
    ]);
    expect(() => createRace(reckless)).toThrow(
      `${setup.police.officer.name}.aggression`
    );
  });

  it("refuses a colour between two palette entries, so every rider is drawn in one", () => {
    const setup = defaultSetup(slagRow, 1);
    const blended = {
      ...setup,
      player: { ...defaultPlayer, jacket: 2.5, paint: 0.5 },
      police: {
        ...setup.police,
        officer: { ...setup.police.officer, paint: 1.5 },
      },
    };
    expect(validateSetup(blended)).toStrictEqual([
      { kind: "outOfRange", rule: "You.jacket", value: 2.5 },
      { kind: "outOfRange", rule: "You.paint", value: 0.5 },
      {
        kind: "outOfRange",
        rule: `${setup.police.officer.name}.paint`,
        value: 1.5,
      },
    ]);
  });

  it("builds a bike from its spec alone, so its looks and shop rows cannot change how it rides", () => {
    expect(bikeDefinitions.map(({ id }) => bikes[id])).toStrictEqual(
      bikeDefinitions.map(({ id, spec }) => ({ ...spec, id }))
    );
  });

  it("rides the numbers in the race's setup, not the table's", () => {
    const tuned = { ...streetBike, launchAcceleration: 1.5 };
    expect(player(createRace(onBike(tuned))).bike).toBe(tuned);
  });

  it("holds only plain values, so the tables can travel as JSON", () => {
    const tables = [bikeDefinitions, ordinaryRiders, celebrityRiders];
    const sent = JSON.stringify(tables);
    expect(JSON.parse(sent)).toStrictEqual(tables);
  });
});
