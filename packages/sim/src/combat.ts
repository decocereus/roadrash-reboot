import type { Track } from "@racer/track/track";

import { BIKE_HALF_LENGTH, BIKE_HALF_WIDTH, clamp } from "./state.ts";
import type {
  AttackKind,
  RaceState,
  RiderInput,
  RiderState,
  WeaponKind,
} from "./state.ts";
import { disarm, punch, strikeOf } from "./weapons.ts";
import type { StrikeSpec } from "./weapons.ts";

const HIT_STUN_TICKS = 10;
const HIT_SPEED_LOSS = 0.06;
const CONTACT_CLOSING_SPEED = 9;
const SIDE_SHOVE = 1.2;
const BUMP_SPEED_LOSS = 0.9;
const CONTACT_COOLDOWN_TICKS = 6;
const TAP_SPEED_LOSS = 0.5;
const SOFT_SHUNT = 1;
const HARD_SHUNT = 6;

const canFight = (rider: RiderState): boolean =>
  rider.mode === "riding" && !rider.airborne && rider.finishTick < 0;

const allies = (rider: RiderState, other: RiderState): boolean =>
  rider.profile.role === "police" && other.profile.role === "police";

export const nearestRival = (
  state: RaceState,
  riderIndex: number,
  side: number,
  strike: StrikeSpec = punch
): number => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return -1;
  }
  let best = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const [index, other] of state.riders.entries()) {
    if (index === riderIndex || !canFight(other) || allies(rider, other)) {
      continue;
    }
    const gapX = other.x - rider.x;
    const gapS = Math.abs(other.s - rider.s);
    if (
      Math.sign(gapX) === side &&
      Math.abs(gapX) < strike.reachX &&
      gapS < strike.reachS
    ) {
      const gap = gapS + Math.abs(gapX);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    }
  }
  return best;
};

export const rivalSide = (
  state: RaceState,
  riderIndex: number,
  strike: StrikeSpec = punch
): number => {
  if (nearestRival(state, riderIndex, -1, strike) >= 0) {
    return -1;
  }
  if (nearestRival(state, riderIndex, 1, strike) >= 0) {
    return 1;
  }
  return 0;
};

const takeWeapon = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState,
  targetIndex: number,
  target: RiderState
): void => {
  if (target.weapon === "none") {
    return;
  }
  rider.weapon = target.weapon;
  rider.weaponHits = target.weaponHits;
  disarm(target);
  state.events.push({
    kind: "weaponTaken",
    rider: riderIndex,
    target: targetIndex,
    weapon: rider.weapon,
  });
};

export interface Strike {
  readonly attack: AttackKind;
  readonly side: number;
  readonly target: number;
  readonly weapon: WeaponKind;
  readonly takesWeapon: boolean;
}

const finishSwing = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): void => {
  rider.attack = "none";
  rider.attackTicks = 0;
  if (rider.weapon === "none" || rider.weaponHits > 0) {
    return;
  }
  const { weapon } = rider;
  disarm(rider);
  state.events.push({ kind: "weaponBroken", rider: riderIndex, weapon });
};

const landHit = (
  state: RaceState,
  riderIndex: number,
  { attack, side, takesWeapon, target: targetIndex, weapon }: Strike
): void => {
  const rider = state.riders[riderIndex];
  const target = state.riders[targetIndex];
  if (!rider || !target) {
    return;
  }
  const strike = strikeOf(attack, weapon);
  target.stamina = Math.max(0, target.stamina - strike.damage);
  target.lateralSpeed += side * strike.shove;
  target.speed *= 1 - HIT_SPEED_LOSS;
  target.hitStun = HIT_STUN_TICKS;
  if (target.attack !== "none") {
    finishSwing(state, targetIndex, target);
  }
  state.events.push({
    attack,
    kind: "hit",
    rider: riderIndex,
    target: targetIndex,
    weapon,
  });
  if (takesWeapon) {
    takeWeapon(state, riderIndex, rider, targetIndex, target);
  }
};

const wantedAttack = (
  rider: RiderState,
  input: RiderInput
): AttackKind | "none" => {
  if (input.kick) {
    return "kick";
  }
  if (input.punch) {
    return rider.weapon === "none" ? "punch" : "swing";
  }
  return "none";
};

