import type { BikeId } from "./bikes.ts";
import type { PacingRules, RaceConditions } from "./state.ts";

export const tiers = [1, 2, 3] as const;

export type Tier = (typeof tiers)[number];

export const TOP_TIER: Tier = 3;

export const tierAfter = (tier: Tier): Tier | null =>
  tiers.find((next) => next === tier + 1) ?? null;

export const byTier = <Value>(make: (tier: Tier) => Value) => ({
  1: make(1),
  2: make(2),
  3: make(3),
});

interface CopRules {
  readonly beat: number;
  readonly bike: BikeId;
  readonly count: number;
  readonly loseRange: number;
  readonly sightRange: number;
  readonly topSpeed: number;
}

interface Difficulty {
  readonly conditions: RaceConditions;
  readonly cops: CopRules;
  readonly pacing: PacingRules;
  readonly rivalSkill: number;
}

export const difficulties = {
  1: {
    conditions: {
      hazardShare: 0.6,
      hitDamage: 2.4,
      slowConvoys: 0,
      trafficDensity: 1,
    },
    cops: {
      beat: 6000,
      bike: "ostra-sesta-600",
      count: 1,
      loseRange: 120,
      sightRange: 40,
      topSpeed: 49,
    },
    pacing: { catchUp: 0.08, leadEase: 0.22 },
    rivalSkill: 0,
  },
  2: {
    conditions: {
      hazardShare: 0.8,
      hitDamage: 3,
      slowConvoys: 1,
      trafficDensity: 1.25,
    },
    cops: {
      beat: 1800,
      bike: "ostra-sesta-600",
      count: 3,
      loseRange: 150,
      sightRange: 45,
      topSpeed: 60,
    },
    pacing: { catchUp: 0.06, leadEase: 0.18 },
    rivalSkill: 0.03,
  },
  3: {
    conditions: {
      hazardShare: 1,
      hitDamage: 5,
      slowConvoys: 2,
      trafficDensity: 1.5,
    },
    cops: {
      beat: 1200,
      bike: "ostra-nera-1000",
      count: 5,
      loseRange: 240,
      sightRange: 60,
      topSpeed: 69,
    },
    pacing: { catchUp: 0.04, leadEase: 0.14 },
    rivalSkill: 0.06,
  },
} as const satisfies Record<Tier, Difficulty>;
