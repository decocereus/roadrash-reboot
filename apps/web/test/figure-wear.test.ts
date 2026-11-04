import { recordedRules } from "@racer/career/bench";
import { practiceSetup } from "@racer/career/field";
import { celebrityIds, rivals as castRivals } from "@racer/sim/cast";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { wearingFrom, wornBy } from "../src/game/figure-wear.ts";

const onRoad = (celebrities: boolean, roadId: "ridge-road" | "slag-row") =>
  practiceSetup(
    { ...recordedRules, celebrities, fieldSize: 10, levelCount: 3 },
    { bikeId: "ostra-sesta-600", level: 1, roadId, seed: 3 },
    trackFor(roadId)
  );

const setup = onRoad(false, "ridge-road");

describe("celebrity figures from the play-test flags", () => {
  it("reads ?as and ?against and skips names that are not celebrities", () => {
    expect(wearingFrom("?as=kylie&against=ronaldo,nobody,kylie")).toStrictEqual(
      { against: ["ronaldo", "kylie"], as: "kylie" }
    );
    expect(wearingFrom("?as=nobody")).toStrictEqual({ against: [], as: null });
  });

  it("accepts every celebrity in the cast by name", () => {
    expect(
      wearingFrom(`?as=ranveer&against=${celebrityIds.join(",")}`)
    ).toStrictEqual({ against: celebrityIds, as: "ranveer" });
  });

  it("dresses the player as ?as and the first rival racers as ?against", () => {
    const rivals = createRaceRun(setup)
      .view.riders.filter(
        (rider) => rider.id !== PLAYER_RIDER && rider.profile.role === "racer"
      )
      .map((rider) => rider.id);
    const worn = wornBy(
      wearingFrom("?as=ronaldo&against=kylie,ronaldo"),
      setup
    );
    expect([...worn]).toStrictEqual([
      [PLAYER_RIDER, "ronaldo"],
      [rivals[0], "kylie"],
      [rivals[1], "ronaldo"],
    ]);
  });

  it("leaves every rider generic without the flags", () => {
    expect(wornBy(wearingFrom(""), setup).size).toBe(0);
  });

  it("dresses the two named celebrities of a Slag Row race as themselves", () => {
    const slagRow = onRoad(true, "slag-row");
    const run = createRaceRun(slagRow);
    const worn = wornBy(wearingFrom(""), slagRow);
    const wornByName = run.view.riders.flatMap((rider) => {
      const model = worn.get(rider.id);
      return model === undefined ? [] : [[rider.profile.name, model]];
    });
    expect(wornByName).toStrictEqual(
      expect.arrayContaining([
        [castRivals["captain-penaldo"].name, "ronaldo"],
        [castRivals["supreme-leader-mbosse"].name, "mbappe"],
      ])
    );
    expect(wornByName).toHaveLength(2);
  });
});