const aimStrike = (
  state: RaceState,
  riderIndex: number,
  rider: RiderState
): Strike | undefined => {
  if (!canFight(rider) || rider.attack === "none") {
    return undefined;
  }
  const strike = strikeOf(rider.attack, rider.weapon);
  if (rider.attackTicks - 1 !== strike.strikeTick) {
    return undefined;
  }
  const target = nearestRival(state, riderIndex, rider.attackSide, strike);
  if (target < 0) {
    return undefined;
  }
  return {
    attack: rider.attack,
    side: rider.attackSide,
    takesWeapon: false,
    target,
    weapon: rider.attack === "swing" ? rider.weapon : "none",
  };
};

const reachTo = (state: RaceState, riderIndex: number, strike: Strike) => {
  const rider = state.riders[riderIndex];
  const target = state.riders[strike.target];
  if (!rider || !target) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(target.s - rider.s) + Math.abs(target.x - rider.x);
};

const covets = (
  state: RaceState,
  riderIndex: number,
  strike: Strike | undefined
): strike is Strike =>
  strike?.attack === "kick" &&
  state.riders[riderIndex]?.weapon === "none" &&
  (state.riders[strike.target]?.weaponHits ?? 0) > 0;

const pickThieves = (
  state: RaceState,
  strikes: readonly (Strike | undefined)[]
): (Strike | undefined)[] => {
  const thieves = new Map<number, number>();
  for (const [index, strike] of strikes.entries()) {
    if (covets(state, index, strike)) {
      const rival = thieves.get(strike.target) ?? -1;
      const rivalStrike = strikes[rival];
      if (
        !rivalStrike ||
        reachTo(state, index, strike) < reachTo(state, rival, rivalStrike)
      ) {
        thieves.set(strike.target, index);
      }
    }
  }
  return strikes.map((strike, index) =>
    strike && thieves.get(strike.target) === index
      ? { ...strike, takesWeapon: true }
      : strike
  );
};

const wearWeapons = (
  state: RaceState,
  strikes: readonly (Strike | undefined)[]
): void => {
  for (const [index, strike] of strikes.entries()) {
    const rider = state.riders[index];
    if (rider && strike && strike.weapon !== "none") {
      rider.weaponHits -= 1;
    }
  }
};

export const settleStrikes = (state: RaceState): (Strike | undefined)[] => {
  const strikes = state.riders.map((rider, index) =>
    aimStrike(state, index, rider)
  );
  wearWeapons(state, strikes);
  return pickThieves(state, strikes);
};

export const stepAttack = (
  state: RaceState,
  riderIndex: number,
  input: RiderInput,
  aimed: Strike | undefined
): void => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return;
  }
  rider.attackCooldown = Math.max(0, rider.attackCooldown - 1);
  rider.hitStun = Math.max(0, rider.hitStun - 1);
  if (!canFight(rider)) {
    rider.attack = "none";
    rider.attackTicks = 0;
    return;
  }
  if (aimed) {
    landHit(state, riderIndex, aimed);
  }
  if (rider.attack !== "none" || aimed) {
    rider.attackTicks = Math.max(0, rider.attackTicks - 1);
    if (rider.attackTicks <= 0) {
      finishSwing(state, riderIndex, rider);
    }
    return;
  }
  if (rider.hitStun > 0 || rider.attackCooldown > 0) {
    return;
  }
  const wanted = wantedAttack(rider, input);
  if (wanted === "none") {
    return;
  }
  const strike = strikeOf(wanted, rider.weapon);
  const side =
    rivalSide(state, riderIndex, strike) || (input.steer < 0 ? -1 : 1);
  rider.attack = wanted;
  rider.attackSide = side;
  rider.attackTicks = strike.ticks;
  rider.attackCooldown = strike.cooldown;
  state.events.push({
    attack: wanted,
    kind: "attack",
    rider: riderIndex,
    side,
    weapon: wanted === "swing" ? rider.weapon : "none",
  });
};

export type ThrowRider = (
  riderIndex: number,
  cause: "rider",
  bikeKeep: number,
  bodyKeep: number
) => void;

interface Jolt {
  shift: number;
  shove: number;
  shoved: boolean;
  nudge: number;
  speedCap: number;
  speedLoss: number;
  speedGain: number;
  behind: number;
  struckGap: number;
  struckSpeed: number;
}

interface Party {
  readonly index: number;
  readonly rider: RiderState;
  readonly jolt: Jolt;
}

const untouched = (): Jolt => ({
  behind: Number.POSITIVE_INFINITY,
  nudge: 0,
  shift: 0,
  shove: 0,
  shoved: false,
  speedCap: Number.POSITIVE_INFINITY,
  speedGain: 0,
  speedLoss: 0,
  struckGap: Number.POSITIVE_INFINITY,
  struckSpeed: 0,
});

