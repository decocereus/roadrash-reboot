import { eased } from "@racer/track/alignment";
import { hazardSizes } from "@racer/track/hazards";
import type { HazardPlacement } from "@racer/track/hazards";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { spawnRock } from "./hazards.ts";
import { pilotInput } from "./pilot.ts";
import {
  KMH,
  boulder,
  effectsOf,
  field,
  hazardFreeRoad,
  pilotAt,
  pilotFrom,
  placedAt,
  copIn,
  player,
  roadWith,
  slick,
  slowTruckAt,
} from "./race-fixtures.ts";
import type { Trace } from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { BIKE_HALF_WIDTH, TICK_RATE } from "./state.ts";
import type { RaceEvent } from "./state.ts";

const oilyTurnIn = compileTrack({
  ...ridgeRoad,
  features: [],
  hazardsPerKilometre: 0,
  pieces: eased([
    [900, 0, 0],
    [180, -60, 0],
    [3000, 0, 0],
  ]),
  trafficPerKilometre: 0,
});

const throughOilyTurnIn = () => {
  const road: Track = {
    ...oilyTurnIn,
    hazards: [-2.7, -0.9, 0.9, 2.7].map((x, index) =>
      placedAt("oil", 927, x, `slick-${index}`)
    ),
  };
  const run = pilotAt(road, 700, 10);
  const slid = run.events.find(
    (event) => event.kind === "hazard" && event.effect === "slip"
  );
  return {
    crashes: run.events.filter((event) => event.kind === "crash"),
    kmhOnSlick: slid?.kind === "hazard" ? slid.speed * KMH : 0,
    widest: Math.max(...run.line.map((point) => point.x)),
  };
};

const crossingAt = (line: readonly Trace[], s: number): number =>
  line.find((point) => point.s >= s)?.x ?? Number.NaN;

interface Closing {
  readonly truckS: number;
  readonly speed: number;
  readonly x: number;
}

const closingOnTruck: Closing = { speed: 45, truckS: 970, x: 1.8 };

const fastOnTruck: Closing = { speed: 65, truckS: 980, x: 1.8 };

const escapes: readonly (readonly [string, Closing, HazardPlacement])[] = [
  [
    "a rock level with the truck",
    closingOnTruck,
    placedAt("rock", 970, -0.6, "level"),
  ],
  [
    "a pothole on the line it starts on",
    { speed: 35, truckS: 960, x: 2.6 },
    placedAt("pothole", 960, 2.4, "underfoot"),
  ],
];

const pilotBehindTruck = (road: Track, closing = closingOnTruck) => {
  const state = field(road, 1, 0, 0);
  slowTruckAt(state, closing.truckS, 1.8);
  const rider = player(state);
  rider.s = 920;
  rider.x = closing.x;
  rider.speed = closing.speed;
  return pilotFrom(state, road, 6);
};

const copBehindTruck = (road: Track, closing = closingOnTruck) => {
  const state = field(road, 1, 0, 1);
  slowTruckAt(state, closing.truckS, 1.8);
  const target = player(state);
  const cop = copIn(state);
  cop.parked = false;
  cop.post = 900;
  cop.chase = target.id;
  cop.s = 920;
  cop.x = closing.x;
  cop.speed = closing.speed;
  target.s = 935;
  target.x = -3;
  target.speed = closing.speed;
  const inputs = state.riders.map(() => ({ ...neutralInput }));
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
    pilotInput(state, road, cop, inputs[cop.id] ?? { ...neutralInput });
    inputs[target.id] = { ...neutralInput, throttle: 0.6 };
    stepRace(state, road, inputs);
    events.push(...state.events);
  }
  return events.filter((event) => event.rider === cop.id);
};

const diceAfterPiloting = (road: Track): number => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = 800;
  rider.x = 1.8;
  rider.speed = 170 / KMH;
  pilotFrom(state, road, 3);
  return state.dice;
};

const downed = (events: readonly RaceEvent[]): RaceEvent[] =>
  events.filter((event) => event.kind === "crash");

const OVERLOOKING_SEED = 10;

