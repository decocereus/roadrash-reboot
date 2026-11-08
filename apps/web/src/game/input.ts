import type { RiderInput } from "@racer/sim/state";

import { createHeldKeys } from "./held-keys.ts";
import type { KeyPress } from "./held-keys.ts";

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
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
]);

export interface KeyEvent extends KeyPress {
  readonly target: EventTarget | null;
  readonly preventDefault: () => void;
}

interface PadButton {
  readonly pressed: boolean;
  readonly value: number;
}

export interface Pad {
  readonly axes: readonly number[];
  readonly buttons: readonly PadButton[];
  readonly connected: boolean;
  readonly mapping: GamepadMappingType;
}

export interface InputHost {
  readonly listen: (
    press: (event: KeyEvent) => void,
    release: (event: KeyEvent) => void,
    blur: () => void
  ) => () => void;
  readonly pads: () => readonly (Pad | null)[];
  readonly isTextField: (target: EventTarget | null) => boolean;
}

const browserHost: InputHost = {
  isTextField: (target) => target instanceof HTMLInputElement,
  listen(press, release, blur) {
    window.addEventListener("keydown", press);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", press);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
    };
  },
  pads: () => navigator.getGamepads(),
};

const firstStandard = (pads: readonly (Pad | null)[]): Pad | null => {
  for (const pad of pads) {
    if (pad?.connected === true && pad.mapping === "standard") {
      return pad;
    }
  }
  return null;
};

const padPressed = (pad: Pad | null, index: number): boolean =>
  pad?.buttons[index]?.pressed ?? false;

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

export const createControls = (
  onCommand: (code: string) => void,
  host: InputHost = browserHost
): Controls => {
  const held = createHeldKeys();
  let steer = 0;

  const press = (event: KeyEvent) => {
    if (host.isTextField(event.target)) {
      return;
    }
    if (handled.has(event.code)) {
      event.preventDefault();
    }
    if (held.press(event)) {
      onCommand(event.code);
    }
  };
  const release = (event: KeyEvent) => {
    held.release(event.code);
  };
  const unlisten = host.listen(press, release, held.clear);

  const down = (...codes: string[]): boolean =>
    codes.some((code) => held.has(code));
  const keySteer = (): number =>
    (down("ArrowRight", "KeyD") ? 1 : 0) - (down("ArrowLeft", "KeyA") ? 1 : 0);

  return {
    dispose() {
      unlisten();
    },
    read(seconds, input) {
      const pad = firstStandard(host.pads());
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
      input.punch = down("Space", "KeyJ") || padPressed(pad, 2);
      input.kick =
        down("KeyK", "ShiftLeft", "ShiftRight") || padPressed(pad, 1);
      input.remount = down("KeyE") || padPressed(pad, 0);
    },
  };
};
