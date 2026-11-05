import { HIT_STUN_TICKS } from "@racer/sim/combat";
import { clamp } from "@racer/sim/state";
import type { AttackKind, RaceEvent, WeaponKind } from "@racer/sim/state";
import { strikeOf } from "@racer/sim/weapons";

import type { RiderPose } from "./figure-pose.ts";

const WINDUP_TICKS = 3;
const SWING_LEAD_TICKS = 3;
const HOLD_TICKS = 4;
const RETURN_TICKS = 5;
const KICK_RISE_TICKS = 2.5;
const KICK_HOLD_TICKS = 2;
const KICK_RETRACT_TICKS = 3;
const KICK_DROP_FROM = 8;
const KICK_DROP_TICKS = 5;

export interface RiderFight {
  attack: AttackKind | "none";
  elapsed: number;
  flinchLeft: number;
  side: number;
  weapon: WeaponKind;
}

export interface StrikeFrame {
  pose: RiderPose;
  reach: number;
  rise: number;
}

export const quietFight = (): RiderFight => ({
  attack: "none",
  elapsed: 0,
  flinchLeft: 0,
  side: 1,
  weapon: "none",
});

export const fightTick = (fight: RiderFight, airborne: boolean): void => {
  fight.attack = airborne ? "none" : fight.attack;
  fight.elapsed += 1;
  fight.flinchLeft = Math.max(0, fight.flinchLeft - 1);
};

export const fightHeard = (fight: RiderFight, event: RaceEvent): void => {
  if (event.kind === "attack") {
    fight.attack = event.attack;
    fight.elapsed = 0;
    fight.side = event.side;
    fight.weapon = event.weapon;
  }
};

export const flinchHeard = (fight: RiderFight): void => {
  fight.flinchLeft = HIT_STUN_TICKS;
};

export const fightFlinch = (
  fight: RiderFight,
  hitStun: number,
  subTick: number
): number =>
  Math.max(0, Math.max(hitStun, fight.flinchLeft) - subTick) / HIT_STUN_TICKS;

const strikeAt = (
  frame: StrikeFrame,
  pose: RiderPose,
  reach: number,
  rise = 0
): true => {
  frame.pose = pose;
  frame.reach = reach;
  frame.rise = rise;
  return true;
};

const windingUp = (
  attack: AttackKind,
  elapsed: number,
  land: number,
  frame: StrikeFrame
): true => {
  if (attack !== "swing") {
    return strikeAt(frame, attack, elapsed / land);
  }
  const lead = land - SWING_LEAD_TICKS;
  if (elapsed < lead) {
    return strikeAt(frame, "windup", Math.min(1, elapsed / WINDUP_TICKS));
  }
  return strikeAt(frame, "swing", (elapsed - lead) / SWING_LEAD_TICKS);
};

const kickFrame = (
  elapsed: number,
  land: number,
  frame: StrikeFrame
): boolean => {
  const dropped = (elapsed - KICK_DROP_FROM) / KICK_DROP_TICKS;
  if (dropped >= 1) {
    return false;
  }
  const rising = 1 - Math.max(0, 1 - elapsed / KICK_RISE_TICKS) ** 2;
  const rise = dropped > 0 ? 1 - dropped * dropped : rising;
  const snap = (elapsed - KICK_RISE_TICKS) / (land - KICK_RISE_TICKS);
  const retract = (elapsed - land - KICK_HOLD_TICKS) / KICK_RETRACT_TICKS;
  return strikeAt(
    frame,
    "kick",
    clamp(Math.min(snap, 1 - retract), 0, 1),
    rise
  );
};

export const strikeFrame = (
  fight: RiderFight,
  subTick: number,
  frame: StrikeFrame
): boolean => {
  if (fight.attack === "none") {
    return false;
  }
  const strike = strikeOf(fight.attack, fight.weapon);
  const land = strike.ticks - strike.strikeTick;
  const elapsed = fight.elapsed + subTick;
  if (elapsed >= strike.ticks) {
    fight.attack = "none";
    return false;
  }
  if (fight.attack === "kick") {
    return kickFrame(elapsed, land, frame);
  }
  const out = fight.attack === "swing" ? "swung" : fight.attack;
  if (elapsed < land) {
    return windingUp(fight.attack, elapsed, land, frame);
  }
  if (elapsed < land + HOLD_TICKS) {
    return strikeAt(frame, out, 1);
  }
  const back = (elapsed - land - HOLD_TICKS) / RETURN_TICKS;
  return back < 1 && strikeAt(frame, out, 1 - back);
};
