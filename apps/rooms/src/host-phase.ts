export const HOST_PHASES = [
  "waiting",
  "loading",
  "countdown",
  "racing",
] as const;

export type HostPhase = (typeof HOST_PHASES)[number];

export type HostState<Run> =
  | { readonly phase: "waiting"; readonly run: null }
  | { readonly phase: "loading"; readonly run: Run }
  | {
      readonly phase: "countdown";
      readonly run: Run;
      readonly startsAt: number;
    }
  | {
      readonly phase: "racing";
      readonly run: Run;
      readonly startedAt: number;
    };

export type HostEvent<Run> =
  | { readonly kind: "raceBuilt"; readonly run: Run }
  | {
      readonly kind: "loadingOver";
      readonly run: Run;
      readonly startsAt: number;
    }
  | { readonly kind: "raceOver" | "startMoment" };

export const NEW_HOST = { phase: "waiting", run: null } as const;

export const hostAfter = <Run>(
  state: HostState<Run>,
  event: HostEvent<Run>
): HostState<Run> | null => {
  switch (event.kind) {
    case "raceBuilt": {
      return state.phase === "waiting"
        ? { phase: "loading", run: event.run }
        : null;
    }
    case "loadingOver": {
      return state.phase === "loading" && state.run === event.run
        ? { phase: "countdown", run: state.run, startsAt: event.startsAt }
        : null;
    }
    case "startMoment": {
      return state.phase === "countdown"
        ? { phase: "racing", run: state.run, startedAt: state.startsAt }
        : null;
    }
    case "raceOver": {
      return state.phase === "racing" ? NEW_HOST : null;
    }
    default: {
      return event satisfies never;
    }
  }
};

export const startMomentOf = <Run>(state: HostState<Run>): number | null => {
  switch (state.phase) {
    case "waiting":
    case "loading": {
      return null;
    }
    case "countdown": {
      return state.startsAt;
    }
    case "racing": {
      return state.startedAt;
    }
    default: {
      return state satisfies never;
    }
  }
};