const shoveApart = (
  state: RaceState,
  left: Party,
  right: Party,
  gapX: number,
  overlapX: number
): void => {
  const away = gapX >= 0 ? 1 : -1;
  left.jolt.shift -= (away * overlapX) / 2;
  right.jolt.shift += (away * overlapX) / 2;
  left.jolt.shove -= away * SIDE_SHOVE;
  right.jolt.shove += away * SIDE_SHOVE;
  left.jolt.shoved = true;
  right.jolt.shoved = true;
  left.jolt.speedLoss += BUMP_SPEED_LOSS;
  right.jolt.speedLoss += BUMP_SPEED_LOSS;
  if (left.rider.attackCooldown < CONTACT_COOLDOWN_TICKS) {
    state.events.push({
      kind: "riderContact",
      other: right.index,
      rider: left.index,
    });
  }
};

const rearEnd = (state: RaceState, rear: Party, front: Party): void => {
  const closing = rear.rider.speed - front.rider.speed;
  if (closing > CONTACT_CLOSING_SPEED) {
    const gap = front.rider.s - rear.rider.s;
    const nearer =
      gap < rear.jolt.struckGap ||
      (gap === rear.jolt.struckGap &&
        front.rider.speed < rear.jolt.struckSpeed);
    if (nearer) {
      rear.jolt.struckGap = gap;
      rear.jolt.struckSpeed = front.rider.speed;
    }
    front.jolt.speedGain += Math.min(closing * 0.2, HARD_SHUNT);
    front.jolt.nudge += front.rider.x >= rear.rider.x ? 0.8 : -0.8;
    return;
  }
  rear.jolt.speedCap = Math.min(rear.jolt.speedCap, front.rider.speed);
  rear.jolt.speedLoss += TAP_SPEED_LOSS;
  rear.jolt.behind = Math.min(
    rear.jolt.behind,
    front.rider.s - BIKE_HALF_LENGTH * 2
  );
  front.jolt.speedGain += Math.min(SOFT_SHUNT, Math.max(0, closing) * 0.3);
  state.events.push({
    kind: "riderContact",
    other: front.index,
    rider: rear.index,
  });
};

const meet = (state: RaceState, left: Party, right: Party): void => {
  const gapS = right.rider.s - left.rider.s;
  const gapX = right.rider.x - left.rider.x;
  const reachX = BIKE_HALF_WIDTH * 2 + 0.1;
  if (Math.abs(gapS) >= BIKE_HALF_LENGTH * 2 || Math.abs(gapX) >= reachX) {
    return;
  }
  const overlapS = BIKE_HALF_LENGTH * 2 - Math.abs(gapS);
  const overlapX = reachX - Math.abs(gapX);
  if (overlapX < overlapS) {
    shoveApart(state, left, right, gapX, overlapX);
  } else if (gapS > 0) {
    rearEnd(state, left, right);
  } else {
    rearEnd(state, right, left);
  }
};

const settle = (
  { index, jolt, rider }: Party,
  throwRider: ThrowRider
): void => {
  rider.x += jolt.shift;
  if (jolt.shoved) {
    rider.lateralSpeed = clamp(jolt.shove, -SIDE_SHOVE, SIDE_SHOVE);
  }
  rider.lateralSpeed += jolt.nudge;
  if (jolt.struckGap < Number.POSITIVE_INFINITY) {
    rider.speed = jolt.struckSpeed * 0.9;
    throwRider(index, "rider", 0.4, 0.6);
    return;
  }
  rider.speed =
    Math.max(0, Math.min(rider.speed, jolt.speedCap) - jolt.speedLoss) +
    jolt.speedGain;
  rider.s = Math.min(rider.s, jolt.behind);
};

export const stepRiderContacts = (
  state: RaceState,
  track: Track,
  throwRider: ThrowRider
): void => {
  const parties = state.riders.flatMap((rider, index): Party[] =>
    canFight(rider) ? [{ index, jolt: untouched(), rider }] : []
  );
  for (const [position, left] of parties.entries()) {
    for (const right of parties.slice(position + 1)) {
      meet(state, left, right);
    }
  }
  for (const party of parties) {
    settle(party, throwRider);
  }
  for (const rider of state.riders) {
    rider.x = clamp(rider.x, -track.vergeHalfWidth, track.vergeHalfWidth);
  }
};
