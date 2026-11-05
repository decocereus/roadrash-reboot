export type PrepareOutcome =
  | { readonly kind: "ready" }
  | { readonly kind: "timedOut" }
  | {
      readonly kind: "failed";
      readonly stage: "dress" | "build" | "compile" | "warm";
      readonly cause: Error;
    }
  | { readonly kind: "lost" }
  | { readonly kind: "cancelled" };

type PreparedRace = "built" | "missing" | "cancelled";

const raceAfterFailureAt = {
  build: "missing",
  compile: "built",
  dress: "missing",
  warm: "built",
} as const satisfies Record<
  Extract<PrepareOutcome, { readonly kind: "failed" }>["stage"],
  PreparedRace
>;

export const preparedRace = (outcome: PrepareOutcome): PreparedRace => {
  switch (outcome.kind) {
    case "ready":
    case "timedOut":
    case "lost": {
      return "built";
    }
    case "failed": {
      return raceAfterFailureAt[outcome.stage];
    }
    case "cancelled": {
      return "cancelled";
    }
    default: {
      return outcome satisfies never;
    }
  }
};
