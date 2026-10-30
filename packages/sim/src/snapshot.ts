import { hazardKinds } from "@racer/track/hazards";

import type { RaceView, RiderView, TrafficView } from "./race-view.ts";
import { createRace } from "./race.ts";
import {
  cursor,
  floatListBytes,
  putChoice,
  putCount,
  putFlag,
  putFloat,
  putRiderRef,
  putText,
  putTextOrNone,
  refuse,
  takeChoice,
  takeCount,
  takeFlag,
  takeFloat,
  takeRiderRef,
  takeText,
  takeTextOrNone,
  textBytes,
  textMatches,
  textOrNoneBytes,
  textOrNoneMatches,
} from "./snapshot-bytes.ts";
import { eventBytes, putEvents, takeEvents } from "./snapshot-events.ts";
import {
  carFields,
  COUNT_BYTES,
  FORMAT_WORD_AT,
  HASH_WORDS,
  hazardFields,
  HEADER_BYTES,
  LENGTH_WORD_AT,
  DIGEST_WORD_AT,
  raceFields,
  riderFields,
  SNAPSHOT_FORMAT,
  TICK_AT,
  fixedBytesOf,
} from "./snapshot-format.ts";
import { hashBytes } from "./snapshot-hash.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { attackStates, controllers, riderModes, weaponKinds } from "./state.ts";
import type {
  Hazard,
  PilotHistory,
  RaceSetup,
  RaceState,
  RiderInput,
  RiderState,
  TrafficCar,
} from "./state.ts";

const RACE_FIXED_BYTES = fixedBytesOf(raceFields);
const RIDER_FIXED_BYTES = fixedBytesOf(riderFields);
const CAR_FIXED_BYTES = fixedBytesOf(carFields);
const HAZARD_FIXED_BYTES = fixedBytesOf(hazardFields);
const WORD_BYTES = 4;

const takeSame = (from: DataView, live: number, what: string): void => {
  const count = takeCount(from);
  if (count !== live) {
    refuse(`This snapshot holds ${count} ${what} and the race has ${live}.`);
  }
};

const hazardBytes = (hazard: Hazard): number =>
  HAZARD_FIXED_BYTES + textBytes(hazard.id) + textOrNoneBytes(hazard.command);

export const snapshotCapacity = (state: RaceView): number => {
  let total = HEADER_BYTES + RACE_FIXED_BYTES + 4 * COUNT_BYTES;
  total += state.cars.length * CAR_FIXED_BYTES;
  for (const rider of state.riders) {
    total += RIDER_FIXED_BYTES + floatListBytes(rider.hazardContacts);
  }
  for (const hazard of state.hazards) {
    total += hazardBytes(hazard);
  }
  for (const event of state.events) {
    total += eventBytes(event);
  }
  return total;
};

interface FloatRun {
  readonly length: number;
  readonly [index: number]: number;
}

const putBlock = (out: DataView, block: FloatRun): void => {
  let index = 0;
  while (index < block.length) {
    putFloat(out, block[index] ?? 0);
    index += 1;
  }
};

const takeBlock = (from: DataView, block: Float64Array): void => {
  let index = 0;
  while (index < block.length) {
    block[index] = takeFloat(from);
    index += 1;
  }
};

const putPilot = (out: DataView, pilot: RaceView["pilot"]): void => {
  putBlock(out, pilot.braked);
  putBlock(out, pilot.courseLimit);
  putBlock(out, pilot.coursePush);
  putBlock(out, pilot.courseTravelled);
};

const takePilot = (from: DataView, pilot: PilotHistory): void => {
  takeBlock(from, pilot.braked);
  takeBlock(from, pilot.courseLimit);
  takeBlock(from, pilot.coursePush);
  takeBlock(from, pilot.courseTravelled);
};

const putInput = (
  out: DataView,
  input: RaceView["riders"][number]["input"]
): void => {
  putFloat(out, input.brake);
  putFlag(out, input.kick);
  putFlag(out, input.punch);
  putFloat(out, input.steer);
  putFloat(out, input.throttle);
};

