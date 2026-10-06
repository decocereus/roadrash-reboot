import type { RiderInput } from "@racer/sim/state";

const STEER_ATTACK = 5.5;
const STEER_RELEASE = 9;
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
]);

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

  return {
    dispose() {
      window.removeEventListener("keydown", press);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", clear);
    },
    read(seconds, input) {
      const pad = navigator.getGamepads().find((each) => each?.connected);
      const stick = pad?.axes[0] ?? 0;
      const keys =
        (down("ArrowRight", "KeyD") ? 1 : 0) -
        (down("ArrowLeft", "KeyA") ? 1 : 0);
      if (Math.abs(stick) > STICK_DEADZONE) {
        steer = stick;
      } else {
        const rate = keys === 0 ? STEER_RELEASE : STEER_ATTACK;
        const step = rate * seconds;
        steer =
          steer < keys
            ? Math.min(keys, steer + step)
            : Math.max(keys, steer - step);
      }
      input.steer = steer;
      input.throttle = Math.max(
        down("ArrowUp", "KeyW") ? 1 : 0,
        pad?.buttons[7]?.value ?? 0
      );
      input.brake = Math.max(
        down("ArrowDown", "KeyS", "Space") ? 1 : 0,
        pad?.buttons[6]?.value ?? 0
      );
    },
  };
}
