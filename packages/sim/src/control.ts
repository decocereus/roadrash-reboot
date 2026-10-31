import { clamp } from "./state.ts";
import type { Control, RiderInput } from "./state.ts";

export const CONTROL_BYTES = 4;

const BYTE = 256;
const STEER_STEPS = 127;
const PEDAL_STEPS = 255;
const UNUSED_STEER = 128;
const THROTTLE_PLACE = BYTE;
const BRAKE_PLACE = BYTE * BYTE;
const BUTTONS_PLACE = BYTE * BYTE * BYTE;
const PUNCH = 1;
const KICK = 2;
const BUTTONS = PUNCH + KICK;

const isControl = (word: number): word is Control =>
  Number.isSafeInteger(word) &&
  word >= 0 &&
  word % BYTE !== UNUSED_STEER &&
  Math.floor(word / BUTTONS_PLACE) <= BUTTONS;

const steerByteOf = (steer: number): number => {
  const step =
    Math.sign(steer) * Math.round(Math.abs(clamp(steer, -1, 1)) * STEER_STEPS);
  return step < 0 ? step + BYTE : step;
};

const pedalByteOf = (pedal: number): number =>
  Math.round(clamp(pedal, 0, 1) * PEDAL_STEPS);

const refuse = (input: Readonly<RiderInput>): never => {
  throw new RangeError(
    `A control needs finite steer, throttle and brake, not ${input.steer}, ${input.throttle} and ${input.brake}.`
  );
};

export const controlOf = (input: Readonly<RiderInput>): Control => {
  const word =
    steerByteOf(input.steer) +
    pedalByteOf(input.throttle) * THROTTLE_PLACE +
    pedalByteOf(input.brake) * BRAKE_PLACE +
    ((input.punch ? PUNCH : 0) + (input.kick ? KICK : 0)) * BUTTONS_PLACE;
  return isControl(word) ? word : refuse(input);
};

export const applyControl = (control: Control, input: RiderInput): void => {
  const steer = control % BYTE;
  input.steer = (steer > UNUSED_STEER ? steer - BYTE : steer) / STEER_STEPS;
  input.throttle = (Math.floor(control / THROTTLE_PLACE) % BYTE) / PEDAL_STEPS;
  input.brake = (Math.floor(control / BRAKE_PLACE) % BYTE) / PEDAL_STEPS;
  const buttons = Math.floor(control / BUTTONS_PLACE);
  input.punch = buttons % KICK === PUNCH;
  input.kick = buttons >= KICK;
};

export const writeControl = (
  view: DataView,
  offset: number,
  control: Control
): void => {
  view.setUint32(offset, control, true);
};

export const readControl = (
  view: DataView,
  offset: number
): Control | undefined => {
  const word = view.getUint32(offset, true);
  return isControl(word) ? word : undefined;
};
