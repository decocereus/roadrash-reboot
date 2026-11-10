import type { SteerSource } from "@racer/sim/control";
import type { RiderInput } from "@racer/sim/state";

import { onTextField } from "../key-target.ts";
import { createHeldKeys } from "./held-keys.ts";
import type { KeyPress } from "./held-keys.ts";

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
  isTextField: onTextField,
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

export interface Controls {
  read: (input: RiderInput) => SteerSource;
  release: () => void;
  dispose: () => void;
}

export const createControls = (
  onCommand: (code: string) => void,
  racing: () => boolean,
  host: InputHost = browserHost
): Controls => {
  const held = createHeldKeys();

  const press = (event: KeyEvent) => {
    if (host.isTextField(event.target)) {
      return;
    }
    if (racing() && handled.has(event.code)) {
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
    read(input) {
      const pad = firstStandard(host.pads());
      const stick = pad?.axes[0] ?? 0;
      const onStick = Math.abs(stick) > STICK_DEADZONE;
      input.steer = onStick ? stick : keySteer();
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
      return onStick ? "stick" : "keys";
    },
    release: held.clear,
  };
};
