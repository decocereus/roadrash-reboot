import * as Schema from "effect/Schema";

export type FightKind = "kick" | "punch";

const probeRider = Schema.Struct({
  attack: Schema.String,
  attackTicks: Schema.Number,
  hitStun: Schema.Number,
  lastHitBy: Schema.NullOr(Schema.Number),
  lastHitTick: Schema.Number,
  mode: Schema.String,
  s: Schema.Number,
  speed: Schema.Number,
  stamina: Schema.Number,
  x: Schema.Number,
});

const drawnRider = Schema.Struct({
  blend: Schema.Number,
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
  placed: stamped({
    riding: Schema.Array(Schema.Boolean),
    tick: Schema.Number,
    x: Schema.Array(Schema.Number),
  }),
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
    victimHeard: felt.attacks.find(ran),
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

interface Heard {
  readonly at: number;
  readonly tick: number;
}

const reactionsTo = (
  attacker: number,
  victim: number,
  after: readonly ProbeFrame[],
  heard: Heard | undefined
) => {
  const since = after.filter(
    (frame) => heard !== undefined && frame.at >= heard.at
  );
  const struck = (frame: ProbeFrame): boolean => {
    const rider = frame.predicted[victim];
    return (
      rider !== undefined &&
      heard !== undefined &&
      rider.lastHitBy === attacker &&
      rider.lastHitTick >= heard.tick
    );
  };
  return {
    flinching: since.filter((frame) => (frame.drawn[victim]?.flinch ?? 0) > 0),
    shove: since.find(struck),
  };
};

const victimScreen = (
  kind: FightKind,
  attacker: number,
  victim: number,
  after: readonly ProbeFrame[]
) => {
  const shown = after.filter((frame) => frame.drawn[attacker]?.pose === kind);
  const staminas = after.map((frame) => frame.confirmed[victim]?.stamina ?? 0);
  const before = staminas.at(0) ?? 0;
  return {
    knockedOff: after.some(
      (frame) => frame.predicted[victim]?.mode !== "riding"
    ),
    landed: after.find(
      (frame) => (frame.confirmed[victim]?.stamina ?? before) < before
    ),
    lost: before - Math.min(before, ...staminas),
    shown,
    strikeOut: shown.find(
      (frame) => (frame.drawn[attacker]?.reach ?? 0) >= FULL_REACH
    ),
  };
};

const notBefore = (outAt: number | undefined, at: number | undefined) =>
  at === undefined || (outAt !== undefined && at >= outAt);

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
  const { victimHeard, ...stages } = network(
    kind,
    attacker,
    pressAt,
    seen,
    felt
  );
  const { flinching, shove } = reactionsTo(
    attacker,
    victim,
    after,
    victimHeard
  );
  const outAt = screen.strikeOut?.at;
  const flinchAt = flinching.at(0)?.at;
  const hitLanded = screen.landed !== undefined;
  const reacted = !hitLanded || flinching.length > 0 || screen.knockedOff;
  return {
    ...stages,
    attacker,
    drawnErrorAtHitMetres: drawnError(attacker, shove, felt),
    drawnFrames: screen.shown.length,
    flinchFrames: flinching.length,
    hitLanded,
    kind,
    passed:
      outAt !== undefined &&
      reacted &&
      notBefore(outAt, shove?.at) &&
      notBefore(outAt, flinchAt),
    pressToLandMs: gap(pressAt, screen.landed?.at),
    pressToShownMs: gap(pressAt, screen.shown.at(0)?.at),
    pressToStrikeOutMs: gap(pressAt, outAt),
    staminaLost: screen.lost,
    strikeOutBeforeFlinchMs: gap(outAt, flinchAt),
    strikeOutBeforeShoveMs: gap(outAt, shove?.at),
    victim,
    victimConfirmToDrawnMs: gap(victimHeard?.at, screen.shown.at(0)?.at),
  };
};

interface TrackError {
  readonly errorP95Metres: number;
  readonly frames: number;
  readonly worstStepMetres: number;
}

export interface RiderTrack {
  readonly drawn: TrackError;
  readonly guessed: TrackError;
  readonly rider: number;
}

const P95 = 0.95;

const p95 = (values: readonly number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * P95))] ?? 0
  );
};

interface Sample {
  readonly place: number;
  readonly truth: number;
}

interface TrackFrame {
  readonly drawn: Sample;
  readonly guessed: Sample;
}

const trackError = (
  frames: readonly (TrackFrame | null)[],
  pick: (one: TrackFrame) => Sample
): TrackError => {
  const errors: number[] = [];
  let worstStepMetres = 0;
  for (const [index, one] of frames.entries()) {
    if (one === null) {
      continue;
    }
    const { place, truth } = pick(one);
    errors.push(Math.abs(place - truth));
    const before = frames[index - 1];
    if (before) {
      worstStepMetres = Math.max(
        worstStepMetres,
        Math.abs(place - pick(before).place)
      );
    }
  }
  return {
    errorP95Metres: p95(errors),
    frames: errors.length,
    worstStepMetres,
  };
};

export const riderTrack = (taken: TakenFrames, rider: number): RiderTrack => {
  const riding = new Map(
    taken.placed.flatMap((one) => {
      const x = one.x[rider];
      return x === undefined || one.riding[rider] !== true
        ? []
        : [[one.tick, x] as const];
    })
  );
  const frames = taken.frames.map((frame): TrackFrame | null => {
    const now = riding.get(frame.tick);
    const was = riding.get(frame.tick - 1);
    const drawn = frame.drawn[rider];
    const guessed = frame.predicted[rider];
    return now === undefined ||
      was === undefined ||
      drawn === undefined ||
      guessed?.mode !== "riding"
      ? null
      : {
          drawn: { place: drawn.x, truth: was + (now - was) * drawn.blend },
          guessed: { place: guessed.x, truth: now },
        };
  });
  return {
    drawn: trackError(frames, (one) => one.drawn),
    guessed: trackError(frames, (one) => one.guessed),
    rider,
  };
};
