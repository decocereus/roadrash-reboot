import { openLanesAt } from "@racer/track/districts";
import type { HazardPlacement } from "@racer/track/hazards";
import { roads, trackFor } from "@racer/track/roads";
import { compileTrack, curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { bikes } from "./bikes.ts";
import type { BikeId } from "./bikes.ts";
import { placeRiderAcross, placeRiderAt, setRiderSpeed } from "./commands.ts";
import { controlOf } from "./control.ts";
import { difficulties } from "./difficulty.ts";
import { player } from "./race-fixtures.ts";
import {
  createRace,
  defaultSetup,
  emptyFrame,
  noHandovers,
  stepRace,
} from "./race.ts";
import { PLAYER_RIDER, clamp, curvePushOf, steerFor } from "./state.ts";

const RUN_UP = 160;
const RUN_OUT = 250;
const LAP_TICKS = 25_200;
const SPEED_STEP = 10;
const LINE_PULL = 1.2;
const LINE_SWAY = 3;
const SLIPPING = 0.2;
const EASED_BARS = 0.45;
const STARTED_TICK = 600;
const TEST_TIMEOUT = 120_000;
const RIDDEN_BIKES = [
  "halden-wren-400",
  "ostra-sesta-600",
  "ostra-nera-1000",
] as const satisfies readonly BikeId[];

const setupOn = (track: Track, bikeId: BikeId, pilot: boolean) => {
  const base = defaultSetup(track, 7);
  return createRace({
    ...base,
    conditions: { ...difficulties[3].conditions, slowConvoys: 0 },
    pacing: { catchUp: 0, leadEase: 0 },
    player: {
      ...base.player,
      bike: bikes[bikeId],
      controller: pilot ? "pilot" : "human",
    },
    police: { ...base.police, count: 0 },
    rivals: [],
  });
};

const emptyRoad = (roadId: "breakwater-run" | "ridge-road"): Track =>
  compileTrack({ ...roads[roadId], carriers: [], trafficPerKilometre: 0 });

const racingSpeeds = (track: Track, bikeId: BikeId): readonly number[] => {
  const bare: Track = { ...track, hazards: [], walkSites: [] };
  const race = setupOn(bare, bikeId, true);
  const rider = player(race);
  const speeds: number[] = [];
  for (let tick = 0; tick < LAP_TICKS && rider.finishTick < 0; tick += 1) {
    stepRace(race, bare, emptyFrame);
    const at = Math.round(rider.s / SPEED_STEP);
    speeds[at] ??= rider.speed;
  }
  return speeds;
};

const crashOver = (
  track: Track,
  hazard: HazardPlacement,
  bikeId: BikeId,
  speeds: readonly number[]
): string | null => {
  const alone: Track = { ...track, hazards: [hazard], walkSites: [] };
  const race = setupOn(alone, bikeId, false);
  const speedAt = (s: number): number =>
    speeds[Math.round(s / SPEED_STEP)] ?? speeds.at(-1) ?? 0;
  const rider = player(race);
  const from = hazard.s - RUN_UP;
  placeRiderAt(race, PLAYER_RIDER, from);
  placeRiderAcross(race, PLAYER_RIDER, hazard.x);
  setRiderSpeed(race, PLAYER_RIDER, speedAt(from));
  race.tick = STARTED_TICK;
  for (
    let tick = 0;
    tick < LAP_TICKS && rider.mode === "riding" && rider.s < hazard.s + RUN_OUT;
    tick += 1
  ) {
    const curvature = curvatureAt(alone, rider.s);
    const line = clamp((hazard.x - rider.x) * LINE_PULL, -LINE_SWAY, LINE_SWAY);
    const steer = clamp(
      steerFor(
        rider.bike,
        curvature,
        rider.speed,
        line + curvePushOf(rider.bike, curvature, rider.speed)
      ),
      -1,
      1
    );
    const target = speedAt(rider.s);
    stepRace(race, alone, {
      controls: new Map([
        [
          PLAYER_RIDER,
          controlOf({
            brake:
              rider.speed > target + 1
                ? clamp((rider.speed - target) / 6, 0, 1)
                : 0,
            kick: false,
            punch: false,
            remount: false,
            steer:
              rider.slip > SLIPPING
                ? clamp(steer, -EASED_BARS, EASED_BARS)
                : steer,
            throttle: rider.speed < target ? 1 : 0,
          }),
        ],
      ]),
      handovers: noHandovers,
    });
    const crash = race.events.find((event) => event.kind === "crash");
    if (crash) {
      return `${track.plan.id} ${hazard.kind} at ${Math.round(hazard.s)} m on ${bikeId}: ${crash.cause}`;
    }
  }
  return null;
};

describe("hazards on the only lane", () => {
  it.each(["breakwater-run", "ridge-road"] as const)(
    "%s has none a rider at racing speed cannot ride through with the bars eased",
    (roadId) => {
      const track = emptyRoad(roadId);
      expect(track.hazards).toStrictEqual(trackFor(roadId).hazards);
      const onlyLane = track.hazards.filter(
        (hazard) => openLanesAt(track, hazard.s) === 1
      );
      expect(onlyLane.length).toBeGreaterThanOrEqual(5);
      const crashes = RIDDEN_BIKES.flatMap((bikeId) => {
        const speeds = racingSpeeds(track, bikeId);
        return onlyLane.flatMap(
          (hazard) => crashOver(track, hazard, bikeId, speeds) ?? []
        );
      });
      expect(crashes).toStrictEqual([]);
    },
    TEST_TIMEOUT
  );
});
