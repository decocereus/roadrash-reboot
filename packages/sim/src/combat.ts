import type { Track } from "@racer/track/track";

import { approach, BIKE_HALF_LENGTH, BIKE_HALF_WIDTH, clamp } from "./state.ts";
import type { AttackKind, RaceState, RiderInput, RiderState } from "./state.ts";

export const PUNCH_TICKS = 16;
export const KICK_TICKS = 26;
const PUNCH_COOLDOWN = 30;
const KICK_COOLDOWN = 45;
const PUNCH_DAMAGE = 14;
const KICK_DAMAGE = 22;
const PUNCH_SHOVE = 1.6;
const KICK_SHOVE = 3.2;
const HIT_STUN_TICKS = 14;
const HIT_SPEED_LOSS = 0.06;
export const REACH_S = 1.9;
export const REACH_X = 2.2;
const CONTACT_CLOSING_SPEED = 9;
const SIDE_SHOVE = 1.2;
const BUMP_SPEED_LOSS = 0.9;
const CONTACT_COOLDOWN_TICKS = 6;

const canFight = (rider: RiderState): boolean =>
  rider.mode === "riding" && !rider.airborne && rider.finishTick < 0;

export const nearestRival = (
  state: RaceState,
  riderIndex: number,
  side: number
): number => {
  const rider = state.riders[riderIndex];
  if (!rider) {
    return -1;
  }
  let best = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const [index, other] of state.riders.entries()) {
    if (index === riderIndex || !canFight(other)) {
      continue;
    }
    const gapX = other.x - rider.x;
    const gapS = Math.abs(other.s - rider.s);
    if (
      Math.sign(gapX) === side &&
      Math.abs(gapX) < REACH_X &&
      gapS < REACH_S
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

export const rivalSide = (state: RaceState, riderIndex: number): number => {
  if (nearestRival(state, riderIndex, -1) >= 0) {
    return -1;
  }
  if (nearestRival(state, riderIndex, 1) >= 0) {
    return 1;
  }
  return 0;
};

const landHit = (
  state: RaceState,
  riderIndex: number,
  targetIndex: number,
  attack: AttackKind,
  side: number
): void => {
  const target = state.riders[targetIndex];
  if (!target) {
    return;
  }
  const kick = attack === "kick";
  target.stamina = Math.max(
    0,
    target.stamina - (kick ? KICK_DAMAGE : PUNCH_DAMAGE)
  );
  target.lateralSpeed += side * (kick ? KICK_SHOVE : PUNCH_SHOVE);
  target.speed *= 1 - HIT_SPEED_LOSS;
  target.hitStun = HIT_STUN_TICKS;
  target.attack = "none";
  target.attackTicks = 0;
  state.events.push({
    attack,
    kind: "hit",
    rider: riderIndex,
    target: targetIndex,
  });
};

export const stepAttack = (
  state: RaceState,
  riderIndex: number,
  input: RiderInput
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
  if (rider.attack !== "none") {
    rider.attackTicks -= 1;
    const strikeTick =
      rider.attack === "kick" ? KICK_TICKS - 10 : PUNCH_TICKS - 6;
    if (rider.attackTicks === strikeTick) {
      const targetIndex = nearestRival(state, riderIndex, rider.attackSide);
      if (targetIndex >= 0) {
        landHit(state, riderIndex, targetIndex, rider.attack, rider.attackSide);
      }
    }
    if (rider.attackTicks <= 0) {
      rider.attack = "none";
    }
    return;
  }
  if (rider.hitStun > 0 || rider.attackCooldown > 0) {
    return;
  }
  let wanted: AttackKind | "none" = "none";
  if (input.kick) {
    wanted = "kick";
  } else if (input.punch) {
    wanted = "punch";
  }
  if (wanted === "none") {
    return;
  }
  const side = rivalSide(state, riderIndex) || (input.steer < 0 ? -1 : 1);
  rider.attack = wanted;
  rider.attackSide = side;
  rider.attackTicks = wanted === "kick" ? KICK_TICKS : PUNCH_TICKS;
  rider.attackCooldown = wanted === "kick" ? KICK_COOLDOWN : PUNCH_COOLDOWN;
  state.events.push({
    attack: wanted,
    kind: "attack",
    rider: riderIndex,
    side,
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
  gapX: number,
  behind: number,
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
    front.lateralSpeed += (gapX >= 0 ? 1 : -1) * behind * 0.8;
    return;
  }
  rear.speed = Math.max(0, Math.min(rear.speed, front.speed) - 0.5);
  rear.s = front.s - behind * BIKE_HALF_LENGTH * 2;
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
    for (let b = a + 1; b < riders.length; b += 1) {
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
        rearEnd(state, a, b, gapX, 1, throwRider);
      } else {
        rearEnd(state, b, a, gapX, -1, throwRider);
      }
    }
  }
  for (const rider of riders) {
    rider.x = clamp(rider.x, -track.vergeHalfWidth, track.vergeHalfWidth);
  }
};
