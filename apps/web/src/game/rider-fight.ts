import { HIT_STUN_TICKS } from "@racer/sim/combat";
import { clamp, riderOf } from "@racer/sim/state";
import type {
  AttackKind,
  HeardFight,
  RiderId,
  WeaponKind,
} from "@racer/sim/state";
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

interface HeardStrike {
  readonly attack: AttackKind;
  readonly side: number;
  readonly tick: number;
  readonly weapon: WeaponKind;
}

interface ShownHit {
  readonly by: RiderId;
  tick: number;
}

export interface RiderFight {
  attack: AttackKind | "none";
  elapsed: number;
  flinchLeft: number;
  readonly hitsShown: ShownHit[];
  newestHit: number;
  nextStrikeFrom: number;
  readonly queued: HeardStrike[];
  side: number;
  startTick: number;
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
  hitsShown: [],
  newestHit: Number.NEGATIVE_INFINITY,
  nextStrikeFrom: Number.NEGATIVE_INFINITY,
  queued: [],
  side: 1,
  startTick: 0,
  weapon: "none",
});

const begin = (
  fight: RiderFight,
  heard: HeardStrike,
  drawnTick: number
): void => {
  const strike = strikeOf(heard.attack, heard.weapon);
  fight.attack = heard.attack;
  fight.elapsed = clamp(
    drawnTick - heard.tick,
    0,
    strike.ticks - strike.strikeTick
  );
  fight.side = heard.side;
  fight.startTick = heard.tick;
  fight.weapon = heard.weapon;
};

export const fightTick = (
  fight: RiderFight,
  airborne: boolean,
  drawnTick: number
): void => {
  fight.attack = airborne ? "none" : fight.attack;
  fight.elapsed += 1;
  fight.flinchLeft = Math.max(0, fight.flinchLeft - 1);
  if (
    fight.attack !== "none" &&
    fight.elapsed >= strikeOf(fight.attack, fight.weapon).ticks
  ) {
    fight.attack = "none";
  }
  const next = fight.attack === "none" ? fight.queued.shift() : undefined;
  if (next) {
    begin(fight, next, drawnTick);
  }
};

const runsAt = (
  attack: AttackKind,
  weapon: WeaponKind,
  from: number,
  tick: number
): boolean => from <= tick && tick < from + strikeOf(attack, weapon).ticks;

const strikeHeard = (
  fight: RiderFight,
  heard: HeardStrike,
  drawnTick: number
) => {
  if (heard.tick < fight.nextStrikeFrom) {
    return;
  }
  fight.nextStrikeFrom =
    heard.tick + strikeOf(heard.attack, heard.weapon).cooldown;
  if (fight.attack === "none") {
    begin(fight, heard, drawnTick);
  } else {
    fight.queued.push(heard);
  }
};

const withinStun = (shown: ShownHit, tick: number): boolean =>
  Math.abs(shown.tick - tick) < HIT_STUN_TICKS;

const struckAt = (fight: RiderFight, tick: number, by: RiderId): void => {
  if (
    fight.attack !== "none" &&
    runsAt(fight.attack, fight.weapon, fight.startTick, tick)
  ) {
    fight.attack = "none";
  }
  const cut = fight.queued.findIndex((queued) =>
    runsAt(queued.attack, queued.weapon, queued.tick, tick)
  );
  if (cut !== -1) {
    fight.queued.splice(cut, 1);
  }
  const running = fight.hitsShown.some((shown) => withinStun(shown, tick));
  const same = fight.hitsShown.find(
    (shown) => shown.by === by && withinStun(shown, tick)
  );
  if (same) {
    same.tick = tick;
  } else {
    fight.hitsShown.push({ by, tick });
  }
  if (!running && tick > fight.newestHit - HIT_STUN_TICKS) {
    fight.flinchLeft = HIT_STUN_TICKS;
  }
  fight.newestHit = Math.max(fight.newestHit, tick);
  const stale = fight.newestHit - HIT_STUN_TICKS;
  for (let at = fight.hitsShown.length - 1; at >= 0; at -= 1) {
    if ((fight.hitsShown[at]?.tick ?? stale) <= stale) {
      fight.hitsShown.splice(at, 1);
    }
  }
};

const hitRefused = (fight: RiderFight, tick: number, by: RiderId): void => {
  const refused = fight.hitsShown.findIndex(
    (shown) => shown.by === by && withinStun(shown, tick)
  );
  if (refused === -1) {
    return;
  }
  fight.hitsShown.splice(refused, 1);
  if (!fight.hitsShown.some((shown) => withinStun(shown, tick))) {
    fight.flinchLeft = 0;
  }
};

export const fightHeard = (
  fighters: readonly { readonly fight: RiderFight }[],
  heard: HeardFight,
  drawnTick: number
): void => {
  if ("refused" in heard) {
    const struck = riderOf(fighters, heard.refused.target)?.fight;
    if (struck) {
      hitRefused(struck, heard.tick, heard.refused.rider);
    }
    return;
  }
  const { event, tick } = heard;
  if (event.kind === "attack") {
    const fight = riderOf(fighters, event.rider)?.fight;
    if (fight) {
      strikeHeard(fight, { ...event, tick }, drawnTick);
    }
    return;
  }
  const struck = riderOf(fighters, event.target)?.fight;
  if (struck) {
    struckAt(struck, tick, event.rider);
  }
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
