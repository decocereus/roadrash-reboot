import type { NavigationEvent } from "../navigation.ts";
import { uiCueOf } from "./cues.ts";
import type { UiCue } from "./cues.ts";
import { sound } from "./sound.ts";

const ONE_SOUND_MS = 80;
const MOVE_GAP_MS = 40;
const INTERACTIVE =
  "button, a[href], select, input, [role='button'], [role='tab'], [role='radio'], [role='switch'], [role='option']";

const navigationCues = {
  careerBegun: "welcome",
  doorOpened: null,
  entered: null,
  joined: null,
  left: "back",
  movedOn: null,
  nextRace: null,
  paused: "menuOpen",
  picked: null,
  raceBegun: null,
  raceOver: null,
  raceRefused: "refused",
  raceSettled: null,
  resumed: "menuClose",
  ridePicked: null,
  roomMoved: null,
  signalLost: null,
  tabbed: "tab",
  walkedUp: "tab",
  welcomed: "welcome",
} as const satisfies Record<NavigationEvent["kind"], UiCue | null>;

let lastCueAt = Number.NEGATIVE_INFINITY;
let lastMoveAt = Number.NEGATIVE_INFINITY;
let hovered: Element | null = null;

export const cue = (heard: UiCue): void => {
  const now = performance.now();
  if (now - lastCueAt < ONE_SOUND_MS) {
    return;
  }
  lastCueAt = now;
  sound().play(heard);
};

export const cueNavigation = (event: NavigationEvent): void => {
  const heard = navigationCues[event.kind];
  if (heard !== null) {
    cue(heard);
  }
};

const interactiveOf = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest(INTERACTIVE) : null;

const disabled = (element: Element): boolean =>
  element.matches(":disabled, [aria-disabled='true']");

const moveTo = (element: Element | null): void => {
  if (element === hovered) {
    return;
  }
  hovered = element;
  const now = performance.now();
  if (element === null || disabled(element) || now - lastMoveAt < MOVE_GAP_MS) {
    return;
  }
  lastMoveAt = now;
  sound().play("move");
};

const hovering = (event: PointerEvent): void => {
  if (event.pointerType === "mouse") {
    moveTo(interactiveOf(event.target));
  }
};

const focusing = (event: FocusEvent): void => {
  const element = interactiveOf(event.target);
  if (element?.matches(":focus-visible") === true) {
    moveTo(element);
  }
};

const pressing = (event: PointerEvent): void => {
  const element = interactiveOf(event.target);
  if (element !== null && disabled(element)) {
    cue("refused");
  }
};

const clicking = (event: MouseEvent): void => {
  const element = interactiveOf(event.target);
  if (element === null || disabled(element)) {
    return;
  }
  const named = element.closest<HTMLElement>("[data-cue]")?.dataset.cue;
  cue(uiCueOf(named) ?? "press");
};

export const bindInterfaceSounds = (root: Document): (() => void) => {
  root.addEventListener("pointerover", hovering);
  root.addEventListener("focusin", focusing);
  root.addEventListener("pointerdown", pressing);
  root.addEventListener("click", clicking);
  return () => {
    root.removeEventListener("pointerover", hovering);
    root.removeEventListener("focusin", focusing);
    root.removeEventListener("pointerdown", pressing);
    root.removeEventListener("click", clicking);
  };
};
