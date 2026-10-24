import { compileTrack } from "@racer/track/track";
import { madridHook } from "@racer/track/tracks/madrid-hook";
import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { pilotInput } from "./pilot.ts";
import { cruising, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";

const quietHook = compileTrack({ ...madridHook, trafficPerKilometre: 0 });
const LAP_LIMIT = TICK_RATE * 60;

describe("the Casa de Campo hook", () => {
  it.each(["ostra-sesta-600", "halden-wren-400"] as const)(
    "the pilot rides it alone on the %s to the finish without leaving the road or falling",
    (bikeId) => {
      const setup = defaultSetup(quietHook, 31);
      const race = createRace({
        ...setup,
        player: { ...setup.player, bike: bikes[bikeId] },
        police: { ...setup.police, count: 0 },
        rivals: [],
      });
      const rider = player(race);
      const input = { ...cruising };
      let offRoad = false;
      for (let tick = 0; tick < LAP_LIMIT && rider.finishTick < 0; tick += 1) {
        pilotInput(race, quietHook, rider, input);
        stepRace(race, quietHook, [input]);
        offRoad ||= rider.offRoad;
      }
      expect({
        crashes: rider.crashes,
        finished: rider.finishTick > 0,
        offRoad,
      }).toStrictEqual({ crashes: 0, finished: true, offRoad: false });
    }
  );
});
