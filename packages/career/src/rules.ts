import type { OrdinaryRivalId } from "@racer/sim/cast";

export interface RaceRules {
  readonly celebrities: boolean;
  readonly fieldSize: number;
  readonly ordinaryCast?: readonly OrdinaryRivalId[];
}

export const launchRules: RaceRules = {
  celebrities: true,
  fieldSize: 10,
};
