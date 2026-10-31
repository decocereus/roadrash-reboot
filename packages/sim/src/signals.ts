import type { Lights, TrackCrossing } from "@racer/track/crossings";

const signalPhases = [
  "mainGreen",
  "mainAmber",
  "mainClear",
  "crossGreen",
  "crossAmber",
  "crossClear",
] as const;

export type SignalPhase = (typeof signalPhases)[number];

export type LightColour = "green" | "amber" | "red";

export type SignalledCrossing = TrackCrossing & { readonly lights: Lights };

type Cycle = Readonly<Record<SignalPhase, number>>;

const junctionCycle = {
  crossAmber: 150,
  crossClear: 60,
  crossGreen: 420,
  mainAmber: 150,
  mainClear: 60,
  mainGreen: 540,
} as const satisfies Cycle;

const crosswalkCycle = {
  crossAmber: 120,
  crossClear: 60,
  crossGreen: 360,
  mainAmber: 150,
  mainClear: 60,
  mainGreen: 600,
} as const satisfies Cycle;

const cycleOf = (crossing: SignalledCrossing): Cycle =>
  crossing.road ? junctionCycle : crosswalkCycle;

const lengthOf = (cycle: Cycle): number => {
  let total = 0;
  for (const phase of signalPhases) {
    total += cycle[phase];
  }
  return total;
};

const junctionLength = lengthOf(junctionCycle);
const crosswalkLength = lengthOf(crosswalkCycle);

export const isSignalled = (
  crossing: TrackCrossing
): crossing is SignalledCrossing => crossing.lights !== null;

export const signalPhaseAt = (
  crossing: SignalledCrossing,
  tick: number
): SignalPhase => {
  const cycle = cycleOf(crossing);
  const total = crossing.road ? junctionLength : crosswalkLength;
  let left = (tick + crossing.lights.offsetTicks) % total;
  for (const phase of signalPhases) {
    if (left < cycle[phase]) {
      return phase;
    }
    left -= cycle[phase];
  }
  return "crossClear";
};

export const mainLightOf = (phase: SignalPhase): LightColour => {
  switch (phase) {
    case "mainGreen": {
      return "green";
    }
    case "mainAmber": {
      return "amber";
    }
    case "mainClear":
    case "crossGreen":
    case "crossAmber":
    case "crossClear": {
      return "red";
    }
    default: {
      return phase satisfies never;
    }
  }
};

export const crossLightOf = (phase: SignalPhase): LightColour => {
  switch (phase) {
    case "crossGreen": {
      return "green";
    }
    case "crossAmber": {
      return "amber";
    }
    case "mainGreen":
    case "mainAmber":
    case "mainClear":
    case "crossClear": {
      return "red";
    }
    default: {
      return phase satisfies never;
    }
  }
};
