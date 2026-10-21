import { grudgeSide, nearestRival } from "./combat.ts";
import { PLAYER_RIDER } from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";
import { kick, weapons } from "./weapons.ts";
import type { StrikeSpec } from "./weapons.ts";

const ATTACK_CHANCE_PER_SECOND = 1.4;
const TRUCE_TICKS = 420;

const rivalWithin = (
  state: RaceState,
  riderIndex: number,
  strike: StrikeSpec
): RiderState | undefined => {
  if (grudgeSide(state, riderIndex, strike) !== 0) {
    return state.riders[state.riders[riderIndex]?.grudge ?? -1];
  }
  const left = nearestRival(state, riderIndex, -1, strike);
  return state.riders[
    left >= 0 ? left : nearestRival(state, riderIndex, 1, strike)
  ];
};

const aggressionToward = (
  state: RaceState,
  rider: RiderState,
  target: RiderState | undefined
): number => {
  if (!target) {
    return 0;
  }
  const boost =
    target === state.riders[PLAYER_RIDER] ? rider.aggressionBoost : 0;
  return rider.profile.aggression + boost;
};

export const fight = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  input: RiderInput,
  roll: (state: RaceState) => number
): void => {
  input.punch = false;
  input.kick = false;
  if (state.tick <= TRUCE_TICKS || rider.attackCooldown > 0) {
    return;
  }
  const inHandReach = rivalWithin(state, riderIndex, weapons[rider.weapon]);
  const inKickReach = rivalWithin(state, riderIndex, kick);
  const aggression = aggressionToward(state, rider, inHandReach ?? inKickReach);
  if (aggression <= 0) {
    return;
  }
  const chance = (aggression * ATTACK_CHANCE_PER_SECOND) / 60;
  const chosen = roll(state);
  if (chosen >= chance) {
    return;
  }
  const covetsWeapon =
    rider.weapon === "none" &&
    inKickReach !== undefined &&
    inKickReach.weapon !== "none";
  const kickShare = covetsWeapon ? 0.7 : 1 / 3;
  input.kick =
    inKickReach !== undefined &&
    (inHandReach === undefined || chosen < chance * kickShare);
  input.punch = !input.kick;
};