const takeInput = (from: DataView, input: RiderInput): void => {
  input.brake = takeFloat(from);
  input.kick = takeFlag(from);
  input.punch = takeFlag(from);
  input.steer = takeFloat(from);
  input.throttle = takeFloat(from);
};

const putRider = (out: DataView, rider: RiderView): void => {
  putFloat(out, rider.air);
  putFloat(out, rider.airTicks);
  putFlag(out, rider.airborne);
  putChoice(out, attackStates, rider.attack);
  putFloat(out, rider.attackCooldown);
  putFloat(out, rider.attackSide);
  putFloat(out, rider.attackTicks);
  putFloat(out, rider.bodyAir);
  putFloat(out, rider.bodyLateralSpeed);
  putFloat(out, rider.bodyS);
  putFloat(out, rider.bodySpeed);
  putFloat(out, rider.bodyVerticalSpeed);
  putFloat(out, rider.bodyX);
  putFloat(out, rider.brake);
  putFloat(out, rider.bumpLoss);
  putFloat(out, rider.bumpedBy);
  putRiderRef(out, rider.chase);
  putFloat(out, rider.condition);
  putChoice(out, controllers, rider.controller);
  putFloat(out, rider.crashes);
  putFloat(out, rider.finishTick);
  putFloat(out, rider.gear);
  putCount(out, rider.hazardContacts.length);
  putBlock(out, rider.hazardContacts);
  putFlag(out, rider.hazardMissed);
  putFloat(out, rider.hazardSeen);
  putFloat(out, rider.heading);
  putFloat(out, rider.hitStun);
  putFloat(out, rider.idleTicks);
  putInput(out, rider.input);
  putFlag(out, rider.jumpMisread);
  putFloat(out, rider.jumpSeen);
  putRiderRef(out, rider.lastHitBy);
  putFloat(out, rider.lastHitTick);
  putFloat(out, rider.lateralSpeed);
  putFloat(out, rider.lean);
  putFloat(out, rider.load);
  putChoice(out, riderModes, rider.mode);
  putFloat(out, rider.modeTicks);
  putFlag(out, rider.offRoad);
  putFlag(out, rider.parked);
  putFloat(out, rider.pilotLine);
  putFloat(out, rider.post);
  putFloat(out, rider.revs);
  putFloat(out, rider.s);
  putFloat(out, rider.shiftTicks);
  putFloat(out, rider.slip);
  putFloat(out, rider.slipFrom);
  putFloat(out, rider.slipTicks);
  putFloat(out, rider.speed);
  putFlag(out, rider.staleBrake);
  putFlag(out, rider.staleSteer);
  putFlag(out, rider.staleThrottle);
  putFloat(out, rider.stamina);
  putFloat(out, rider.throttle);
  putFloat(out, rider.tuck);
  putFloat(out, rider.tuckTicks);
  putFloat(out, rider.verticalSpeed);
  putChoice(out, weaponKinds, rider.weapon);
  putChoice(out, weaponKinds, rider.weaponAtThrow);
  putFloat(out, rider.weaponHits);
  putFloat(out, rider.wobble);
  putFloat(out, rider.x);
};

