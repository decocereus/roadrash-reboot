import type { RaceLog, RaceOutcome, RaceResult } from "@racer/career/outcome";
import type { RoomRun } from "@racer/rooms/room-run";
import { TICK_SECONDS } from "@racer/sim/state";
import type { RaceSetup } from "@racer/sim/state";

import type { PrepareOutcome } from "../prepare-outcome.ts";
import type { Dressing } from "./figure-wardrobe.ts";
import type { RacePlan } from "./hud.ts";

const COUNTDOWN_SECONDS = 3;
const RESUME_SECONDS = 3;
const FIRST_SEED = 1;

const consequenceSeconds = {
  busted: 0.8,
  finished: 0,
  quit: 0,
  wrecked: 1.2,
} as const satisfies Record<RaceResult, number>;

const gamePhases = [
  "attract",
  "idle",
  "countdown",
  "racing",
  "settled",
] as const;

export type GamePhase = (typeof gamePhases)[number];

interface StillDressing {
  readonly kind: "dressing";
  readonly setup: RaceSetup;
  readonly preparing: Promise<PrepareOutcome>;
}

interface Built {
  readonly kind: "built";
  readonly setup: RaceSetup;
  readonly preparing: Promise<PrepareOutcome>;
  readonly dressing: Dressing;
}

type Preparation = StillDressing | Built;

type Pace =
  | { readonly kind: "running" }
  | { readonly kind: "inMenu" }
  | { readonly kind: "resuming"; holdLeft: number }
  | { readonly kind: "frozen"; readonly holdLeft: number };

type StartPace = Extract<Pace, { readonly kind: "inMenu" | "running" }>;

const running: StartPace = { kind: "running" };
const inMenu: StartPace = { kind: "inMenu" };
const frozenWithNoHold: Pace = { holdLeft: 0, kind: "frozen" };

export interface Attract {
  readonly phase: "attract";
  readonly roadTurn: number;
  readonly seed: number;
}

interface Idle {
  readonly phase: "idle";
  readonly preparation: Preparation | null;
}

interface Entered {
  readonly plan: RacePlan;
  readonly dressing: Dressing;
}

export interface Countdown extends Entered {
  readonly phase: "countdown";
  readonly log: RaceLog;
  readonly pace: StartPace;
  left: number;
}

interface Racing extends Entered {
  readonly phase: "racing";
  readonly log: RaceLog;
  pace: Pace;
  lastStretchSaid: boolean;
}

interface Settled extends Entered {
  readonly phase: "settled";
  readonly outcome: RaceOutcome;
  readonly held: boolean;
  overLeft: number;
}

export type InRace = Countdown | Racing | Settled;

export type Session = Attract | Idle | InRace;

export const attractOn = (roadTurn: number): Attract => ({
  phase: "attract",
  roadTurn,
  seed: FIRST_SEED,
});

export const attractAfter = ({ roadTurn, seed }: Attract): Attract => ({
  phase: "attract",
  roadTurn: roadTurn + 1,
  seed: seed + 1,
});

export const unprepared: Idle = { phase: "idle", preparation: null };

export const dressingFor = (
  setup: RaceSetup,
  preparing: Promise<PrepareOutcome>
): Idle => ({
  phase: "idle",
  preparation: { kind: "dressing", preparing, setup },
});

export const builtFrom = (
  { preparing, setup }: StillDressing,
  dressing: Dressing
): Idle => ({
  phase: "idle",
  preparation: { dressing, kind: "built", preparing, setup },
});

export const countdownFor = (
  plan: RacePlan,
  log: RaceLog,
  dressing: Dressing
): Countdown => ({
  dressing,
  left: COUNTDOWN_SECONDS,
  log,
  pace: running,
  phase: "countdown",
  plan,
});

export const racingFrom = ({
  dressing,
  log,
  pace,
  plan,
}: Countdown): Racing => ({
  dressing,
  lastStretchSaid: false,
  log,
  pace,
  phase: "racing",
  plan,
});

export const settledFrom = (
  state: Countdown | Racing,
  outcome: RaceOutcome
): Settled => ({
  dressing: state.dressing,
  held: state.phase === "racing" && state.pace.kind === "frozen",
  outcome,
  overLeft: consequenceSeconds[outcome.result],
  phase: "settled",
  plan: state.plan,
});

export const stoodDownFrom = (state: Session): Session => {
  switch (state.phase) {
    case "idle": {
      return state;
    }
    case "attract":
    case "countdown":
    case "racing":
    case "settled": {
      return unprepared;
    }
    default: {
      return state satisfies never;
    }
  }
};

const racingPaused = (state: Racing): Racing => {
  switch (state.pace.kind) {
    case "running": {
      return {
        ...state,
        pace: state.plan.room ? inMenu : frozenWithNoHold,
      };
    }
    case "resuming": {
      return {
        ...state,
        pace: { holdLeft: state.pace.holdLeft, kind: "frozen" },
      };
    }
    case "frozen":
    case "inMenu": {
      return state;
    }
    default: {
      return state.pace satisfies never;
    }
  }
};

