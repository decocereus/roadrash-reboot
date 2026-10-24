import type { BikeId } from "@racer/sim/bikes";
import type { RivalId } from "@racer/sim/cast";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import { frameOf, scripted } from "@racer/sim/race-fixtures";
import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import type {
  InputFrame,
  RaceState,
  RiderId,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import { eased } from "@racer/track/alignment";
import { compileTrack } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";

import { recordedRules } from "./bench.ts";
import { setupFor } from "./field.ts";
import type { CareerRaceSetup } from "./field.ts";
import { createRaceLog, outcomeOf, recordTick } from "./outcome.ts";
import type { RaceLog } from "./outcome.ts";
import { levelsOf } from "./rules.ts";
import type { RaceRules } from "./rules.ts";
import { quitRace, settleRace, startRace } from "./settle.ts";
import type { Ledger, Settlement } from "./settle.ts";
import { buyBike } from "./shop.ts";
import { newCareer } from "./state.ts";
import type { CareerState } from "./state.ts";
import { roadList } from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

export const TICKS = 60;

export const road = compileTrack({
  ...ridgeRoad,
  features: [],
  pieces: eased([[9000, 0, 0]]),
  trafficPerKilometre: 0,
});

export const flatOut: RiderInput = { ...neutralInput, throttle: 1 };

export interface Entered {
  readonly rules: RaceRules;
  readonly career: CareerState;
  readonly setup: CareerRaceSetup;
  readonly state: RaceState;
  readonly log: RaceLog;
}

export const enter = (
  career: CareerState,
  roadId: RoadId,
  seed = 7,
  rules = recordedRules
): Entered => {
  const start = startRace(rules, career, roadId, seed);
  if (!start.started) {
    throw new Error(`The race did not start: ${start.reason}.`);
  }
  const setup = setupFor(rules, start.career, roadId, seed, road);
  return {
    career: start.career,
    log: createRaceLog(setup),
    rules,
    setup,
    state: scripted(createRace(setup)),
  };
};

const riderIdOf = (race: Entered, racer: RivalId | "player"): RiderId => {
  if (racer === "player") {
    return PLAYER_RIDER;
  }
  const entrant = race.log.entrants.find((each) => each.rival === racer);
  if (!entrant) {
    throw new Error(`${racer} is not in this race.`);
  }
  return entrant.rider;
};

export const racerIn = (
  race: Entered,
  racer: RivalId | "player"
): RiderState => {
  const rider = riderOf(race.state.riders, riderIdOf(race, racer));
  if (!rider) {
    throw new Error(`${racer} is not in this race.`);
  }
  return rider;
};

const copIn = (race: Entered): RiderState => {
  const cop = race.state.riders.find(
    (rider) => rider.profile.role === "police"
  );
  if (!cop) {
    throw new Error("The race has no cop.");
  }
  return cop;
};

export const ride = (
  race: Entered,
  seconds: number,
  framesAt: (tick: number) => InputFrame
): void => {
  for (let tick = 0; tick < seconds * TICKS && !race.log.outcome; tick += 1) {
    stepRace(race.state, road, framesAt(tick));
    recordTick(race.log, race.state, race.setup);
  }
};

export const everyRider = (race: Entered, input: RiderInput): InputFrame =>
  frameOf(
    race.state,
    ...race.state.riders.map((rider) => [rider.id, input] as const)
  );

export const settle = (race: Entered): Settlement =>
  settleRace(
    race.rules,
    race.career,
    outcomeOf(race.state, race.setup, race.log)
  );

export const ledgerOf = (settlement: Settlement): Ledger => {
  if (!settlement.ledger) {
    throw new Error("The race did not settle.");
  }
  return settlement.ledger;
};

export const sprint = (
  race: Entered,
  place: number,
  leaders: readonly RivalId[] = [],
  playerGap = 240
): void => {
  const order = [
    ...leaders,
    ...race.setup.field.filter((rival) => !leaders.includes(rival)),
  ];
  const controls: (readonly [RiderId, RiderInput])[] = [
    [PLAYER_RIDER, flatOut],
  ];
  for (const [slot, rival] of order.entries()) {
    const rider = racerIn(race, rival);
    const ahead = slot < place - 1;
    rider.s = ahead ? road.length - 40 - slot * 12 : 100 + slot * 10;
    rider.speed = ahead ? 40 : 0;
    controls.push([rider.id, ahead ? flatOut : neutralInput]);
  }
  const player = racerIn(race, "player");
  player.s = road.length - playerGap;
  player.speed = 40;
  const frame = frameOf(race.state, ...controls);
  ride(race, 30, () => frame);
};

export const crashOut = (race: Entered): void => {
  const player = racerIn(race, "player");
  player.s = 300;
  player.speed = 30;
  player.condition = 1;
  const frame = frameOf(race.state, [
    PLAYER_RIDER,
    { ...flatOut, steer: 1, throttle: 0.5 },
  ]);
  ride(race, 20, () => frame);
};

export const getArrested = (
  race: Entered,
  racer: RivalId | "player" = "player"
) => {
  const cop = copIn(race);
  const arrested = racerIn(race, racer);
  cop.parked = false;
  cop.s = 150;
  cop.x = road.plan.laneWidth / 2;
  cop.speed = 22;
  arrested.s = 200;
  arrested.speed = 15;
  const still = frameOf(race.state);
  ride(race, 1 / TICKS, () => still);
  arrested.stamina = 0;
  cop.controller = "pilot";
  const chased = frameOf(race.state);
  for (
    let tick = 0;
    tick < 30 * TICKS && arrested.mode !== "busted";
    tick += 1
  ) {
    ride(race, 1 / TICKS, () => chased);
  }
  cop.controller = "human";
  cop.parked = true;
  cop.speed = 0;
  cop.s = road.length / 2;
  cop.x = road.roadHalfWidth + 1.1;
};

export const idle: RiderInput = { ...neutralInput, throttle: 0.5 };

export const knockDown = (
  race: Entered,
  rival: RivalId,
  times: number
): void => {
  const me = racerIn(race, "player");
  const them = racerIn(race, rival);
  const beyond = 400 + race.setup.field.indexOf(rival) + 1;
  for (const other of race.setup.field) {
    racerIn(race, other).s = other === rival ? 50 : beyond;
  }
  me.s = 50;
  me.speed = 30;
  them.speed = 30;
  let downs = 0;
  let wasRiding = false;
  for (let tick = 0; tick < 60 * TICKS && downs < times; tick += 1) {
    const riding = them.mode === "riding";
    if (riding) {
      them.stamina = wasRiding ? them.stamina : 10;
      them.x = 1.8;
      them.s = me.s;
      me.x = 0.3;
    }
    downs += wasRiding && !riding ? 1 : 0;
    wasRiding = riding;
    them.controller = riding ? "human" : "pilot";
    const punch: readonly [RiderId, RiderInput] = [
      me.id,
      { ...idle, punch: riding && tick % 40 === 0 },
    ];
    stepRace(
      race.state,
      road,
      riding
        ? frameOf(race.state, punch, [them.id, idle])
        : frameOf(race.state, punch)
    );
    recordTick(race.log, race.state, race.setup);
  }
  them.controller = "human";
};

export const rivalIn = (setup: CareerRaceSetup, rival: RivalId) =>
  setup.rivals[setup.field.indexOf(rival)];

export const takeWeaponFrom = (race: Entered, rival: RivalId): void => {
  const me = racerIn(race, "player");
  const them = racerIn(race, rival);
  for (const other of race.setup.field) {
    racerIn(race, other).s = 400;
  }
  me.s = 50;
  me.speed = 30;
  them.speed = 30;
  for (let tick = 0; tick < TICKS; tick += 1) {
    me.x = 0.3;
    them.x = 1.8;
    them.s = me.s;
    stepRace(
      race.state,
      road,
      frameOf(
        race.state,
        [me.id, { ...idle, kick: tick === 0 }],
        [them.id, idle]
      )
    );
    recordTick(race.log, race.state, race.setup);
  }
};

type Step =
  | { readonly roadId: RoadId; readonly place: number }
  | { readonly roadId: RoadId; readonly ends: "busted" | "wrecked" };

export const play = (
  career: CareerState,
  step: Step,
  seed = 7,
  rules = recordedRules
): Settlement => {
  const race = enter(career, step.roadId, seed, rules);
  if ("place" in step) {
    sprint(race, step.place);
  } else if (step.ends === "busted") {
    getArrested(race);
  } else {
    crashOut(race);
  }
  return settle(race);
};

export const playAll = (
  career: CareerState,
  steps: readonly Step[],
  rules = recordedRules
): CareerState => {
  let current = career;
  for (const [index, step] of steps.entries()) {
    current = play(current, step, index + 1, rules).career;
  }
  return current;
};

export const decentSeason: readonly Step[] = [
  { place: 3, roadId: "slag-row" },
  { place: 4, roadId: "breakwater-run" },
  { place: 3, roadId: "breakwater-run" },
  { ends: "busted", roadId: "hollow-pine-road" },
  { place: 3, roadId: "hollow-pine-road" },
  { ends: "wrecked", roadId: "cinder-wash" },
  { place: 2, roadId: "cinder-wash" },
  { place: 3, roadId: "ridge-road" },
];

export const weakSeason: readonly Step[] = [
  { ends: "wrecked", roadId: "slag-row" },
  { ends: "wrecked", roadId: "slag-row" },
  ...roadList.flatMap((entry): Step[] => [
    { place: 7, roadId: entry.id },
    { place: 3, roadId: entry.id },
  ]),
];

export interface Season {
  readonly level: Level;
  readonly start: CareerState;
  readonly end: CareerState;
}

export const seasonsOf = (
  steps: readonly Step[],
  purchases: readonly BikeId[],
  rules = recordedRules
): readonly Season[] => {
  const seasons: Season[] = [];
  let career = newCareer(11);
  for (const level of levelsOf(rules)) {
    const end = playAll(career, steps, rules);
    seasons.push({ end, level, start: career });
    const next = purchases[level - 1];
    career = next ? buyBike(rules, end, next) : end;
  }
  return seasons;
};

export const decent = seasonsOf(decentSeason, [
  "halden-kite-500",
  "ostra-sesta-600",
  "ostra-sette-750",
  "halden-meridian-900",
]);

export const weak = seasonsOf(weakSeason, [
  "halden-kite-500",
  "ostra-sesta-600",
  "ostra-sette-750",
]);

export const seasonAt = (seasons: readonly Season[], level: Level): Season => {
  const season = seasons[level - 1];
  if (!season) {
    throw new Error(`No season at level ${level}.`);
  }
  return season;
};

export const wreckTimes = (
  career: CareerState,
  times: number
): Settlement[] => {
  const settlements: Settlement[] = [];
  let current = career;
  for (let wreck = 0; wreck < times; wreck += 1) {
    const race = enter(current, "slag-row", wreck + 1);
    const settlement = quitRace(
      race.rules,
      race.career,
      outcomeOf(race.state, race.setup, race.log)
    );
    settlements.push(settlement);
    current = settlement.career;
  }
  return settlements;
};

export const lastOf = (settlements: readonly Settlement[]): Settlement => {
  const last = settlements.at(-1);
  if (!last) {
    throw new Error("Nothing was settled.");
  }
  return last;
};
