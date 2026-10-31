import { stretches, stretchIds } from "@racer/track/stretches";
import type { StretchId } from "@racer/track/stretches";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import { player, playerFrame } from "./race-fixtures.ts";
import {
  createRace,
  defaultSetup,
  emptyFrame,
  neutralInput,
  stepRace,
} from "./race.ts";
import { TICK_RATE } from "./state.ts";

const LAP_LIMIT = TICK_RATE * 180;
const KMH = 3.6;

interface Straight {
  readonly id: StretchId;
  readonly name: string;
  readonly atM: number;
  readonly widest: Readonly<Record<string, number>>;
}

const straights: readonly Straight[] = [
  {
    atM: 125,
    id: "madrid-hook",
    name: "the lake road",
    widest: { "halden-wren-400": 0.6, "ostra-sesta-600": 1.1 },
  },
  {
    atM: 1090,
    id: "madrid-gran-via",
    name: "Gran Vía past Telefónica",
    widest: { "halden-wren-400": 0.2, "ostra-sesta-600": 0.9 },
  },
];

const bikeIds = ["ostra-sesta-600", "halden-wren-400"] as const;
const quiet = {
  "madrid-gran-via": compileTrack({
    ...stretches["madrid-gran-via"],
    trafficPerKilometre: 0,
  }),
  "madrid-hook": compileTrack({
    ...stretches["madrid-hook"],
    trafficPerKilometre: 0,
  }),
} satisfies Record<StretchId, Track>;

const rides = stretchIds.flatMap((id) =>
  bikeIds.map((bikeId) => [id, bikeId] as const)
);

describe("the Madrid stretches", () => {
  it.each(rides)(
    "the pilot rides %s alone on the %s to the finish without leaving the road or falling",
    (id, bikeId) => {
      const track = quiet[id];
      const setup = defaultSetup(track, 31);
      const race = createRace({
        ...setup,
        player: { ...setup.player, bike: bikes[bikeId], controller: "pilot" },
        police: { ...setup.police, count: 0 },
        rivals: [],
      });
      const rider = player(race);
      let offRoad = false;
      for (let tick = 0; tick < LAP_LIMIT && rider.finishTick < 0; tick += 1) {
        stepRace(race, track, emptyFrame);
        offRoad ||= rider.offRoad;
      }
      expect({
        crashes: rider.crashes,
        finished: rider.finishTick > 0,
        offRoad,
      }).toStrictEqual({ crashes: 0, finished: true, offRoad: false });
    }
  );

  it.each(
    straights.flatMap((straight) =>
      bikeIds.map((bikeId) => [straight.name, bikeId, straight] as const)
    )
  )(
    "a rider on %s who holds the throttle at 190 km/h with the bars centred for three seconds on the %s stays on the road, within a metre or so of their line",
    (_name, bikeId, straight) => {
      const track = quiet[straight.id];
      const setup = defaultSetup(track, 31);
      const race = createRace({
        ...setup,
        player: { ...setup.player, bike: bikes[bikeId] },
        police: { ...setup.police, count: 0 },
        rivals: [],
      });
      const rider = player(race);
      rider.s = straight.atM;
      rider.bodyS = straight.atM;
      rider.speed = 190 / KMH;
      const line = rider.x;
      const frame = playerFrame({ ...neutralInput, throttle: 1 });
      let widest = 0;
      let offRoad = false;
      for (let tick = 0; tick < 3 * TICK_RATE; tick += 1) {
        stepRace(race, track, frame);
        widest = Math.max(widest, Math.abs(rider.x - line));
        offRoad ||= rider.offRoad;
      }
      expect({ offRoad, widest: Math.round(widest * 10) / 10 }).toStrictEqual({
        offRoad: false,
        widest: straight.widest[bikeId],
      });
    }
  );
});
