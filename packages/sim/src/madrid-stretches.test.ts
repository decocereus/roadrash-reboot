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

interface StagedBend {
  readonly id: StretchId;
  readonly name: string;
  readonly atM: number;
  readonly widest: Readonly<Record<string, number>>;
  readonly offRoad: Readonly<Record<string, boolean>>;
}

const stagedBends: readonly StagedBend[] = [
  {
    atM: 125,
    id: "madrid-hook",
    name: "the lake road",
    offRoad: { "halden-wren-400": false, "ostra-sesta-600": true },
    widest: { "halden-wren-400": 2.1, "ostra-sesta-600": 2.4 },
  },
  {
    atM: 1090,
    id: "madrid-gran-via",
    name: "Gran Vía past Telefónica",
    offRoad: { "halden-wren-400": false, "ostra-sesta-600": false },
    widest: { "halden-wren-400": 3.1, "ostra-sesta-600": 3.6 },
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
    stagedBends.flatMap((bend) =>
      bikeIds.map((bikeId) => [bend.name, bikeId, bend] as const)
    )
  )(
    "a bend on %s pushes a rider who holds the throttle at 190 km/h with the bars centred for three seconds on the %s",
    (_name, bikeId, bend) => {
      const track = quiet[bend.id];
      const setup = defaultSetup(track, 31);
      const race = createRace({
        ...setup,
        player: { ...setup.player, bike: bikes[bikeId] },
        police: { ...setup.police, count: 0 },
        rivals: [],
      });
      const rider = player(race);
      rider.s = bend.atM;
      rider.bodyS = bend.atM;
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
        offRoad: bend.offRoad[bikeId],
        widest: bend.widest[bikeId],
      });
    }
  );
});
