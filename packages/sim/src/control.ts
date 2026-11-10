import { approach, clamp, TICK_SECONDS } from "./state.ts";
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
const REMOUNT = 4;
const BUTTONS = PUNCH + KICK + REMOUNT;
const STICK = 8;

export const steerSources = ["keys", "stick"] as const;

export type SteerSource = (typeof steerSources)[number];

const isControl = (word: number): word is Control =>
  Number.isSafeInteger(word) &&
  word >= 0 &&
  word % BYTE !== UNUSED_STEER &&
  Math.floor(word / BUTTONS_PLACE) <= BUTTONS + STICK;

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

const finite = (input: Readonly<RiderInput>): boolean =>
  Number.isFinite(input.steer) &&
  Number.isFinite(input.throttle) &&
  Number.isFinite(input.brake);

export const controlOf = (
  input: Readonly<RiderInput>,
  steerFrom: SteerSource = "keys"
): Control => {
  const word =
    steerByteOf(input.steer) +
    pedalByteOf(input.throttle) * THROTTLE_PLACE +
    pedalByteOf(input.brake) * BRAKE_PLACE +
    ((input.punch ? PUNCH : 0) +
      (input.kick ? KICK : 0) +
      (input.remount ? REMOUNT : 0) +
      (steerFrom === "stick" ? STICK : 0)) *
      BUTTONS_PLACE;
  return finite(input) && isControl(word) ? word : refuse(input);
};

const STEER_ATTACK = 9;
const STEER_RELEASE = 18;

const steerToward = (steer: number, target: number): number =>
  approach(
    steer,
    target,
    (target === 0 ? STEER_RELEASE : STEER_ATTACK) * TICK_SECONDS
  );

export const applyControl = (control: Control, input: RiderInput): void => {
  const steer = control % BYTE;
  const target = (steer > UNUSED_STEER ? steer - BYTE : steer) / STEER_STEPS;
  const buttons = Math.floor(control / BUTTONS_PLACE);
  input.steer = buttons >= STICK ? target : steerToward(input.steer, target);
  input.throttle = (Math.floor(control / THROTTLE_PLACE) % BYTE) / PEDAL_STEPS;
  input.brake = (Math.floor(control / BRAKE_PLACE) % BYTE) / PEDAL_STEPS;
  input.punch = buttons % KICK === PUNCH;
  input.kick = buttons % REMOUNT >= KICK;
  input.remount = buttons % STICK >= REMOUNT;
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

export const coasting: Control = controlOf({
  brake: 0,
  kick: false,
  punch: false,
  remount: false,
  steer: 0,
  throttle: 0,
});

export const withoutButtons = (control: Control): Control => {
  const buttons = Math.floor(control / BUTTONS_PLACE);
  const movement = control - (buttons % STICK) * BUTTONS_PLACE;
  return isControl(movement) ? movement : coasting;
};

export const BUTTONS_OF_A_CONTROL = [PUNCH, KICK, REMOUNT] as const;
export type Button = (typeof BUTTONS_OF_A_CONTROL)[number];

export const startsAStrike = (button: Button): boolean => button !== REMOUNT;

export const holds = (control: Control, button: Button): boolean =>
  Math.floor(control / BUTTONS_PLACE / button) % 2 === 1;

export const pressing = (control: Control, button: Button): Control => {
  const pressed = control + button * BUTTONS_PLACE;
  return holds(control, button) || !isControl(pressed) ? control : pressed;
};