export const pausedFrom = (state: Session): Session => {
  switch (state.phase) {
    case "countdown": {
      return state.plan.room && state.pace.kind === "running"
        ? { ...state, pace: inMenu }
        : state;
    }
    case "racing": {
      return racingPaused(state);
    }
    case "attract":
    case "idle":
    case "settled": {
      return state;
    }
    default: {
      return state satisfies never;
    }
  }
};

const racingResumed = (state: Racing): Racing => {
  switch (state.pace.kind) {
    case "frozen": {
      return { ...state, pace: { holdLeft: RESUME_SECONDS, kind: "resuming" } };
    }
    case "inMenu": {
      return { ...state, pace: running };
    }
    case "resuming":
    case "running": {
      return state;
    }
    default: {
      return state.pace satisfies never;
    }
  }
};

export const resumedFrom = (state: Session): Session => {
  switch (state.phase) {
    case "countdown": {
      return state.pace.kind === "inMenu" ? { ...state, pace: running } : state;
    }
    case "racing": {
      return racingResumed(state);
    }
    case "settled": {
      return state.held ? { ...state, held: false } : state;
    }
    case "attract":
    case "idle": {
      return state;
    }
    default: {
      return state satisfies never;
    }
  }
};

export const handsOn = (state: Session): boolean => {
  switch (state.phase) {
    case "countdown":
    case "racing": {
      return state.pace.kind !== "inMenu";
    }
    case "attract":
    case "idle":
    case "settled": {
      return true;
    }
    default: {
      return state satisfies never;
    }
  }
};

export const heldFrom = (state: Racing): Racing => ({
  ...state,
  pace: frozenWithNoHold,
});

export const releasedFrom = (state: Session): Session => {
  if (state.phase === "settled" && state.held) {
    return { ...state, held: false };
  }
  if (state.phase !== "racing" || state.pace.kind !== "frozen") {
    return state;
  }
  return state.pace.holdLeft > 0
    ? {
        ...state,
        pace: { holdLeft: state.pace.holdLeft, kind: "resuming" },
      }
    : { ...state, pace: running };
};

export const countDown = (state: Countdown): boolean => {
  state.left = state.plan.room
    ? state.plan.room.countdownSeconds()
    : state.left - TICK_SECONDS;
  return state.left <= 0;
};

export const spendResumeHold = (state: Session): boolean => {
  if (state.phase !== "racing" || state.pace.kind !== "resuming") {
    return false;
  }
  state.pace.holdLeft -= TICK_SECONDS;
  if (state.pace.holdLeft <= 0) {
    state.pace = running;
  }
  return true;
};

export const spendConsequence = (state: Settled): boolean => {
  if (state.overLeft <= 0) {
    return false;
  }
  state.overLeft -= TICK_SECONDS;
  return state.overLeft <= 0;
};

export const raceOf = (state: Session): InRace | null => {
  switch (state.phase) {
    case "countdown":
    case "racing":
    case "settled": {
      return state;
    }
    case "attract":
    case "idle": {
      return null;
    }
    default: {
      return state satisfies never;
    }
  }
};

export const roomOf = (state: Session): RoomRun | undefined =>
  raceOf(state)?.plan.room;

export const standDownThenHangUp = (
  state: Session,
  become: (next: Session) => void
): void => {
  const room = roomOf(state);
  become(stoodDownFrom(state));
  room?.leave();
};

export const preparationFor = (
  state: Session,
  setup: RaceSetup
): Preparation | null =>
  state.phase === "idle" && state.preparation?.setup === setup
    ? state.preparation
    : null;

export const ticksHalted = (state: Session): boolean => {
  switch (state.phase) {
    case "attract":
    case "countdown": {
      return false;
    }
    case "idle": {
      return true;
    }
    case "racing": {
      return state.pace.kind === "frozen";
    }
    case "settled": {
      return state.held;
    }
    default: {
      return state satisfies never;
    }
  }
};

export const liveRaceOf = (state: Session): Countdown | Racing | null => {
  if (state.phase === "countdown") {
    return state;
  }
  return state.phase === "racing" && state.pace.kind !== "frozen"
    ? state
    : null;
};

const holdLeftOf = (pace: Pace): number => {
  switch (pace.kind) {
    case "inMenu":
    case "running": {
      return 0;
    }
    case "resuming":
    case "frozen": {
      return pace.holdLeft;
    }
    default: {
      return pace satisfies never;
    }
  }
};

export const hudCountdown = (state: Session): number => {
  switch (state.phase) {
    case "attract":
    case "idle":
    case "settled": {
      return 0;
    }
    case "countdown": {
      return Math.max(0, Math.ceil(state.left));
    }
    case "racing": {
      return Math.ceil(holdLeftOf(state.pace));
    }
    default: {
      return state satisfies never;
    }
  }
};

export const throttleOpen = (state: Session): boolean =>
  state.phase === "racing" && holdLeftOf(state.pace) <= 0;