const takeRider = (from: DataView, rider: RiderState): void => {
  rider.air = takeFloat(from);
  rider.airTicks = takeFloat(from);
  rider.airborne = takeFlag(from);
  rider.attack = takeChoice(from, attackStates);
  rider.attackCooldown = takeFloat(from);
  rider.attackSide = takeFloat(from);
  rider.attackTicks = takeFloat(from);
  rider.bodyAir = takeFloat(from);
  rider.bodyLateralSpeed = takeFloat(from);
  rider.bodyS = takeFloat(from);
  rider.bodySpeed = takeFloat(from);
  rider.bodyVerticalSpeed = takeFloat(from);
  rider.bodyX = takeFloat(from);
  rider.brake = takeFloat(from);
  rider.bumpLoss = takeFloat(from);
  rider.bumpedBy = takeFloat(from);
  rider.chase = takeRiderRef(from);
  rider.condition = takeFloat(from);
  rider.controller = takeChoice(from, controllers);
  rider.crashes = takeFloat(from);
  rider.finishTick = takeFloat(from);
  rider.gear = takeFloat(from);
  const contacts = takeCount(from);
  rider.hazardContacts.length = contacts;
  for (let index = 0; index < contacts; index += 1) {
    rider.hazardContacts[index] = takeFloat(from);
  }
  rider.hazardMissed = takeFlag(from);
  rider.hazardSeen = takeFloat(from);
  rider.heading = takeFloat(from);
  rider.hitStun = takeFloat(from);
  rider.idleTicks = takeFloat(from);
  takeInput(from, rider.input);
  rider.jumpMisread = takeFlag(from);
  rider.jumpSeen = takeFloat(from);
  rider.lastHitBy = takeRiderRef(from);
  rider.lastHitTick = takeFloat(from);
  rider.lateralSpeed = takeFloat(from);
  rider.lean = takeFloat(from);
  rider.load = takeFloat(from);
  rider.mode = takeChoice(from, riderModes);
  rider.modeTicks = takeFloat(from);
  rider.offRoad = takeFlag(from);
  rider.parked = takeFlag(from);
  rider.pilotLine = takeFloat(from);
  rider.post = takeFloat(from);
  rider.revs = takeFloat(from);
  rider.s = takeFloat(from);
  rider.shiftTicks = takeFloat(from);
  rider.slip = takeFloat(from);
  rider.slipFrom = takeFloat(from);
  rider.slipTicks = takeFloat(from);
  rider.speed = takeFloat(from);
  rider.staleBrake = takeFlag(from);
  rider.staleSteer = takeFlag(from);
  rider.staleThrottle = takeFlag(from);
  rider.stamina = takeFloat(from);
  rider.throttle = takeFloat(from);
  rider.tuck = takeFloat(from);
  rider.tuckTicks = takeFloat(from);
  rider.verticalSpeed = takeFloat(from);
  rider.weapon = takeChoice(from, weaponKinds);
  rider.weaponAtThrow = takeChoice(from, weaponKinds);
  rider.weaponHits = takeFloat(from);
  rider.wobble = takeFloat(from);
  rider.x = takeFloat(from);
};

const putCar = (out: DataView, car: TrafficView): void => {
  putFloat(out, car.s);
  putFloat(out, car.speed);
};

const takeCar = (from: DataView, car: TrafficCar): void => {
  car.s = takeFloat(from);
  car.speed = takeFloat(from);
};

const putHazard = (out: DataView, hazard: Hazard): void => {
  putTextOrNone(out, hazard.command);
  putText(out, hazard.id);
  putChoice(out, hazardKinds, hazard.kind);
  putFloat(out, hazard.halfLength);
  putFloat(out, hazard.halfWidth);
  putFloat(out, hazard.height);
  putFloat(out, hazard.s);
  putFloat(out, hazard.spawnTick);
  putFloat(out, hazard.x);
};

const takeHazard = (from: DataView): Hazard => {
  const command = takeTextOrNone(from);
  const id = takeText(from);
  const kind = takeChoice(from, hazardKinds);
  return {
    command,
    halfLength: takeFloat(from),
    halfWidth: takeFloat(from),
    height: takeFloat(from),
    id,
    kind,
    s: takeFloat(from),
    spawnTick: takeFloat(from),
    x: takeFloat(from),
  };
};

const hazardMatches = (from: DataView, live: Hazard): boolean => {
  let same = textOrNoneMatches(from, live.command);
  same = textMatches(from, live.id) && same;
  same = takeChoice(from, hazardKinds) === live.kind && same;
  same = takeFloat(from) === live.halfLength && same;
  same = takeFloat(from) === live.halfWidth && same;
  same = takeFloat(from) === live.height && same;
  same = takeFloat(from) === live.s && same;
  same = takeFloat(from) === live.spawnTick && same;
  same = takeFloat(from) === live.x && same;
  return same;
};

const takeHazards = (from: DataView, hazards: Hazard[]): void => {
  const count = takeCount(from);
  const started = cursor.byte;
  let same = count === hazards.length;
  for (let index = 0; same && index < count; index += 1) {
    const live = hazards[index];
    same = live !== undefined && hazardMatches(from, live);
  }
  if (same) {
    return;
  }
  cursor.byte = started;
  hazards.length = 0;
  for (let index = 0; index < count; index += 1) {
    hazards.push(takeHazard(from));
  }
};

