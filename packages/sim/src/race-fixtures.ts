import { eased } from "@racer/track/alignment";
import type { HazardPlacement } from "@racer/track/hazards";
import { compileTrack } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { slagRow } from "@racer/track/tracks/slag-row";

import { rivals } from "./cast.ts";
import type { RivalId } from "./cast.ts";
import { controlOf } from "./control.ts";
import { PATROL_SPEED } from "./police.ts";
import {
  createRace,
  defaultSetup,
  neutralInput,
  noHandovers,
  stepRace,
} from "./race.ts";
import { PLAYER_RIDER, TICK_RATE, riderOf } from "./state.ts";
import type {
  BikeSpec,
  InputFrame,
  RaceEvent,
  RaceState,
  RiderInput,
  RiderId,
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
  chevrons: [],
  features: [],
  hazardsPerKilometre: 0,
  pieces: eased([[6000, 0, 0]]),
  trafficPerKilometre: 0,
});

export const scripted = (state: RaceState): RaceState => {
  for (const rider of state.riders) {
    rider.controller = "human";
  }
  return state;
};

export const piloted = (state: RaceState): RaceState => {
  for (const rider of state.riders) {
    rider.controller = "pilot";
  }
  return state;
};

export const controlsOf = (
  ...controls: readonly (readonly [RiderId, Readonly<RiderInput>])[]
): InputFrame => ({
  controls: new Map(controls.map(([id, input]) => [id, controlOf(input)])),
  handovers: noHandovers,
});

export const playerFrame = (input: Readonly<RiderInput>): InputFrame =>
  controlsOf([PLAYER_RIDER, input]);

export const frameOf = (
  state: RaceState,
  ...controls: readonly (readonly [RiderId, RiderInput])[]
): InputFrame =>
  controlsOf(
    ...state.riders.flatMap((rider) =>
      rider.controller === "human" ? [[rider.id, neutralInput] as const] : []
    ),
    ...controls
  );

export const field = (
  course: Track,
  seed: number,
  rivalCount: number,
  copCount: number
): RaceState => {
  const setup = defaultSetup(course, seed);
  return scripted(
    createRace({
      ...setup,
      police: { ...setup.police, count: copCount },
      rivals: setup.rivals.slice(0, rivalCount),
    })
  );
};

export const cruising: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0.5,
};

export const riderAt = (state: RaceState, id: RiderId) => {
  const rider = riderOf(state.riders, id);
  if (!rider) {
    throw new Error(`The race has no rider ${id}.`);
  }
  return rider;
};

export const player = (state: RaceState) => riderAt(state, PLAYER_RIDER);

export const rivalNamed = (state: RaceState, who: RivalId): RiderState => {
  const { name } = rivals[who];
  const rival = state.riders.find(
    (rider) => rider.profile.role === "racer" && rider.profile.name === name
  );
  if (!rival) {
    throw new Error(`${name} is not in the race.`);
  }
  return rival;
};

export const onlyCop = (state: RaceState): RiderState => {
  const [cop, ...others] = state.riders.filter(
    (rider) => rider.profile.role === "police"
  );
  if (!cop || others.length > 0) {
    throw new Error(
      `The race has ${others.length + (cop ? 1 : 0)} cops, not one.`
    );
  }
  return cop;
};

export const hold = (
  state: RaceState,
  course: Track,
  input: RiderInput,
  seconds: number
): RaceEvent[] => {
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, frameOf(state, [PLAYER_RIDER, input]));
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
  rivalNamed(state, "dee-santangelo").s = 900;
  const me = player(state);
  const moose = rivalNamed(state, "moose-kowalczyk");
  for (const rider of [me, moose]) {
    rider.s = 50;
    rider.speed = 30;
  }
  return { me, moose, state };
};

export const brawl = (
  state: RaceState,
  seconds: number,
  framesAt: (tick: number) => InputFrame
): RaceEvent[] => {
  const me = player(state);
  const moose = rivalNamed(state, "moose-kowalczyk");
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    me.x = 0.3;
    moose.x = 1.8;
    moose.s = me.s;
    stepRace(state, straight, framesAt(tick));
    events.push(...state.events);
  }
  return events;
};

export const fightFrame = (
  state: RaceState,
  mine: RiderInput,
  moose: RiderInput
): InputFrame =>
  frameOf(
    state,
    [PLAYER_RIDER, mine],
    [rivalNamed(state, "dee-santangelo").id, cruising],
    [rivalNamed(state, "moose-kowalczyk").id, moose]
  );

export const pressing = (
  key: "punch" | "kick",
  pressed: boolean
): RiderInput => ({
  ...cruising,
  [key]: pressed,
});

export const patrolFrom = (cop: RiderState, s: number) => {
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
  chevrons: [],
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
  chevrons: [],
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
  rider.controller = "pilot";
  const events: RaceEvent[] = [];
  const line: Trace[] = [];
  const slippingSteer: number[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    beforeTick?.(tick);
    stepRace(state, road, frameOf(state));
    events.push(...state.events);
    line.push({ s: rider.s, x: rider.x });
    if (rider.slip > 0) {
      slippingSteer.push(Math.abs(rider.input.steer));
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
