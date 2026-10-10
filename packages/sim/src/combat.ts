import type { Track } from "@racer/track/track";

import { approach, BIKE_HALF_LENGTH, BIKE_HALF_WIDTH, clamp } from "./state.ts";
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

const shoveApart = (
  state: RaceState,
  a: number,
  b: number,
  gapX: number,
  overlapX: number
): void => {
  const left = state.riders[a];
  const right = state.riders[b];
  if (!left || !right) {
    return;
  }
  const away = gapX >= 0 ? 1 : -1;
  left.x -= (away * overlapX) / 2;
  right.x += (away * overlapX) / 2;
  left.lateralSpeed = -away * SIDE_SHOVE;
  right.lateralSpeed = away * SIDE_SHOVE;
  left.speed = Math.max(0, left.speed - BUMP_SPEED_LOSS);
  right.speed = Math.max(0, right.speed - BUMP_SPEED_LOSS);
  if (left.attackCooldown < CONTACT_COOLDOWN_TICKS) {
    state.events.push({ kind: "riderContact", other: b, rider: a });
  }
};

const rearEnd = (
  state: RaceState,
  rearIndex: number,
  frontIndex: number,
  throwRider: ThrowRider
): void => {
  const rear = state.riders[rearIndex];
  const front = state.riders[frontIndex];
  if (!rear || !front) {
    return;
  }
  const closing = rear.speed - front.speed;
  if (closing > CONTACT_CLOSING_SPEED) {
    rear.speed = front.speed * 0.9;
    throwRider(rearIndex, "rider", 0.4, 0.6);
    front.speed = clamp(front.speed + closing * 0.2, 0, front.speed + 6);
    front.lateralSpeed += front.x >= rear.x ? 0.8 : -0.8;
    return;
  }
  rear.speed = Math.max(0, Math.min(rear.speed, front.speed) - 0.5);
  rear.s = front.s - BIKE_HALF_LENGTH * 2;
  front.speed = approach(
    front.speed,
    front.speed + Math.max(0, closing) * 0.3,
    1
  );
  state.events.push({
    kind: "riderContact",
    other: frontIndex,
    rider: rearIndex,
  });
};

export type ThrowRider = (
  riderIndex: number,
  cause: "rider",
  bikeKeep: number,
  bodyKeep: number
) => void;

export const stepRiderContacts = (
  state: RaceState,
  track: Track,
  throwRider: ThrowRider
): void => {
  const { riders } = state;
  for (let a = 0; a < riders.length; a += 1) {
    const left = riders[a];
    if (!left || !canFight(left)) {
      continue;
    }
    for (let b = a + 1; b < riders.length && canFight(left); b += 1) {
      const right = riders[b];
      if (!right || !canFight(right)) {
        continue;
      }
      const gapS = right.s - left.s;
      const gapX = right.x - left.x;
      const reachX = BIKE_HALF_WIDTH * 2 + 0.1;
      if (Math.abs(gapS) >= BIKE_HALF_LENGTH * 2 || Math.abs(gapX) >= reachX) {
        continue;
      }
      const overlapS = BIKE_HALF_LENGTH * 2 - Math.abs(gapS);
      const overlapX = reachX - Math.abs(gapX);
      if (overlapX < overlapS) {
        shoveApart(state, a, b, gapX, overlapX);
      } else if (gapS > 0) {
        rearEnd(state, a, b, throwRider);
      } else {
        rearEnd(state, b, a, throwRider);
      }
    }
  }
  for (const rider of riders) {
    rider.x = clamp(rider.x, -track.vergeHalfWidth, track.vergeHalfWidth);
  }
};