export const writeSnapshot = (
  state: RaceView,
  digest: Uint32Array,
  out: DataView
): number => {
  const needed = snapshotCapacity(state);
  if (out.byteLength < needed) {
    refuse(
      `A snapshot of this race needs ${needed} bytes and the buffer holds ${out.byteLength}.`
    );
  }
  out.setUint32(FORMAT_WORD_AT, SNAPSHOT_FORMAT, true);
  out.setUint32(LENGTH_WORD_AT, needed, true);
  for (let word = 0; word < HASH_WORDS; word += 1) {
    out.setUint32(DIGEST_WORD_AT + word * WORD_BYTES, digest[word] ?? 0, true);
  }
  out.setFloat64(TICK_AT, state.tick, true);
  cursor.byte = HEADER_BYTES;
  putCount(out, state.cars.length);
  for (const car of state.cars) {
    putCar(out, car);
  }
  putFloat(out, state.dice);
  putEvents(out, state.events);
  putFloat(out, state.hazardDice);
  putCount(out, state.hazards.length);
  for (const hazard of state.hazards) {
    putHazard(out, hazard);
  }
  putPilot(out, state.pilot);
  putCount(out, state.riders.length);
  for (const rider of state.riders) {
    putRider(out, rider);
  }
  if (cursor.byte !== needed) {
    refuse(
      `A snapshot of this race measures ${needed} bytes and wrote ${cursor.byte}.`
    );
  }
  return needed;
};

const checkHeader = (
  state: RaceView,
  digest: Uint32Array,
  from: DataView
): number => {
  if (from.byteLength < HEADER_BYTES) {
    refuse(
      `A snapshot header is ${HEADER_BYTES} bytes and this buffer holds ${from.byteLength}.`
    );
  }
  const format = from.getUint32(FORMAT_WORD_AT, true);
  if (format !== SNAPSHOT_FORMAT) {
    refuse(
      `This snapshot is format ${format} and the race reads format ${SNAPSHOT_FORMAT}.`
    );
  }
  const length = from.getUint32(LENGTH_WORD_AT, true);
  if (from.byteLength < length) {
    refuse(
      `This snapshot is ${length} bytes and the buffer holds ${from.byteLength}.`
    );
  }
  for (let word = 0; word < HASH_WORDS; word += 1) {
    if (
      from.getUint32(DIGEST_WORD_AT + word * WORD_BYTES, true) !== digest[word]
    ) {
      refuse(
        "This snapshot was taken of another race setup, so it cannot be restored into this one."
      );
    }
  }
  if (state.riders.length === 0) {
    refuse("A race with no riders restores nothing.");
  }
  return length;
};

export const restoreInto = (
  state: RaceState,
  digest: Uint32Array,
  from: DataView
): void => {
  const length = checkHeader(state, digest, from);
  state.tick = from.getFloat64(TICK_AT, true);
  cursor.byte = HEADER_BYTES;
  takeSame(from, state.cars.length, "traffic cars");
  for (const car of state.cars) {
    takeCar(from, car);
  }
  state.dice = takeFloat(from);
  takeEvents(from, state.events);
  state.hazardDice = takeFloat(from);
  takeHazards(from, state.hazards);
  takePilot(from, state.pilot);
  takeSame(from, state.riders.length, "riders");
  for (const rider of state.riders) {
    takeRider(from, rider);
  }
  if (cursor.byte !== length) {
    refuse(
      `This snapshot is ${length} bytes and the race read ${cursor.byte}.`
    );
  }
};

export const restoreSnapshot = (
  setup: RaceSetup,
  from: DataView
): RaceState => {
  const state = createRace(setup);
  restoreInto(state, setupDigest(state, setup.track), from);
  return state;
};

export const hashRace = (
  state: RaceView,
  digest: Uint32Array,
  scratch: DataView,
  into: Uint32Array
): number => {
  const written = writeSnapshot(state, digest, scratch);
  hashBytes(scratch, 0, written, into);
  return written;
};
