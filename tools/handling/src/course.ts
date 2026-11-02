import { streetBike } from "@racer/sim/bikes";
import { controlOf } from "@racer/sim/control";
import {
  createRace,
  defaultSetup,
  emptyFrame,
  stepRace,
} from "@racer/sim/race";
import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import type {
  BikeSpec,
  InputFrame,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import { roadAtLevel, roadIds } from "@racer/track/road";
import type { RoadLevel } from "@racer/track/road";
import { roads } from "@racer/track/roads";
import { stretches, stretchIds } from "@racer/track/stretches";
import type { Track, TrackPlan } from "@racer/track/track";

export const KMH = 3.6;
export const RIDE_SEED = 31;
export const bike: BikeSpec = streetBike;

export interface Course {
  readonly id: string;
  readonly plan: TrackPlan;
}

export const coursesAt = (level: RoadLevel): readonly Course[] => [
  ...roadIds.map((id) => ({ id, plan: roadAtLevel(roads[id], level) })),
  ...stretchIds.map((id) => ({ id, plan: stretches[id] })),
];

export const quietPlan = (plan: TrackPlan): TrackPlan => ({
  ...plan,
  hazardsPerKilometre: 0,
  trafficPerKilometre: 0,
});

export const aloneRace = (track: Track, on: BikeSpec = bike): RaceState => {
  const setup = defaultSetup(track, RIDE_SEED);
  return createRace({
    ...setup,
    player: { ...setup.player, bike: on, controller: "human" },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

export const playerOf = (state: RaceState): RiderState => {
  const rider = riderOf(state.riders, PLAYER_RIDER);
  if (!rider) {
    throw new Error("The race has no player.");
  }
  return rider;
};

export const frameFor = (input: Readonly<RiderInput>): InputFrame => ({
  controls: new Map([[PLAYER_RIDER, controlOf(input)]]),
  handovers: new Map(),
});

export type Pedals = (state: RaceState, track: Track) => RiderInput;

const pedals = (throttle: number, brake: number): RiderInput => ({
  brake,
  kick: false,
  punch: false,
  steer: 0,
  throttle,
});

export const flatOut: Pedals = () => pedals(1, 0);

const shadowPlan = (state: RaceState, track: Track): RiderInput => {
  const shadow = structuredClone(state);
  playerOf(shadow).controller = "pilot";
  stepRace(shadow, track, emptyFrame);
  state.pilot.braked.set(shadow.pilot.braked);
  state.pilot.courseLimit.set(shadow.pilot.courseLimit);
  state.pilot.coursePush.set(shadow.pilot.coursePush);
  state.pilot.courseTravelled.set(shadow.pilot.courseTravelled);
  state.dice = shadow.dice;
  return { ...playerOf(shadow).input };
};

export const pilotPedals: Pedals = (state, track) => {
  const planned = shadowPlan(state, track);
  return pedals(planned.throttle, planned.brake);
};

export const shadowDivergence = (track: Track, ticks: number): number => {
  const piloted = aloneRace(track);
  playerOf(piloted).controller = "pilot";
  const shadowed = aloneRace(track);
  let worst = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    stepRace(piloted, track, emptyFrame);
    stepRace(shadowed, track, frameFor(shadowPlan(shadowed, track)));
    const real = playerOf(piloted);
    const fed = playerOf(shadowed);
    worst = Math.max(worst, Math.abs(real.x - fed.x), Math.abs(real.s - fed.s));
  }
  return worst;
};
