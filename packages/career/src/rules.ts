import type { BikeId } from "@racer/sim/bikes";
import type { OrdinaryRivalId } from "@racer/sim/cast";
import type { Tier } from "@racer/sim/difficulty";

interface BikeMatch {
  readonly tier: Tier;
  readonly from: BikeId;
  readonly to: BikeId;
}

export interface RaceRules {
  readonly bikeMatches: readonly BikeMatch[];
  readonly celebrities: boolean;
  readonly fieldSize: number;
  readonly ordinaryCast?: readonly OrdinaryRivalId[];
}

export const launchRules: RaceRules = {
  bikeMatches: [{ from: "halden-kite-500", tier: 1, to: "ostra-sesta-600" }],
  celebrities: true,
  fieldSize: 10,
};
