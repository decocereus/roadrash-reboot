import type { Track } from "@racer/track/track";

import {
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  clamp,
  raceOwned,
  riderOf,
  TICK_SECONDS,
} from "./state.ts";
import type {
  AttackKind,
  RaceState,
  RiderId,
  RiderInput,
  RiderState,
  WeaponKind,
} from "./state.ts";
import { disarm, punch, strikeOf } from "./weapons.ts";
import type { StrikeSpec } from "./weapons.ts";

export const HIT_STUN_TICKS = 10;
const HIT_SPEED_LOSS = 0.06;
const CONTACT_CLOSING_SPEED = 18;
const SIDE_SHOVE = 1.2;
const BUMP_SPEED_LOSS = 0.9;
const BUMP_LOSS_PER_SECOND = 6;
const CONTACT_COOLDOWN_TICKS = 6;
const TAP_SPEED_LOSS = 0.5;
const SHUNT_SHARE = 0.3;
const SOFT_SHUNT = CONTACT_CLOSING_SPEED * SHUNT_SHARE;
const HARD_SHUNT = 6;
const REACH_S = BIKE_HALF_LENGTH * 2;
const REACH_X = BIKE_HALF_WIDTH * 2 + 0.1;

const canFight = (rider: RiderState): boolean =>
  rider.mode === "riding" && !rider.airborne && rider.finishTick < 0;

const allies = (rider: RiderState, other: RiderState): boolean =>
  rider.profile.role === "police" && other.profile.role === "police";

const reaches = (
  rider: RiderState,
  other: RiderState,
  side: number,
  strike: StrikeSpec
): boolean => {
  const gapX = other.x - rider.x;
  return (
    Math.sign(gapX) === side &&
    Math.abs(gapX) < strike.reachX &&
    Math.abs(other.s - rider.s) < strike.reachS
  );
};

export const nearestRival = (
  state: RaceState,
  rider: RiderState,
  side: number,
  strike: StrikeSpec = punch
): RiderState | undefined => {
  let best: RiderState | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const other of state.riders) {
    if (other === rider || !canFight(other) || allies(rider, other)) {
      continue;
    }
    if (reaches(rider, other, side, strike)) {
      const gap = Math.abs(other.s - rider.s) + Math.abs(other.x - rider.x);
      if (gap < bestGap) {
        bestGap = gap;
        best = other;
      }
    }
  }
  return best;
};

export const grudgeSide = (
  state: RaceState,
  rider: RiderState,
  strike: StrikeSpec = punch
): number => {
  const target = riderOf(state.riders, rider.grudge);
  if (!target || target === rider || !canFight(target)) {
    return 0;
  }
  const side = Math.sign(target.x - rider.x);
  return reaches(rider, target, side, strike) ? side : 0;
};

const strikeTarget = (
  state: RaceState,
  rider: RiderState,
  side: number,
  strike: StrikeSpec = punch
): RiderState | undefined =>
  grudgeSide(state, rider, strike) === side
    ? riderOf(state.riders, rider.grudge)
    : nearestRival(state, rider, side, strike);

const rivalSide = (
  state: RaceState,
  rider: RiderState,
  strike: StrikeSpec = punch
): number => {
  const grudge = grudgeSide(state, rider, strike);
  if (grudge !== 0) {
    return grudge;
  }
  if (nearestRival(state, rider, -1, strike)) {
    return -1;
  }
  if (nearestRival(state, rider, 1, strike)) {
    return 1;
  }
  return 0;
};

const takeWeapon = (
  state: RaceState,
  rider: RiderState,
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
    rider: rider.id,
    target: target.id,
    weapon: rider.weapon,
  });
};

interface Strike {
  readonly attack: AttackKind;
  readonly side: number;
  readonly striker: RiderState;
  readonly target: RiderState;
  readonly weapon: WeaponKind;
  takesWeapon: boolean;
}

interface Melee {
  readonly parties: Party[];
  partyCount: number;
  readonly strikes: (Strike | undefined)[];
  readonly thieves: (Strike | undefined)[];
}

