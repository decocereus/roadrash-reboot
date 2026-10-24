import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { wearingFrom, wornBy } from "../src/game/figure-wear.ts";

const riders = () =>
  createRaceRun(defaultSetup(trackFor("ridge-road", 1), 3)).view.riders;

describe("celebrity figures from the play-test flags", () => {
  it("reads ?as and ?against and skips names that are not celebrities", () => {
    expect(wearingFrom("?as=kylie&against=ronaldo,nobody,kylie")).toStrictEqual(
      { against: ["ronaldo", "kylie"], as: "kylie" }
    );
    expect(wearingFrom("?as=nobody")).toStrictEqual({ against: [], as: null });
  });

  it("dresses the player as ?as and the first rival racers as ?against", () => {
    const field = riders();
    const rivals = field
      .filter(
        (rider) => rider.id !== PLAYER_RIDER && rider.profile.role === "racer"
      )
      .map((rider) => rider.id);
    const worn = wornBy(
      wearingFrom("?as=ronaldo&against=kylie,ronaldo"),
      field
    );
    expect([...worn]).toStrictEqual([
      [PLAYER_RIDER, "ronaldo"],
      [rivals[0], "kylie"],
      [rivals[1], "ronaldo"],
    ]);
  });

  it("leaves every rider generic without the flags", () => {
    expect(wornBy(wearingFrom(""), riders()).size).toBe(0);
  });
});
