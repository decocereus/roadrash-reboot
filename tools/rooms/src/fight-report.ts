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
  flinch: Schema.Number,
  pose: Schema.String,
  reach: Schema.Number,
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
  attacks: Schema.Array(
    Schema.Struct({
      at: Schema.Number,
      attack: Schema.String,
      rider: Schema.Number,
      tick: Schema.Number,
    })
  ),
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
  readonly flinchFrames: number;
  readonly hitLanded: boolean;
  readonly kind: FightKind;
  readonly lead: number;
  readonly legOutBeforeHitMs: number | null;
  readonly passed: boolean;
  readonly pressToLandMs: number | null;
  readonly pressToShownMs: number | null;
  readonly staminaLost: number;
  readonly victim: number;
}

const FULL_REACH = 0.99;

const gapFrom = (from: number, to: number | undefined): number | null =>
  to === undefined ? null : to - from;

const hitFelt = (
  victim: number,
  after: readonly ProbeFrame[],
  before: number
) => {
  const staminaOf = (frame: ProbeFrame | undefined): number =>
    frame?.confirmed[victim]?.stamina ?? before;
  const flinching = after.filter(
    (frame) => (frame.drawn[victim]?.flinch ?? 0) > 0
  );
  return {
    flinchAt: flinching.at(0)?.at,
    flinchFrames: flinching.length,
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
  const shown = after.filter((frame) => frame.drawn[attacker]?.pose === kind);
  const legOut = shown.find(
    (frame) => (frame.drawn[attacker]?.reach ?? 0) >= FULL_REACH
  );
  const before = victimFrames.at(0)?.confirmed[victim]?.stamina ?? 0;
  const { flinchAt, flinchFrames, landed, lost } = hitFelt(
    victim,
    after,
    before
  );
  const hitLanded = landed !== undefined;
  const legOutBeforeHitMs =
    legOut === undefined || flinchAt === undefined
      ? null
      : flinchAt - legOut.at;
  return {
    attacker,
    drawnFrames: shown.length,
    flinchFrames,
    hitLanded,
    kind,
    lead: (after.at(0)?.tick ?? 0) - (after.at(0)?.heard ?? 0),
    legOutBeforeHitMs,
    passed:
      legOut !== undefined && (!hitLanded || (legOutBeforeHitMs ?? -1) >= 0),
    pressToLandMs: gapFrom(pressAt, landed?.at),
    pressToShownMs: gapFrom(pressAt, shown.at(0)?.at),
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