const meleeOf = raceOwned((): Melee => ({
  parties: [],
  partyCount: 0,
  strikes: [],
  thieves: [],
}));

const finishSwing = (state: RaceState, rider: RiderState): void => {
  rider.attack = "none";
  rider.attackTicks = 0;
  if (rider.weapon === "none" || rider.weaponHits > 0) {
    return;
  }
  const { weapon } = rider;
  disarm(rider);
  state.events.push({ kind: "weaponBroken", rider: rider.id, weapon });
};

const landHit = (
  state: RaceState,
  { attack, side, striker, takesWeapon, target, weapon }: Strike
): void => {
  const strike = strikeOf(attack, weapon);
  target.stamina = Math.max(0, target.stamina - strike.damage);
  target.lateralSpeed += side * strike.shove;
  target.speed *= 1 - HIT_SPEED_LOSS;
  target.hitStun = HIT_STUN_TICKS;
  target.lastHitBy = striker.id;
  target.lastHitTick = state.tick;
  if (target.attack !== "none") {
    finishSwing(state, target);
  }
  state.events.push({
    attack,
    kind: "hit",
    rider: striker.id,
    target: target.id,
    weapon,
  });
  if (takesWeapon) {
    takeWeapon(state, striker, target);
  }
};

const followingThrough = (rider: RiderState): boolean =>
  rider.attack !== "none" &&
  rider.attack !== "kick" &&
  rider.attackTicks <= strikeOf(rider.attack, rider.weapon).strikeTick;

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

const aimStrike = (state: RaceState, rider: RiderState): Strike | undefined => {
  if (!canFight(rider) || rider.attack === "none") {
    return undefined;
  }
  const strike = strikeOf(rider.attack, rider.weapon);
  if (rider.attackTicks - 1 !== strike.strikeTick) {
    return undefined;
  }
  const target = strikeTarget(state, rider, rider.attackSide, strike);
  if (!target) {
    return undefined;
  }
  return {
    attack: rider.attack,
    side: rider.attackSide,
    striker: rider,
    takesWeapon: false,
    target,
    weapon: rider.attack === "swing" ? rider.weapon : "none",
  };
};

const reachOf = ({ striker, target }: Strike): number =>
  Math.abs(target.s - striker.s) + Math.abs(target.x - striker.x);

const covets = (strike: Strike | undefined): strike is Strike =>
  strike?.attack === "kick" &&
  strike.striker.weapon === "none" &&
  strike.target.weaponHits > 0;

const pickThieves = (state: RaceState, melee: Melee): void => {
  const { strikes, thieves } = melee;
  for (let index = 0; index < state.riders.length; index += 1) {
    thieves[index] = undefined;
  }
  for (const strike of strikes) {
    if (covets(strike)) {
      const rival = thieves[strike.target.id];
      if (!rival || reachOf(strike) < reachOf(rival)) {
        thieves[strike.target.id] = strike;
      }
    }
  }
  for (const strike of strikes) {
    if (strike && thieves[strike.target.id] === strike) {
      strike.takesWeapon = true;
    }
  }
};

const wearWeapons = (strikes: readonly (Strike | undefined)[]): void => {
  for (const strike of strikes) {
    if (strike && strike.weapon !== "none") {
      strike.striker.weaponHits -= 1;
    }
  }
};

const settleStrikes = (
  state: RaceState,
  melee: Melee
): readonly (Strike | undefined)[] => {
  const { strikes } = melee;
  for (let index = 0; index < state.riders.length; index += 1) {
    const rider = state.riders[index];
    strikes[index] = rider ? aimStrike(state, rider) : undefined;
  }
  strikes.length = state.riders.length;
  wearWeapons(strikes);
  pickThieves(state, melee);
  return strikes;
};

export const coolDown = (state: RaceState): void => {
  for (const rider of state.riders) {
    rider.attackCooldown = Math.max(0, rider.attackCooldown - 1);
    rider.hitStun = Math.max(0, rider.hitStun - 1);
  }
};

