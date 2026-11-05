import { strikeOf } from "@racer/sim/weapons";
import * as Schema from "effect/Schema";

export type FightKind = "kick" | "punch";

const probeRider = Schema.Struct({
  attack: Schema.String,
  attackTicks: Schema.Number,
  hitStun: Schema.Number,
  mode: Schema.String,
  s: Schema.Number,
  speed: Schema.Number,
  stamina: Schema.Number,
  x: Schema.Number,
});

const drawnRider = Schema.Struct({
  attack: Schema.String,
  elapsed: Schema.Number,
  flinch: Schema.Number,
  x: Schema.Number,
});

const probeFrame = Schema.Struct({
  at: Schema.Number,
  confirmed: Schema.Array(probeRider),
  drawn: Schema.Array(drawnRider),
  heard: Schema.Number,
  predicted: Schema.Array(probeRider),
  rtt: Schema.Number,
  tick: Schema.Number,
});

export type ProbeFrame = typeof probeFrame.Type;

export const takenFrames = Schema.Struct({
  frames: Schema.Array(probeFrame),
  presses: Schema.Array(
    Schema.Struct({ at: Schema.Number, code: Schema.String })
  ),
});

export type TakenFrames = typeof takenFrames.Type;

export const positions = Schema.Struct({
  aMode: Schema.String,
  aS: Schema.Number,
  aSpeed: Schema.Number,
  aX: Schema.Number,
  bMode: Schema.String,
  bS: Schema.Number,
  bSpeed: Schema.Number,
  bX: Schema.Number,
  tick: Schema.Number,
});

export type Positions = typeof positions.Type;

export interface FightRow {
  readonly attacker: number;
  readonly drawnFrames: number;
  readonly firstElapsed: number | null;
  readonly flinchFrames: number;
  readonly hitLanded: boolean;
  readonly kind: FightKind;
  readonly lead: number;
  readonly passed: boolean;
  readonly pressToLandMs: number | null;
  readonly pressToShownMs: number | null;
  readonly shownBeforeLandMs: number | null;
  readonly staminaLost: number;
  readonly victim: number;
}

const MOST_LATE_ELAPSED = 2;

const gapFrom = (from: number, to: number | undefined): number | null =>
  to === undefined ? null : to - from;

const strikeSeen = (
  kind: FightKind,
  attacker: number,
  shown: readonly ProbeFrame[]
) => {
  const firstElapsed = shown.at(0)?.drawn[attacker]?.elapsed ?? null;
  const lastElapsed = shown.at(-1)?.drawn[attacker]?.elapsed ?? 0;
  const strike = strikeOf(kind, "none");
  return {
    firstElapsed,
    seenWhole:
      firstElapsed !== null &&
      firstElapsed <= MOST_LATE_ELAPSED &&
      lastElapsed >= strike.ticks - strike.strikeTick,
  };
};

const hitFelt = (
  victim: number,
  after: readonly ProbeFrame[],
  before: number
) => {
  const staminaOf = (frame: ProbeFrame | undefined): number =>
    frame?.confirmed[victim]?.stamina ?? before;
  return {
    flinchFrames: after.filter(
      (frame) => (frame.drawn[victim]?.flinch ?? 0) > 0
    ).length,
    landed: after.find((frame) => staminaOf(frame) < before),
    lost: before - staminaOf(after.at(-1)),
  };
};

export const fightRow = (
  kind: FightKind,
  attacker: number,
  victim: number,
  pressAt: number,
  victimFrames: readonly ProbeFrame[]
): FightRow => {
  const after = victimFrames.filter((frame) => frame.at >= pressAt);
  const shown = after.filter((frame) => frame.drawn[attacker]?.attack === kind);
  const { firstElapsed, seenWhole } = strikeSeen(kind, attacker, shown);
  const before = victimFrames.at(0)?.confirmed[victim]?.stamina ?? 0;
  const { flinchFrames, landed, lost } = hitFelt(victim, after, before);
  const shownAt = shown.at(0)?.at;
  const hitLanded = landed !== undefined;
  return {
    attacker,
    drawnFrames: shown.length,
    firstElapsed,
    flinchFrames,
    hitLanded,
    kind,
    lead: (after.at(0)?.tick ?? 0) - (after.at(0)?.heard ?? 0),
    passed: seenWhole && (!hitLanded || flinchFrames > 0),
    pressToLandMs: gapFrom(pressAt, landed?.at),
    pressToShownMs: gapFrom(pressAt, shownAt),
    shownBeforeLandMs:
      shownAt === undefined || landed === undefined
        ? null
        : landed.at - shownAt,
    staminaLost: lost,
    victim,
  };
};

export const worstPop = (
  frames: readonly ProbeFrame[],
  rider: number
): number => {
  let worst = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const from = frames[index - 1]?.drawn[rider]?.x;
    const to = frames[index]?.drawn[rider]?.x;
    if (from !== undefined && to !== undefined) {
      worst = Math.max(worst, Math.abs(to - from));
    }
  }
  return worst;
};
