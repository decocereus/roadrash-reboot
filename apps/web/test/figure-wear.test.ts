import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { celebrityIds, wearingFrom, wornBy } from "../src/game/figure-wear.ts";

const setup = defaultSetup(trackFor("ridge-road", 1), 3);

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
});
