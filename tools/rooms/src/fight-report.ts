import * as Schema from "effect/Schema";

export type FightKind = "kick" | "punch";

const probeRider = Schema.Struct({
  attack: Schema.String,
  attackTicks: Schema.Number,
  hitStun: Schema.Number,
  lastHitTick: Schema.Number,
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

const stamped = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Array(Schema.Struct({ at: Schema.Number, ...fields }));

export const takenFrames = Schema.Struct({
  attacks: stamped({
    attack: Schema.String,
    rider: Schema.Number,
    tick: Schema.Number,
  }),
  falls: stamped({
    by: Schema.NullOr(Schema.Number),
    cause: Schema.String,
    rider: Schema.Number,
    s: Schema.Number,
    tick: Schema.Number,
  }),
  frames: Schema.Array(probeFrame),
  lostButtons: stamped({ tick: Schema.Number }),
  placed: stamped({ tick: Schema.Number, x: Schema.Array(Schema.Number) }),
  presses: stamped({ code: Schema.String }),
  sends: stamped({ through: Schema.Number }),
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
  readonly drawnErrorAtHitMetres: number | null;
  readonly drawnFrames: number;
  readonly flinchFrames: number;
  readonly hitLanded: boolean;
  readonly holdMs: number | null;
  readonly kind: FightKind;
  readonly lead: number | null;
  readonly lostPresses: number;
  readonly passed: boolean;
  readonly pressToLandMs: number | null;
  readonly pressToSendMs: number | null;
  readonly pressToShownMs: number | null;
  readonly pressToStrikeOutMs: number | null;
  readonly rttAtPressMs: number | null;
  readonly sendToVictimMs: number | null;
  readonly staminaLost: number;
  readonly strikeOutBeforeFlinchMs: number | null;
  readonly strikeOutBeforeShoveMs: number | null;
  readonly victim: number;
  readonly victimConfirmToDrawnMs: number | null;
}

const FULL_REACH = 0.99;

const gap = (
  from: number | undefined,
  to: number | undefined
): number | null => (from === undefined || to === undefined ? null : to - from);

const firstAfter = <Entry extends { readonly at: number }>(
  list: readonly Entry[],
  at: number
): Entry | undefined => list.find((entry) => entry.at >= at);

const network = (
  kind: FightKind,
  attacker: number,
  pressAt: number,
  seen: TakenFrames,
  felt: TakenFrames
) => {
  const sentAt = firstAfter(seen.sends, pressAt)?.at;
  const ran = (one: TakenFrames["attacks"][number]) =>
    one.rider === attacker && one.attack === kind && one.at >= pressAt;
  const atPress = firstAfter(seen.frames, pressAt);
  const ownConfirm = gap(sentAt, seen.attacks.find(ran)?.at);
  const rttAtPressMs = atPress?.rtt ?? null;
  return {
    holdMs:
      ownConfirm === null || rttAtPressMs === null
        ? null
        : ownConfirm - rttAtPressMs,
    lead: atPress === undefined ? null : atPress.tick - atPress.heard,
    lostPresses: seen.lostButtons.filter((lost) => lost.at >= pressAt).length,
    pressToSendMs: gap(pressAt, sentAt),
    rttAtPressMs,
    sendToVictimMs: gap(sentAt, felt.attacks.find(ran)?.at),
    victimHeardAt: felt.attacks.find(ran)?.at,
  };
};

const drawnError = (
  attacker: number,
  frame: ProbeFrame | undefined,
  felt: TakenFrames
): number | null => {
  const server = felt.placed.find((one) => one.tick === frame?.tick);
  const drawn = frame?.drawn[attacker]?.x;
  const truth = server?.x[attacker];
  return drawn === undefined || truth === undefined
    ? null
    : Math.abs(drawn - truth);
};

const victimScreen = (
  kind: FightKind,
  attacker: number,
  victim: number,
  after: readonly ProbeFrame[]
) => {
  const shown = after.filter((frame) => frame.drawn[attacker]?.pose === kind);
  const firstHitTick = after.at(0)?.predicted[victim]?.lastHitTick;
  const staminas = after.map((frame) => frame.confirmed[victim]?.stamina ?? 0);
  const before = staminas.at(0) ?? 0;
  const flinching = after.filter(
    (frame) => (frame.drawn[victim]?.flinch ?? 0) > 0
  );
  return {
    flinching,
    knockedOff: after.some(
      (frame) => frame.predicted[victim]?.mode !== "riding"
    ),
    landed: after.find(
      (frame) => (frame.confirmed[victim]?.stamina ?? before) < before
    ),
    lost: before - Math.min(before, ...staminas),
    shove: after.find(
      (frame) => frame.predicted[victim]?.lastHitTick !== firstHitTick
    ),
    shown,
    strikeOut: shown.find(
      (frame) => (frame.drawn[attacker]?.reach ?? 0) >= FULL_REACH
    ),
  };
};

export const fightRow = (
  kind: FightKind,
  attacker: number,
  victim: number,
  pressAt: number,
  seen: TakenFrames,
  felt: TakenFrames
): FightRow => {
  const after = felt.frames.filter((frame) => frame.at >= pressAt);
  const screen = victimScreen(kind, attacker, victim, after);
  const { victimHeardAt, ...stages } = network(
    kind,
    attacker,
    pressAt,
    seen,
    felt
  );
  const outAt = screen.strikeOut?.at;
  const strikeOutBeforeFlinchMs = gap(outAt, screen.flinching.at(0)?.at);
  const strikeOutBeforeShoveMs = gap(outAt, screen.shove?.at);
  const hitLanded = screen.landed !== undefined;
  const flinchInOrder = screen.knockedOff
    ? strikeOutBeforeFlinchMs === null || strikeOutBeforeFlinchMs >= 0
    : (strikeOutBeforeFlinchMs ?? -1) >= 0;
  const inOrder = flinchInOrder && (strikeOutBeforeShoveMs ?? -1) >= 0;
  return {
    ...stages,
    attacker,
    drawnErrorAtHitMetres: drawnError(attacker, screen.shove, felt),
    drawnFrames: screen.shown.length,
    flinchFrames: screen.flinching.length,
    hitLanded,
    kind,
    passed: outAt !== undefined && (!hitLanded || inOrder),
    pressToLandMs: gap(pressAt, screen.landed?.at),
    pressToShownMs: gap(pressAt, screen.shown.at(0)?.at),
    pressToStrikeOutMs: gap(pressAt, outAt),
    staminaLost: screen.lost,
    strikeOutBeforeFlinchMs,
    strikeOutBeforeShoveMs,
    victim,
    victimConfirmToDrawnMs: gap(victimHeardAt, screen.shown.at(0)?.at),
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
