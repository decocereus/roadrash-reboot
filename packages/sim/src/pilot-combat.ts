import { grudgeSide, nearestRival } from "./combat.ts";
import { PLAYER_RIDER, riderOf } from "./state.ts";
import type { RaceState, RiderInput, RiderState } from "./state.ts";
import { kick, weapons } from "./weapons.ts";
import type { StrikeSpec } from "./weapons.ts";

const ATTACK_CHANCE_PER_SECOND = 1.4;
const TRUCE_TICKS = 420;

const rivalWithin = (
  state: RaceState,
  rider: RiderState,
  strike: StrikeSpec
): RiderState | undefined =>
  grudgeSide(state, rider, strike) === 0
    ? (nearestRival(state, rider, -1, strike) ??
      nearestRival(state, rider, 1, strike))
    : riderOf(state.riders, rider.grudge);

const aggressionToward = (
  rider: RiderState,
  target: RiderState | undefined
): number => {
  if (!target) {
    return 0;
  }
  const boost = target.id === PLAYER_RIDER ? rider.aggressionBoost : 0;
  return rider.profile.aggression + boost;
};

export const fight = (
  state: RaceState,
  rider: RiderState,
  input: RiderInput,
  roll: (state: RaceState) => number
): void => {
  input.punch = false;
  input.kick = false;
  if (state.tick <= TRUCE_TICKS || rider.attackCooldown > 0) {
    return;
  }
  const inHandReach = rivalWithin(state, rider, weapons[rider.weapon]);
  const inKickReach = rivalWithin(state, rider, kick);
  const aggression = aggressionToward(rider, inHandReach ?? inKickReach);
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
