import { compileTrack } from "@racer/track/track";
import { madridHook } from "@racer/track/tracks/madrid-hook";
import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { player } from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { PLAYER_RIDER, TICK_RATE } from "./state.ts";

const quietHook = compileTrack({ ...madridHook, trafficPerKilometre: 0 });
const LAP_LIMIT = TICK_RATE * 60;
const LAKE_ROAD = 125;
const KMH = 3.6;

describe("the Casa de Campo hook", () => {
  it.each(["ostra-sesta-600", "halden-wren-400"] as const)(
    "the pilot rides it alone on the %s to the finish without leaving the road or falling",
    (bikeId) => {
      const setup = defaultSetup(quietHook, 31);
      const race = createRace({
        ...setup,
        player: { ...setup.player, bike: bikes[bikeId], controller: "pilot" },
        police: { ...setup.police, count: 0 },
        rivals: [],
      });
      const rider = player(race);
      let offRoad = false;
      for (let tick = 0; tick < LAP_LIMIT && rider.finishTick < 0; tick += 1) {
        stepRace(race, quietHook, new Map());
        offRoad ||= rider.offRoad;
      }
      expect({
        crashes: rider.crashes,
        finished: rider.finishTick > 0,
        offRoad,
      }).toStrictEqual({ crashes: 0, finished: true, offRoad: false });
    }
  );

  it.each(["ostra-sesta-600", "halden-wren-400"] as const)(
    "a %s rider who holds the throttle at 190 km/h with the bars centred for three seconds stays on the lake road, within a metre or so of their line",
    (bikeId) => {
      const setup = defaultSetup(quietHook, 31);
      const race = createRace({
        ...setup,
        player: { ...setup.player, bike: bikes[bikeId] },
        police: { ...setup.police, count: 0 },
        rivals: [],
      });
      const rider = player(race);
      rider.s = LAKE_ROAD;
      rider.bodyS = LAKE_ROAD;
      rider.speed = 190 / KMH;
      const line = rider.x;
      const frame = new Map([[PLAYER_RIDER, { ...neutralInput, throttle: 1 }]]);
      let widest = 0;
      let offRoad = false;
      for (let tick = 0; tick < 3 * TICK_RATE; tick += 1) {
        stepRace(race, quietHook, frame);
        widest = Math.max(widest, Math.abs(rider.x - line));
        offRoad ||= rider.offRoad;
      }
      expect({ offRoad, widest: Math.round(widest * 10) / 10 }).toStrictEqual({
        offRoad: false,
        widest: bikeId === "ostra-sesta-600" ? 1.1 : 0.6,
      });
    }
  );
});