const rockDroppedPastOverlookedPothole = () => {
  const road = roadWith(
    placedAt("rock", 1020, -1.8, "beyond"),
    placedAt("pothole", 1000, -1.8, "unseen")
  );
  const setup = defaultSetup(road, OVERLOOKING_SEED);
  const state = createRace({
    ...setup,
    player: { ...setup.player, skill: 0.8 },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
  const rider = player(state);
  rider.s = 900;
  rider.x = 1.8;
  rider.speed = 170 / KMH;
  let overlooked = "";
  const run = pilotFrom(state, road, 4, (tick) => {
    if (tick === TICK_RATE / 2) {
      overlooked = rider.hazardMissed
        ? (state.hazards[rider.hazardSeen]?.id ?? "")
        : "";
      spawnRock(state, road, {
        command: "cmd-9",
        id: "dropped",
        s: 1010,
        x: 1.8,
      });
    }
  });
  return { ...run, overlooked };
};

describe("road hazards", () => {
  it("the pilot slows for oil across a bend's turn-in and keeps to its own side of the road instead of sliding to the verge at corner speed", () => {
    const run = throughOilyTurnIn();
    expect(run.crashes).toStrictEqual([]);
    expect(run.kmhOnSlick).toBeGreaterThan(50);
    expect(run.kmhOnSlick).toBeLessThan(100);
    expect(run.widest).toBeLessThan(ridgeRoad.laneWidth);
  });

  it("the pilot rides round a rock in its lane at 170 km/h and stays up", () => {
    const run = pilotAt(boulder, 800, 6);
    expect(run.events.filter((event) => event.kind === "crash")).toStrictEqual(
      []
    );
    expect(Math.abs(crossingAt(run.line, 1000) - 1.8)).toBeGreaterThan(
      hazardSizes.rock.halfWidth + BIKE_HALF_WIDTH
    );
  });

  it("the pilot rides round an oil slick it sees in time, and holds a straight line across one it meets too late", () => {
    const seen = pilotAt(slick, 800, 6);
    expect(effectsOf(seen.events)).toStrictEqual([]);
    const late = pilotAt(slick, 985, 2);
    expect(effectsOf(late.events)).toStrictEqual(["slip"]);
    expect(late.events.filter((event) => event.kind === "crash")).toStrictEqual(
      []
    );
    expect(Math.max(...late.slippingSteer)).toBeLessThan(0.6);
  });

  it("the pilot never dodges a rock into the back of a slow truck", () => {
    expect(downed(pilotBehindTruck(hazardFreeRoad).events)).toStrictEqual([]);
    const withRock = pilotBehindTruck(
      roadWith(placedAt("rock", 1000, 0, "centre"))
    );
    expect(downed(withRock.events)).toStrictEqual([]);
  });

  it.each([
    ["pothole", "rut"],
    ["oil", "slick"],
  ] as const)(
    "the pilot escaping a slow truck never weakens the escape to miss a %s in the lane it escapes to",
    (kind, id) => {
      const nearTruck = { ...closingOnTruck, truckS: 960 };
      expect(
        downed(pilotBehindTruck(hazardFreeRoad, nearTruck).events)
      ).toStrictEqual([]);
      const run = pilotBehindTruck(
        roadWith(placedAt(kind, 970, -1.8, id)),
        nearTruck
      );
      expect(downed(run.events)).toStrictEqual([]);
    }
  );

  it("the pilot escaping a truck straightens short of a rock in its escape path once the line clears the truck", () => {
    const run = pilotBehindTruck(
      roadWith(placedAt("rock", 970, -0.6, "beside")),
      fastOnTruck
    );
    expect(effectsOf(run.events)).toStrictEqual([]);
    expect(downed(run.events)).toStrictEqual([]);
  });

  it("a pursuing cop escaping a truck straightens short of a rock in its escape path once the line clears the truck", () => {
    expect(
      downed(
        copBehindTruck(
          roadWith(placedAt("rock", 970, -0.6, "beside")),
          fastOnTruck
        )
      )
    ).toStrictEqual([]);
  });

  it.each(escapes)(
    "the pilot escaping a truck past %s stays up, as it does on a clear road",
    (_, closing, hazard) => {
      expect(
        downed(pilotBehindTruck(hazardFreeRoad, closing).events)
      ).toStrictEqual([]);
      expect(
        downed(pilotBehindTruck(roadWith(hazard), closing).events)
      ).toStrictEqual([]);
    }
  );

  it.each(escapes)(
    "a pursuing cop escaping a truck past %s stays up, as it does on a clear road",
    (_, closing, hazard) => {
      expect(downed(copBehindTruck(hazardFreeRoad, closing))).toStrictEqual([]);
      expect(downed(copBehindTruck(roadWith(hazard), closing))).toStrictEqual(
        []
      );
    }
  );

  it("a pursuing cop never dodges a rock into the back of a slow truck", () => {
    expect(downed(copBehindTruck(hazardFreeRoad))).toStrictEqual([]);
    expect(
      downed(copBehindTruck(roadWith(placedAt("rock", 1000, 0, "centre"))))
    ).toStrictEqual([]);
  });

  it.each([5, 20])(
    "the pilot dodges a rock to the clear side, not into a second rock %i m beyond it",
    (apart) => {
      const run = pilotAt(
        roadWith(
          placedAt("rock", 1000, 1.8, "first"),
          placedAt("rock", 1000 + apart, 3.08, "second")
        ),
        800,
        6
      );
      expect(effectsOf(run.events)).toStrictEqual([]);
      expect(downed(run.events)).toStrictEqual([]);
    }
  );

  it("a pilot who overlooks the nearest pothole still rides round a rock dropped in its lane between the pothole and a rock it already sees", () => {
    const run = rockDroppedPastOverlookedPothole();
    expect({
      crashes: downed(run.events),
      effects: effectsOf(run.events),
      overlooked: run.overlooked,
    }).toStrictEqual({ crashes: [], effects: [], overlooked: "unseen" });
    expect(Math.abs(crossingAt(run.line, 1010) - 1.8)).toBeGreaterThan(
      hazardSizes.rock.halfWidth + BIKE_HALF_WIDTH
    );
  });

  it("a pilot looking at a hazard leaves the dice for jumps and fights untouched", () => {
    expect(diceAfterPiloting(boulder)).toBe(diceAfterPiloting(hazardFreeRoad));
  });
});
