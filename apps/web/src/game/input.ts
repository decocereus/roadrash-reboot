import type { RiderInput } from "@racer/sim/state";

const STEER_ATTACK = 9;
const STEER_RELEASE = 18;
const STICK_DEADZONE = 0.12;

const handled = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "Space",
  "KeyJ",
  "KeyK",
  "ShiftLeft",
  "ShiftRight",
]);

const nextSteer = (
  current: number,
  stick: number,
  keys: number,
  seconds: number
): number => {
  if (Math.abs(stick) > STICK_DEADZONE) {
    return stick;
  }
  const rate = keys === 0 ? STEER_RELEASE : STEER_ATTACK;
  const step = rate * seconds;
  if (current < keys) {
    return Math.min(keys, current + step);
  }
  return Math.max(keys, current - step);
};

export interface Controls {
  read: (seconds: number, input: RiderInput) => void;
  dispose: () => void;
}

export function createControls(onCommand: (code: string) => void): Controls {
  const held = new Set<string>();
  let steer = 0;

  const press = (event: KeyboardEvent) => {
    if (handled.has(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) {
      held.add(event.code);
      onCommand(event.code);
    }
  };
  const release = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  const clear = () => {
    held.clear();
  };
  window.addEventListener("keydown", press);
  window.addEventListener("keyup", release);
  window.addEventListener("blur", clear);

  const down = (...codes: string[]): boolean =>
    codes.some((code) => held.has(code));
  const keySteer = (): number =>
    (down("ArrowRight", "KeyD") ? 1 : 0) - (down("ArrowLeft", "KeyA") ? 1 : 0);

  return {
    dispose() {
      window.removeEventListener("keydown", press);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", clear);
    },
    read(seconds, input) {
      const pad = navigator
        .getGamepads()
        .find((each) => each?.connected === true);
      steer = nextSteer(steer, pad?.axes[0] ?? 0, keySteer(), seconds);
      input.steer = steer;
      input.throttle = Math.max(
        down("ArrowUp", "KeyW") ? 1 : 0,
        pad?.buttons[7]?.value ?? 0
      );
      input.brake = Math.max(
        down("ArrowDown", "KeyS") ? 1 : 0,
        pad?.buttons[6]?.value ?? 0
      );
      input.punch =
        down("Space", "KeyJ") || (pad?.buttons[2]?.pressed ?? false);
      input.kick =
        down("KeyK", "ShiftLeft", "ShiftRight") ||
        (pad?.buttons[1]?.pressed ?? false);
    },
  };
}
