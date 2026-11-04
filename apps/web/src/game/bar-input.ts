import type { LobbyControl } from "@racer/sim/lobby";
import type { LobbyPose } from "@racer/sim/lobby-walk";

const POSE_KEYS = {
  Digit1: "arms",
  Digit2: "chat",
  Digit3: "phone",
} as const satisfies Record<string, LobbyPose>;

const isPoseKey = (code: string): code is keyof typeof POSE_KEYS =>
  Object.hasOwn(POSE_KEYS, code);

const ACTION_KEYS = {
  KeyB: "bike",
  KeyE: "interact",
  KeyF: "shove",
  KeyR: "rev",
} as const;
export type BarAction = (typeof ACTION_KEYS)[keyof typeof ACTION_KEYS];

const isActionKey = (code: string): code is keyof typeof ACTION_KEYS =>
  Object.hasOwn(ACTION_KEYS, code);

const DRAG_PIXELS = 6;

export interface BarInputEvents {
  readonly action: (action: BarAction) => void;
  readonly pose: (pose: LobbyPose) => void;
  readonly click: (x: number, y: number) => void;
  readonly drag: (pixels: number) => void;
}

export interface BarInput {
  readonly control: () => LobbyControl;
  readonly dragging: () => boolean;
  readonly dispose: () => void;
}

export const createBarInput = (
  canvas: HTMLCanvasElement,
  events: BarInputEvents
): BarInput => {
  const held = new Set<string>();
  const control = { forward: 0, right: 0, sprint: false };
  let dragFrom: number | null = null;
  let dragged = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    held.add(event.code);
    if (isPoseKey(event.code)) {
      events.pose(POSE_KEYS[event.code]);
    }
    if (isActionKey(event.code)) {
      events.action(ACTION_KEYS[event.code]);
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.code);
  };
  const onBlur = (): void => {
    held.clear();
  };
  const onPointerDown = (event: PointerEvent): void => {
    dragFrom = event.clientX;
    dragged = false;
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (dragFrom === null) {
      return;
    }
    const moved = event.clientX - dragFrom;
    if (dragged || Math.abs(moved) > DRAG_PIXELS) {
      dragged = true;
      dragFrom = event.clientX;
      events.drag(moved);
    }
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (dragFrom === null) {
      return;
    }
    const wasDrag = dragged;
    dragFrom = null;
    dragged = false;
    if (!wasDrag) {
      const bounds = canvas.getBoundingClientRect();
      events.click(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2
      );
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  globalThis.addEventListener("pointermove", onPointerMove);
  globalThis.addEventListener("pointerup", onPointerUp);
  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);
  globalThis.addEventListener("blur", onBlur);

  return {
    control() {
      control.forward =
        Number(held.has("KeyW") || held.has("ArrowUp")) -
        Number(held.has("KeyS") || held.has("ArrowDown"));
      control.right =
        Number(held.has("KeyD") || held.has("ArrowRight")) -
        Number(held.has("KeyA") || held.has("ArrowLeft"));
      control.sprint = held.has("ShiftLeft") || held.has("ShiftRight");
      return control;
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
      globalThis.removeEventListener("blur", onBlur);
    },
    dragging: () => dragFrom !== null,
  };
};
