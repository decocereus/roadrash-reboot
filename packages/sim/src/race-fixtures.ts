import { eased } from "@racer/track/alignment";
import type { HazardPlacement } from "@racer/track/hazards";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { slagRow } from "@racer/track/tracks/slag-row";

import { pilotInput } from "./pilot.ts";
import { PATROL_SPEED } from "./police.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type {
  BikeSpec,
  RaceEvent,
  RaceState,
  RiderInput,
  RiderState,
} from "./state.ts";

export const KMH = 3.6;

export const track = compileTrack(ridgeRoad);

export const quietTrack = compileTrack({
  ...ridgeRoad,
  hazardsPerKilometre: 0,
  trafficPerKilometre: 0,
});

export const straight = compileTrack({
  ...ridgeRoad,
  features: [],
  hazardsPerKilometre: 0,
  pieces: eased([[6000, 0, 0]]),
  trafficPerKilometre: 0,
});

export const field = (
  course: Track,
  seed: number,
  rivalCount: number,
  copCount: number
): RaceState => {
  const setup = defaultSetup(course, seed);
  return createRace({
    ...setup,
    police: { ...setup.police, count: copCount },
    rivals: setup.rivals.slice(0, rivalCount),
  });
};

export const cruising: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0.5,
};

export const riderAt = (state: RaceState, index: number) => {
  const rider = state.riders[index];
  if (!rider) {
    throw new Error(`The race has no rider ${index}.`);
  }
  return rider;
};

export const player = (state: RaceState) => {
  const [rider] = state.riders;
  if (!rider) {
    throw new Error("The race has no rider.");
  }
  return rider;
};

export const hold = (
  state: RaceState,
  course: Track,
  input: RiderInput,
  seconds: number
): RaceEvent[] => {
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, [input]);
    events.push(...state.events);
  }
  return events;
};

export const towardTheBike = (
  rider: RiderState,
  riding: RiderInput
): RiderInput => {
  if (rider.mode !== "running") {
    return riding;
  }
  const gapS = rider.s - rider.bodyS;
  const gapX = rider.x - rider.bodyX;
  const distance = Math.max(1e-6, Math.hypot(gapS, gapX));
  return {
    ...riding,
    brake: Math.max(0, -gapS / distance),
    steer: gapX / distance,
    throttle: Math.max(0, gapS / distance),
  };
};

export const alone = (course: Track, bike: BikeSpec): RaceState => {
  const setup = defaultSetup(course, 1);
  return createRace({
    ...setup,
    player: { ...setup.player, bike },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

export const sideBySide = () => {
  const state = field(straight, 1, 2, 0);
  riderAt(state, 1).s = 900;
  const me = riderAt(state, 0);
  const moose = riderAt(state, 2);
  for (const rider of [me, moose]) {
    rider.s = 50;
    rider.speed = 30;
  }
  return { me, moose, state };
};

export const brawl = (
  state: RaceState,
  seconds: number,
  inputsAt: (tick: number) => readonly RiderInput[]
): RaceEvent[] => {
  const me = riderAt(state, 0);
  const moose = riderAt(state, 2);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    me.x = 0.3;
    moose.x = 1.8;
    moose.s = me.s;
    stepRace(state, straight, inputsAt(tick));
    events.push(...state.events);
  }
  return events;
};

export const pressing = (
  key: "punch" | "kick",
  pressed: boolean
): RiderInput => ({
  ...cruising,
  [key]: pressed,
});

export const patrolFrom = (state: RaceState, copIndex: number, s: number) => {
  const cop = riderAt(state, copIndex);
  cop.parked = false;
  cop.s = s;
  cop.x = track.plan.laneWidth / 2;
  cop.speed = PATROL_SPEED;
  return cop;
};

export const quietSlagRow = compileTrack({
  ...slagRow,
  hazardsPerKilometre: 0,
  trafficPerKilometre: 0,
});

export const HERMITS_BEND_FROM = 6060;

export const HERMITS_BEND_TO = 6240;

export const loadingRamp = {
  kind: "jump",
  length: 16,
  rise: 0.8,
  width: 1.4,
} as const;

export const rampRoadPlan = {
  ...ridgeRoad,
  features: [
    {
      feature: loadingRamp,
      fromLevel: 1,
      id: "middle-ramp",
      placement: "fixed",
      s: 1000,
      x: 0,
    },
    {
      feature: loadingRamp,
      fromLevel: 1,
      id: "edge-ramp",
      placement: "fixed",
      s: 2000,
      x: 3.8,
    },
  ],
  hazardsPerKilometre: 0,
  pieces: eased([[6000, 0, 0]]),
  trafficPerKilometre: 0,
} as const;

export const rampRoad = compileTrack(rampRoadPlan);

export const flatOut: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 1,
};

export interface Placement {
  readonly s: number;
  readonly x: number;
  readonly speed: number;
  readonly lateralSpeed: number;
  readonly air?: number;
  readonly verticalSpeed?: number;
  readonly airborne?: boolean;
  readonly steer?: number;
}

export const hazardFreeRoad = compileTrack({
  ...ridgeRoad,
  features: [],
  hazardsPerKilometre: 0,
  pieces: eased([[6000, 0, 0]]),
  trafficPerKilometre: 0,
});

export const roadWith = (...hazards: readonly HazardPlacement[]): Track => ({
  ...hazardFreeRoad,
  hazards,
});

export const placedAt = (
  kind: HazardPlacement["kind"],
  s: number,
  x: number,
  id: string
): HazardPlacement => ({ fromLevel: 1, id, kind, s, setting: "traffic", x });

export const slick = roadWith(placedAt("oil", 1000, 1.8, "slick"));

export const boulder = roadWith(placedAt("rock", 1000, 1.8, "boulder"));

export const effectsOf = (events: readonly RaceEvent[]): string[] =>
  events.flatMap((event) => (event.kind === "hazard" ? [event.effect] : []));

export interface Trace {
  readonly s: number;
  readonly x: number;
}

export const pilotFrom = (
  state: RaceState,
  road: Track,
  seconds: number,
  beforeTick?: (tick: number) => void
) => {
  const rider = player(state);
  const input = { ...neutralInput };
  const events: RaceEvent[] = [];
  const line: Trace[] = [];
  const slippingSteer: number[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    beforeTick?.(tick);
    pilotInput(state, road, 0, input);
    stepRace(state, road, [input]);
    events.push(...state.events);
    line.push({ s: rider.s, x: rider.x });
    if (rider.slip > 0) {
      slippingSteer.push(Math.abs(input.steer));
    }
  }
  return { events, line, rider, slippingSteer };
};

export const pilotAt = (road: Track, s: number, seconds: number) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = s;
  rider.x = 1.8;
  rider.speed = 170 / KMH;
  return pilotFrom(state, road, seconds);
};

export const slowTruckAt = (state: RaceState, s: number, x: number): void => {
  state.cars.push({
    cruiseSpeed: 10,
    halfLength: 4.2,
    halfWidth: 1.2,
    height: 3.1,
    paint: 1,
    s,
    speed: 10,
    x,
  });
};
