import { hazardKinds } from "@racer/track/hazards";

import { CORNER_SCAN_POINTS, FORECAST_TICKS } from "./pilot-history.ts";
import type { RaceView, RiderView, TrafficView } from "./race-view.ts";
import { HASH_WORDS, WORD_BYTES } from "./snapshot-bytes.ts";
import { eventsAt } from "./snapshot-events.ts";
import {
  blockAt,
  choiceAt,
  flagAt,
  filledListAt,
  floatAt,
  floatsAt,
  listAt,
  recordAt,
  riderRefAt,
  schemaOf,
  textAt,
  textOrNoneAt,
} from "./snapshot-members.ts";
import { attackStates, controllers, riderModes, weaponKinds } from "./state.ts";
import type {
  Hazard,
  PilotHistory,
  RaceState,
  RiderInput,
  RiderState,
  TrafficCar,
} from "./state.ts";

export const SNAPSHOT_FORMAT = 1;

const TICK_BYTES = 8;

export const FORMAT_WORD_AT = 0;
export const LENGTH_WORD_AT = FORMAT_WORD_AT + WORD_BYTES;
export const DIGEST_WORD_AT = LENGTH_WORD_AT + WORD_BYTES;
export const TICK_AT = DIGEST_WORD_AT + HASH_WORDS * WORD_BYTES;

export const HEADER_BYTES = TICK_AT + TICK_BYTES;

export type RiderSetupKey =
  | "aggressionBoost"
  | "bike"
  | "grudge"
  | "id"
  | "profile";

export type CarSetupKey =
  | "cruiseSpeed"
  | "halfLength"
  | "halfWidth"
  | "height"
  | "paint"
  | "x";

export type RaceHeaderKey = "tick";

export type RaceSetupKey = "pacing" | "police";

const inputSchema = schemaOf<Readonly<RiderInput>, RiderInput>({
  brake: floatAt("brake"),
  kick: flagAt("kick"),
  punch: flagAt("punch"),
  steer: floatAt("steer"),
  throttle: floatAt("throttle"),
});

const pilotSchema = schemaOf<RaceView["pilot"], PilotHistory>({
  braked: blockAt("braked", CORNER_SCAN_POINTS),
  courseLimit: blockAt("courseLimit", FORECAST_TICKS),
  coursePush: blockAt("coursePush", FORECAST_TICKS),
  courseTravelled: blockAt("courseTravelled", FORECAST_TICKS),
});

const hazardSchema = schemaOf<Hazard, Hazard>({
  command: textOrNoneAt("command"),
  halfLength: floatAt("halfLength"),
  halfWidth: floatAt("halfWidth"),
  height: floatAt("height"),
  id: textAt("id"),
  kind: choiceAt("kind", hazardKinds),
  s: floatAt("s"),
  spawnTick: floatAt("spawnTick"),
  x: floatAt("x"),
});

const blankHazard = (): Hazard => ({
  command: null,
  halfLength: 0,
  halfWidth: 0,
  height: 0,
  id: "",
  kind: hazardKinds[0],
  s: 0,
  spawnTick: 0,
  x: 0,
});

const carSchema = schemaOf<
  Omit<TrafficView, CarSetupKey>,
  Omit<TrafficCar, CarSetupKey>
>({
  s: floatAt("s"),
  speed: floatAt("speed"),
});

const riderSchema = schemaOf<
  Omit<RiderView, RiderSetupKey>,
  Omit<RiderState, RiderSetupKey>
>({
  air: floatAt("air"),
  airTicks: floatAt("airTicks"),
  airborne: flagAt("airborne"),
  attack: choiceAt("attack", attackStates),
  attackCooldown: floatAt("attackCooldown"),
  attackSide: floatAt("attackSide"),
  attackTicks: floatAt("attackTicks"),
  bodyAir: floatAt("bodyAir"),
  bodyLateralSpeed: floatAt("bodyLateralSpeed"),
  bodyS: floatAt("bodyS"),
  bodySpeed: floatAt("bodySpeed"),
  bodyVerticalSpeed: floatAt("bodyVerticalSpeed"),
  bodyX: floatAt("bodyX"),
  brake: floatAt("brake"),
  bumpLoss: floatAt("bumpLoss"),
  bumpedBy: floatAt("bumpedBy"),
  chase: riderRefAt("chase"),
  condition: floatAt("condition"),
  controller: choiceAt("controller", controllers),
  crashes: floatAt("crashes"),
  finishTick: floatAt("finishTick"),
  gear: floatAt("gear"),
  hazardContacts: floatsAt("hazardContacts"),
  hazardMissed: flagAt("hazardMissed"),
  hazardSeen: floatAt("hazardSeen"),
  heading: floatAt("heading"),
  hitStun: floatAt("hitStun"),
  idleTicks: floatAt("idleTicks"),
  input: recordAt("input", inputSchema),
  jumpMisread: flagAt("jumpMisread"),
  jumpSeen: floatAt("jumpSeen"),
  lastHitBy: riderRefAt("lastHitBy"),
  lastHitTick: floatAt("lastHitTick"),
  lateralSpeed: floatAt("lateralSpeed"),
  lean: floatAt("lean"),
  load: floatAt("load"),
  mode: choiceAt("mode", riderModes),
  modeTicks: floatAt("modeTicks"),
  offRoad: flagAt("offRoad"),
  parked: flagAt("parked"),
  pilotLine: floatAt("pilotLine"),
  post: floatAt("post"),
  revs: floatAt("revs"),
  s: floatAt("s"),
  shiftTicks: floatAt("shiftTicks"),
  slip: floatAt("slip"),
  slipFrom: floatAt("slipFrom"),
  slipTicks: floatAt("slipTicks"),
  speed: floatAt("speed"),
  staleBrake: flagAt("staleBrake"),
  staleSteer: flagAt("staleSteer"),
  staleThrottle: flagAt("staleThrottle"),
  stamina: floatAt("stamina"),
  throttle: floatAt("throttle"),
  tuck: floatAt("tuck"),
  tuckTicks: floatAt("tuckTicks"),
  verticalSpeed: floatAt("verticalSpeed"),
  weapon: choiceAt("weapon", weaponKinds),
  weaponAtThrow: choiceAt("weaponAtThrow", weaponKinds),
  weaponHits: floatAt("weaponHits"),
  wobble: floatAt("wobble"),
  x: floatAt("x"),
});

export const raceSchema = schemaOf<
  Omit<RaceView, RaceHeaderKey | RaceSetupKey>,
  Omit<RaceState, RaceHeaderKey | RaceSetupKey>
>({
  cars: listAt("cars", carSchema),
  dice: floatAt("dice"),
  events: eventsAt("events"),
  hazardDice: floatAt("hazardDice"),
  hazards: filledListAt("hazards", hazardSchema, blankHazard),
  pilot: recordAt("pilot", pilotSchema),
  riders: listAt("riders", riderSchema),
});