export const landStrikes = (state: RaceState): void => {
  const strikes = settleStrikes(state, meleeOf(state));
  for (const strike of strikes) {
    if (strike) {
      landHit(state, strike);
    }
  }
};

export const stepAttack = (
  state: RaceState,
  rider: RiderState,
  input: RiderInput
): void => {
  if (!canFight(rider)) {
    rider.attack = "none";
    rider.attackTicks = 0;
    return;
  }
  if (rider.attack !== "none") {
    rider.attackTicks = Math.max(0, rider.attackTicks - 1);
    if (rider.attackTicks <= 0) {
      finishSwing(state, rider);
    } else if (!(followingThrough(rider) && input.punch && !input.kick)) {
      return;
    }
  }
  if (rider.hitStun > 0 || rider.attackCooldown > 0) {
    return;
  }
  if (rider.attack !== "none") {
    finishSwing(state, rider);
  }
  const wanted = wantedAttack(rider, input);
  if (wanted === "none") {
    return;
  }
  const strike = strikeOf(wanted, rider.weapon);
  const side = rivalSide(state, rider, strike) || (input.steer < 0 ? -1 : 1);
  rider.attack = wanted;
  rider.attackSide = side;
  rider.attackTicks = strike.ticks;
  rider.attackCooldown = strike.cooldown;
  state.events.push({
    attack: wanted,
    kind: "attack",
    rider: rider.id,
    side,
    weapon: wanted === "swing" ? rider.weapon : "none",
  });
};

export type ThrowRider = (
  state: RaceState,
  rider: RiderState,
  cause: "rider",
  bikeKeep: number,
  bodyKeep: number,
  speedAtImpact: number
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
  touchedBy: RiderId | null;
  touchedGap: number;
}

interface Party {
  rider: RiderState;
  readonly jolt: Jolt;
}

const untouched: Readonly<Jolt> = {
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
  touchedBy: null,
  touchedGap: Number.POSITIVE_INFINITY,
};

const resetJolt = (jolt: Jolt): void => {
  jolt.behind = untouched.behind;
  jolt.nudge = untouched.nudge;
  jolt.shift = untouched.shift;
  jolt.shove = untouched.shove;
  jolt.shoved = untouched.shoved;
  jolt.speedCap = untouched.speedCap;
  jolt.speedGain = untouched.speedGain;
  jolt.speedLoss = untouched.speedLoss;
  jolt.struckGap = untouched.struckGap;
  jolt.struckSpeed = untouched.struckSpeed;
  jolt.touchedBy = untouched.touchedBy;
  jolt.touchedGap = untouched.touchedGap;
};

const createParty = (rider: RiderState): Party => ({
  jolt: { ...untouched },
  rider,
});

const joinParty = (melee: Melee, rider: RiderState): void => {
  const party = melee.parties[melee.partyCount];
  if (party) {
    party.rider = rider;
    resetJolt(party.jolt);
  } else {
    melee.parties[melee.partyCount] = createParty(rider);
  }
  melee.partyCount += 1;
};

