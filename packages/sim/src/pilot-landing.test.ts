import { roadHalfWidthAt } from "@racer/track/districts";
import type { RoadId } from "@racer/track/road";
import { trackFor } from "@racer/track/roads";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import { streetBike } from "./bikes.ts";
import { carrierAt, launchOffLip, lipOf, toeOf } from "./carrier.ts";
import { ROCK_BUMP } from "./hazards.ts";
import { riding } from "./pilot-corners.ts";
import { bumpLandingSpeed, landsOffLip } from "./pilot-landing.ts";
import { KMH, alone, frameOf, player } from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import {
  BIKE_HALF_LENGTH,
  clamp,
  curvePushOf,
  lateralSpeedLimit,
  TICK_RATE,
} from "./state.ts";
import type { RaceEvent, RaceState } from "./state.ts";

const emptied = (state: RaceState): RaceState => {
  state.cars.length = 0;
  state.hazards.length = 0;
  return state;
};

const holdingLine = (track: Track, s: number, speed: number): number => {
  const lock = lateralSpeedLimit(streetBike, speed);
  return clamp(
    curvePushOf(streetBike, curvatureAt(track, s), speed),
    -lock,
    lock
  );
};

const firstOutcome = (state: RaceState, track: Track) => {
  const rider = player(state);
  for (let tick = 1; tick < 6 * TICK_RATE; tick += 1) {
    stepRace(state, track, frameOf(state));
    const ended = state.events.find(
      (event) =>
        event.rider === rider.id &&
        (event.kind === "land" || event.kind === "crash")
    );
    if (ended) {
      return {
        cause: ended.kind === "crash" ? ended.cause : "rode on",
        offRoad: Math.abs(rider.x) > roadHalfWidthAt(track, rider.s),
        tick,
      };
    }
  }
  return { cause: "never landed", offRoad: false, tick: -1 };
};

const offTheLip = (road: RoadId, lip: number, x: number, kmh: number) => {
  const track = trackFor(road);
  const state = emptied(alone(track, streetBike));
  const carrier = carrierAt(lip, x, 0, 120);
  carrier.s += lip - lipOf(carrier);
  state.cars.push(carrier);
  const rider = player(state);
  rider.s = lip - 0.01;
  rider.x = x;
  rider.speed = kmh / KMH;
  rider.lateralSpeed = holdingLine(track, rider.s, rider.speed);
  const approved = landsOffLip(
    track,
    rider,
    carrier,
    riding.margin,
    rider.speed
  );
  rider.s = lip;
  rider.airborne = true;
  launchOffLip(track, rider, carrier.speed);
  return { approved, ...firstOutcome(state, track) };
};

const overRock = (s: number, x: number, kmh: number) => {
  const track = trackFor("breakwater-run");
  const state = emptied(alone(track, streetBike));
  state.hazards.push({
    command: null,
    halfLength: 0.3,
    halfWidth: 0.3,
    height: 0.3,
    id: "rock",
    kind: "rock",
    s: s + 0.1,
    spawnTick: 0,
    x,
  });
  const rider = player(state);
  rider.s = s;
  rider.x = x;
  rider.speed = kmh / KMH;
  rider.lateralSpeed = holdingLine(track, s, rider.speed);
  const safeSpeed = bumpLandingSpeed(
    track,
    rider,
    s + 0.1 - 0.3 - BIKE_HALF_LENGTH,
    x,
    0,
    ROCK_BUMP,
    x
  );
  return { safe: safeSpeed >= rider.speed, ...firstOutcome(state, track) };
};

describe("the pilot forecasts a flight with the rule's own step", () => {
  it("refuses the Ridge Road 1,550 m lip at 200 km/h that lands past the road edge, and takes the one at 150 km/h", () => {
    const fast = offTheLip("ridge-road", 1550, 1.8, 200);
    const slower = offTheLip("ridge-road", 1550, 1.8, 150);
    expect(fast).toStrictEqual(
      expect.objectContaining({ approved: false, cause: "landing" })
    );
    expect(fast.offRoad).toBeTruthy();
    expect(slower).toStrictEqual(
      expect.objectContaining({ approved: true, cause: "rode on" })
    );
  });

  it("refuses the Breakwater Run 7,625 m lip at 125 km/h whose flight drops onto the truck", () => {
    const flight = offTheLip("breakwater-run", 7625, 5.4, 125);
    expect(flight).toStrictEqual({
      approved: false,
      cause: "traffic",
      offRoad: false,
      tick: 74,
    });
  });

  it("a skill-one pilot 30 m short of the Slag Row 7,000 m truck at 240 km/h does not commit and never hits the truck", () => {
    const track = trackFor("slag-row");
    const setup = defaultSetup(track, 1);
    const state = createRace({
      ...setup,
      player: {
        ...setup.player,
        bike: streetBike,
        controller: "pilot",
        skill: 1,
      },
      police: { ...setup.police, count: 0 },
      rivals: [],
    });
    const truck = state.cars.at(-1);
    if (truck?.carrier !== true) {
      throw new Error("Slag Row's last car is its truck");
    }
    truck.s = 7000;
    state.cars.splice(0, state.cars.length - 1);
    const rider = player(state);
    rider.s = toeOf(truck) - 30;
    rider.x = truck.x;
    rider.speed = 240 / KMH;
    const events: RaceEvent[] = [];
    let committed = false;
    for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
      stepRace(state, track, frameOf(state));
      committed ||= rider.jumpTaken;
      events.push(...state.events);
    }
    expect(committed).toBeFalsy();
    expect(
      events.some(
        (event) =>
          event.rider === rider.id &&
          event.kind === "crash" &&
          event.cause === "traffic"
      )
    ).toBeFalsy();
  });

  it("forecasts the slowed bike after a rock on the Breakwater Run 850 m bend: 150 km/h is refused and crashes, 120 km/h rides on", () => {
    expect(overRock(850, 1.8, 150)).toStrictEqual(
      expect.objectContaining({ cause: "hazard", safe: false })
    );
    expect(overRock(850, 1.8, 120)).toStrictEqual(
      expect.objectContaining({ cause: "rode on", safe: true })
    );
  });
});