const touch = (party: Party, other: Party): void => {
  const gap =
    Math.abs(other.rider.s - party.rider.s) +
    Math.abs(other.rider.x - party.rider.x);
  if (gap < party.jolt.touchedGap) {
    party.jolt.touchedGap = gap;
    party.jolt.touchedBy = other.rider.id;
  }
};

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
  if (left.rider.attackCooldown < CONTACT_COOLDOWN_TICKS) {
    state.events.push({
      kind: "riderContact",
      other: right.rider.id,
      rider: left.rider.id,
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
  front.jolt.speedGain += Math.min(
    SOFT_SHUNT,
    Math.max(0, closing) * SHUNT_SHARE
  );
  state.events.push({
    kind: "riderContact",
    other: front.rider.id,
    rider: rear.rider.id,
  });
};

const roomLastTick = (gap: number, closing: number, reach: number): number =>
  Math.abs(gap - closing * TICK_SECONDS) - reach;

const entryShare = (room: number, gap: number, reach: number): number =>
  room / (room + reach - Math.abs(gap));

const cameFromBehind = (left: RiderState, right: RiderState): boolean => {
  const gapS = right.s - left.s;
  const gapX = right.x - left.x;
  const roomS = roomLastTick(gapS, right.speed - left.speed, REACH_S);
  const roomX = roomLastTick(
    gapX,
    right.lateralSpeed - left.lateralSpeed,
    REACH_X
  );
  if (roomS >= 0 && roomX >= 0) {
    return entryShare(roomS, gapS, REACH_S) >= entryShare(roomX, gapX, REACH_X);
  }
  if (roomS < 0 && roomX < 0) {
    return Math.abs(gapS) - REACH_S >= Math.abs(gapX) - REACH_X;
  }
  return roomS >= 0;
};

const meet = (state: RaceState, left: Party, right: Party): void => {
  const gapS = right.rider.s - left.rider.s;
  const gapX = right.rider.x - left.rider.x;
  if (Math.abs(gapS) >= REACH_S || Math.abs(gapX) >= REACH_X) {
    return;
  }
  touch(left, right);
  touch(right, left);
  if (!cameFromBehind(left.rider, right.rider)) {
    shoveApart(state, left, right, gapX, REACH_X - Math.abs(gapX));
  } else if (gapS > 0) {
    rearEnd(state, left, right);
  } else {
    rearEnd(state, right, left);
  }
};

const bumpLossOf = (rider: RiderState, shoved: boolean): number => {
  if (!shoved) {
    return 0;
  }
  const loss = Math.min(
    BUMP_SPEED_LOSS,
    Math.max(0, BUMP_LOSS_PER_SECOND - rider.bumpLoss)
  );
  rider.bumpLoss += loss;
  return loss;
};

const settle = (
  state: RaceState,
  { jolt, rider }: Party,
  throwRider: ThrowRider
): void => {
  if (jolt.touchedBy !== null) {
    rider.lastHitBy = jolt.touchedBy;
    rider.lastHitTick = state.tick;
  }
  rider.x += jolt.shift;
  if (jolt.shoved) {
    rider.lateralSpeed = clamp(jolt.shove, -SIDE_SHOVE, SIDE_SHOVE);
  }
  rider.lateralSpeed += jolt.nudge;
  if (jolt.struckGap < Number.POSITIVE_INFINITY) {
    const speedAtImpact = rider.speed;
    rider.speed = jolt.struckSpeed * 0.9;
    throwRider(state, rider, "rider", 0.4, 0.6, speedAtImpact);
    return;
  }
  const speedLoss = jolt.speedLoss + bumpLossOf(rider, jolt.shoved);
  rider.speed =
    Math.max(0, Math.min(rider.speed, jolt.speedCap) - speedLoss) +
    jolt.speedGain;
  rider.s = Math.min(rider.s, jolt.behind);
};

export const stepRiderContacts = (
  state: RaceState,
  track: Track,
  throwRider: ThrowRider
): void => {
  const melee = meleeOf(state);
  const { parties } = melee;
  melee.partyCount = 0;
  for (const rider of state.riders) {
    if (canFight(rider)) {
      joinParty(melee, rider);
    }
  }
  for (let position = 0; position < melee.partyCount; position += 1) {
    const left = parties[position];
    for (let other = position + 1; other < melee.partyCount; other += 1) {
      const right = parties[other];
      if (left && right) {
        meet(state, left, right);
      }
    }
  }
  for (let position = 0; position < melee.partyCount; position += 1) {
    const party = parties[position];
    if (party) {
      settle(state, party, throwRider);
    }
  }
  for (const rider of state.riders) {
    rider.x = clamp(rider.x, -track.vergeHalfWidth, track.vergeHalfWidth);
    rider.bumpLoss = Math.max(
      0,
      rider.bumpLoss - BUMP_LOSS_PER_SECOND * TICK_SECONDS
    );
  }
};
