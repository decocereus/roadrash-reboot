import {
  BUTTONS_OF_A_CONTROL,
  coasting,
  holds,
  pressing,
  startsAStrike,
  withoutButtons,
} from "./control.ts";
import type { Button } from "./control.ts";
import { createRace, stepRace } from "./race.ts";
import {
  clearFrame,
  createScratch,
  createTickFrame,
  sameFrame,
  scratchFor,
} from "./room-frame.ts";
import type { TickFrame } from "./room-frame.ts";
import { createHitLedger } from "./room-hits.ts";
import { MOST_BATCHED_CONTROLS, writeInput } from "./room-wire.ts";
import { INPUT_HORIZON, seatsOf } from "./room.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { hashRace, restoreInto, writeSnapshot } from "./snapshot.ts";
import { NO_FIGHTS, isFightEvent, riderOf } from "./state.ts";
import type {
  Control,
  HeardFight,
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderId,
  RiderState,
} from "./state.ts";

const NO_EVENTS: readonly RaceEvent[] = [];
const NO_CORRECTIONS: readonly RiderCorrection[] = [];

const FELT_JUMP_METRES = 0.25;

const LAG_WINDOW_TICKS = 60;
const MOST_RETRY_TICKS = 60;
const SHRINK_EVERY_TICKS = 12;
const LAGGING_FROM_TICKS = 20;

const JUMP_CAUSES = ["behindServer", "otherRiders", "ownControl"] as const;

type JumpCause = (typeof JUMP_CAUSES)[number];

interface JumpTally {
  felt: number;
  totalMetres: number;
  worstMetres: number;
}

interface RoomStats {
  crashesAfterCorrection: number;
  rollbacks: number;
  resimulatedTicks: number;
  desyncs: number;
  refusedPredictions: number;
  retriedPresses: number;
  readonly jumps: Record<JumpCause, JumpTally>;
  readonly worstJump: { metres: number; roadMetres: number; tick: number };
}

export interface RiderCorrection {
  air: number;
  heading: number;
  lateralSpeed: number;
  lean: number;
  readonly rider: RiderId;
  s: number;
  speed: number;
  x: number;
}

export interface RoomClient {
  readonly confirmed: RaceState;
  readonly correcting: () => boolean;
  readonly lagging: () => boolean;
  readonly lostControls: () => number;
  readonly mine: RiderState;
  readonly plannedThrough: () => number;
  readonly predicted: RaceState;
  readonly stats: RoomStats;
  readonly predict: (control: Control, delay?: number) => boolean;
  readonly confirm: (frame: TickFrame, hash: Uint32Array | null) => void;
  readonly catchUp: (snapshot: DataView) => void;
  readonly settle: (most?: number) => number;
  readonly takeCorrections: () => readonly RiderCorrection[];
  readonly takeEvents: () => readonly RaceEvent[];
  readonly takeFights: () => readonly HeardFight[];
  readonly writeInputs: (view: DataView) => number;
}

interface Remote {
  readonly id: RiderId;
  last: Control;
}

const outOfOrder = (tick: number, after: number): never => {
  throw new RangeError(`The room sent tick ${tick} after tick ${after}.`);
};

const ownPrediction = (event: RaceEvent, me: RiderId): boolean => {
  if (event.rider !== me) {
    return false;
  }
  switch (event.kind) {
    case "crash":
    case "knockedDown": {
      return event.by === null || event.by === me;
    }
    case "riderContact": {
      return false;
    }
    case "attack":
    case "bump":
    case "busted":
    case "finish":
    case "glance":
    case "hazard":
    case "hit":
    case "land":
    case "nearMiss":
    case "pursuit":
    case "remount":
    case "weaponBroken":
    case "weaponTaken":
    case "wrecked": {
      return true;
    }
    default: {
      return event satisfies never;
    }
  }
};

const sameHash = (left: Uint32Array, right: Uint32Array): boolean => {
  for (let word = 0; word < HASH_WORDS; word += 1) {
    if (left[word] !== right[word]) {
      return false;
    }
  }
  return true;
};

const stillCorrection = ({ id }: RiderState): RiderCorrection => ({
  air: 0,
  heading: 0,
  lateralSpeed: 0,
  lean: 0,
  rider: id,
  s: 0,
  speed: 0,
  x: 0,
});

const ringOf = <Value>(fill: () => Value): Value[] =>
  Array.from({ length: INPUT_HORIZON + 1 }, fill);

export const createRoomClient = (
  setup: RaceSetup,
  me: RiderId,
  pilotFromTick: number
): RoomClient => {
  const confirmed = createRace(setup);
  const predicted = createRace(setup);
  const mended = createRace(setup);
  const digest = setupDigest(confirmed, setup.track);
  const scratch = createScratch(confirmed);
  const hash = new Uint32Array(HASH_WORDS);
  const remotes: Remote[] = seatsOf(confirmed)
    .filter((rider) => rider.id !== me)
    .map((rider) => ({ id: rider.id, last: coasting }));
  const mine = seatsOf(predicted).find((rider) => rider.id === me);
  if (!mine) {
    throw new RangeError(`Rider ${me} has no seat in this room.`);
  }
  const ownControls = ringOf(() => coasting);
  const guesses = ringOf(createTickFrame);
  const batch: Control[] = [];
  let heard: RaceEvent[] = [];
  let fights: HeardFight[] = [];
  const mendedFights: HeardFight[] = [];
  const tracked = [...predicted.riders];
  const wasAt = tracked.map(stillCorrection);
  let corrections = tracked.map(stillCorrection);
  let handed = tracked.map(stillCorrection);
  let corrected = false;
  let sentThrough = 0;
  let plannedThrough = 0;
  let sampled = coasting;
  let shrunkAt = Number.NEGATIVE_INFINITY;
  let stale = false;
  let staleCause: JumpCause = "otherRiders";
  let mending = false;
  let mendCause: JumpCause = "otherRiders";
  const overruled = new Uint8Array(LAG_WINDOW_TICKS);
  let overruledTicks = 0;
  let lostControls = 0;
  const pressHeld = BUTTONS_OF_A_CONTROL.map(() => false);
  const pressLanded = BUTTONS_OF_A_CONTROL.map(() => false);
  const missed: Button[] = [];
  let retriedFor = 0;
  let lagging = false;
  const stats: RoomStats = {
    crashesAfterCorrection: 0,
    desyncs: 0,
    jumps: {
      behindServer: { felt: 0, totalMetres: 0, worstMetres: 0 },
      otherRiders: { felt: 0, totalMetres: 0, worstMetres: 0 },
      ownControl: { felt: 0, totalMetres: 0, worstMetres: 0 },
    },
    refusedPredictions: 0,
    resimulatedTicks: 0,
    retriedPresses: 0,
    rollbacks: 0,
    worstJump: { metres: 0, roadMetres: 0, tick: 0 },
  };

  const slotOf = (tick: number): number => tick % ownControls.length;

  const guess = (race: RaceState, tick: number): TickFrame => {
    const frame = guesses[slotOf(tick)] ?? createTickFrame();
    clearFrame(frame, tick);
    const own = riderOf(race.riders, me);
    if (tick >= pilotFromTick) {
      if (own?.controller === "human") {
        frame.handovers.set(me, "pilot");
      }
      for (const remote of remotes) {
        if (riderOf(race.riders, remote.id)?.controller === "human") {
          frame.handovers.set(remote.id, "pilot");
        }
      }
      return frame;
    }
    const control = ownControls[slotOf(tick)] ?? coasting;
    if (own?.controller === "pilot") {
      frame.handovers.set(me, "human");
    }
    frame.controls.set(me, control);
    for (const remote of remotes) {
      if (riderOf(race.riders, remote.id)?.controller === "human") {
        frame.controls.set(remote.id, withoutButtons(remote.last));
      }
    }
    return frame;
  };

  const hear = (event: RaceEvent): void => {
    heard.push({ ...event });
  };

  const hits = createHitLedger(
    (hit) => {
      if (hit.rider === me) {
        heard.push({ ...hit });
      }
    },
    (refused, tick) => {
      fights.push({ refused, tick });
    }
  );

  const hearFights = (race: RaceState): void => {
    for (const event of race.events) {
      if (isFightEvent(event)) {
        (race === mended ? mendedFights : fights).push({
          event: { ...event },
          tick: race.tick,
        });
      }
      if (event.kind === "hit" && race === confirmed) {
        hits.landed(event, race.tick);
      } else if (event.kind === "hit") {
        hits.guessed(event, race.tick, race === mended);
      }
    }
  };

  const advance = (tick: number): void => {
    stepRace(predicted, setup.track, guess(predicted, tick));
    hearFights(predicted);
  };

  const hearOwn = (): void => {
    for (const event of predicted.events) {
      if (event.kind !== "hit" && ownPrediction(event, me)) {
        hear(event);
      }
    }
  };

  const hearRoom = (): void => {
    for (const event of confirmed.events) {
      if (!ownPrediction(event, me)) {
        hear(event);
      }
    }
    hearFights(confirmed);
    hits.passed(confirmed.tick);
  };

  const copyRace = (from: RaceState, into: RaceState): void => {
    const view = scratchFor(scratch, from);
    writeSnapshot(from, digest, view);
    restoreInto(into, digest, view, setup.track);
  };

  const rewind = (): void => {
    mending = false;
    mendedFights.length = 0;
    hits.replayDropped();
    copyRace(confirmed, predicted);
  };

  const noteJump = (cause: JumpCause, fromS: number, fromX: number): void => {
    const metres = Math.max(Math.abs(mine.s - fromS), Math.abs(mine.x - fromX));
    const tally = stats.jumps[cause];
    tally.felt += metres >= FELT_JUMP_METRES ? 1 : 0;
    tally.totalMetres += metres;
    tally.worstMetres = Math.max(tally.worstMetres, metres);
    if (metres > stats.worstJump.metres) {
      stats.worstJump.metres = metres;
      stats.worstJump.roadMetres = mine.s;
      stats.worstJump.tick = predicted.tick;
    }
  };

  const learn = (frame: TickFrame): void => {
    for (const remote of remotes) {
      const control = frame.controls.get(remote.id);
      if (control !== undefined) {
        remote.last = control;
      }
    }
  };

  const noteWhereRidersAre = (): void => {
    for (let index = 0; index < tracked.length; index += 1) {
      const rider = tracked[index];
      const was = wasAt[index];
      if (rider && was) {
        was.air = rider.air;
        was.heading = rider.heading;
        was.lateralSpeed = rider.lateralSpeed;
        was.lean = rider.lean;
        was.s = rider.s;
        was.speed = rider.speed;
        was.x = rider.x;
      }
    }
  };

  const noteCorrections = (): void => {
    corrected = true;
    for (let index = 0; index < tracked.length; index += 1) {
      const rider = tracked[index];
      const was = wasAt[index];
      const moved = corrections[index];
      if (rider && was && moved) {
        moved.air += was.air - rider.air;
        moved.heading += was.heading - rider.heading;
        moved.lateralSpeed += was.lateralSpeed - rider.lateralSpeed;
        moved.lean += was.lean - rider.lean;
        moved.s += was.s - rider.s;
        moved.speed += was.speed - rider.speed;
        moved.x += was.x - rider.x;
      }
    }
  };

  const finishMending = (): void => {
    const fromS = mine.s;
    const fromX = mine.x;
    const crashesBefore = mine.crashes;
    noteWhereRidersAre();
    copyRace(mended, predicted);
    mending = false;
    fights.push(...mendedFights);
    mendedFights.length = 0;
    hits.replayDrawn();
    noteCorrections();
    stats.crashesAfterCorrection += Math.max(0, mine.crashes - crashesBefore);
    noteJump(mendCause, fromS, fromX);
  };

  const startMending = (): void => {
    stale = false;
    mending = true;
    mendCause = staleCause;
    staleCause = "otherRiders";
    copyRace(confirmed, mended);
    mendedFights.length = 0;
    hits.replayStarted();
    stats.rollbacks += 1;
  };

  const settle = (most = Number.POSITIVE_INFINITY): number => {
    if (!mending && !stale) {
      return 0;
    }
    if (!mending) {
      startMending();
    }
    const from = mended.tick;
    const until = Math.min(predicted.tick, from + most);
    for (let tick = from + 1; tick <= until; tick += 1) {
      stepRace(mended, setup.track, guess(mended, tick));
      hearFights(mended);
      stats.resimulatedTicks += 1;
    }
    const replayed = mended.tick - from;
    if (mended.tick !== predicted.tick) {
      return replayed;
    }
    finishMending();
    return replayed + settle(most - replayed);
  };

  const notePresses = (frame: TickFrame, reached: number): void => {
    const sent =
      frame.tick <= reached && frame.tick < pilotFromTick
        ? (ownControls[slotOf(frame.tick)] ?? coasting)
        : coasting;
    const ridden = frame.controls.get(me) ?? coasting;
    for (let at = 0; at < BUTTONS_OF_A_CONTROL.length; at += 1) {
      const button = BUTTONS_OF_A_CONTROL[at] ?? BUTTONS_OF_A_CONTROL[0];
      const held = holds(sent, button);
      if (held) {
        pressLanded[at] = pressLanded[at] === true || holds(ridden, button);
      } else if (pressHeld[at] === true) {
        if (pressLanded[at] !== true) {
          missed.push(button);
        }
        pressLanded[at] = false;
      }
      pressHeld[at] = held;
    }
  };

  const retryMissed = (control: Control): Control => {
    const [button] = missed;
    return button === undefined ? control : pressing(control, button);
  };

  const pressesAnew = (control: Control): boolean =>
    BUTTONS_OF_A_CONTROL.some(
      (button) => holds(control, button) && !holds(sampled, button)
    );

  const plan = (control: Control, wanted: number): void => {
    const held = withoutButtons(
      ownControls[slotOf(plannedThrough)] ?? coasting
    );
    for (
      let tick = Math.max(plannedThrough, predicted.tick) + 1;
      tick < wanted;
      tick += 1
    ) {
      ownControls[slotOf(tick)] = held;
    }
    ownControls[slotOf(wanted)] = retryMissed(control);
    plannedThrough = wanted;
  };

  const retried = (): void => {
    const [button] = missed;
    if (button === undefined) {
      return;
    }
    retriedFor += 1;
    if (retriedFor === 1) {
      stats.retriedPresses += 1;
    }
    const struck = predicted.events.some(
      (event) => event.kind === "attack" && event.rider === me
    );
    if (!startsAStrike(button) || struck || retriedFor >= MOST_RETRY_TICKS) {
      missed.shift();
      retriedFor = 0;
    }
  };

  const noteRoomChoice = (frame: TickFrame, reached: number): void => {
    const slot = frame.tick % LAG_WINDOW_TICKS;
    const lost =
      frame.tick < pilotFromTick &&
      (reached < frame.tick ||
        ownControls[slotOf(frame.tick)] !== frame.controls.get(me));
    lostControls += lost ? 1 : 0;
    overruledTicks += (lost ? 1 : 0) - (overruled[slot] ?? 0);
    overruled[slot] = lost ? 1 : 0;
    if (overruledTicks >= LAGGING_FROM_TICKS) {
      lagging = true;
    } else if (overruledTicks === 0) {
      lagging = false;
    }
  };

  const stepConfirmed = (
    frame: TickFrame,
    serverHash: Uint32Array | null
  ): void => {
    if (frame.tick !== confirmed.tick + 1) {
      outOfOrder(frame.tick, confirmed.tick);
    }
    stepRace(confirmed, setup.track, frame);
    learn(frame);
    if (serverHash) {
      hashRace(confirmed, digest, scratchFor(scratch, confirmed), hash);
      if (!sameHash(hash, serverHash)) {
        stats.desyncs += 1;
      }
    }
  };

  return {
    catchUp: (snapshot) => {
      restoreInto(confirmed, digest, snapshot, setup.track);
      rewind();
    },
    confirm: (frame, serverHash) => {
      stepConfirmed(frame, serverHash);
      hearRoom();
      const reached = predicted.tick;
      noteRoomChoice(frame, plannedThrough);
      notePresses(frame, plannedThrough);
      if (reached < frame.tick) {
        const fromS = mine.s;
        const fromX = mine.x;
        stale = false;
        noteWhereRidersAre();
        rewind();
        noteCorrections();
        noteJump("behindServer", fromS, fromX);
        return;
      }
      const guessed = guesses[slotOf(frame.tick)];
      if (!guessed || !sameFrame(guessed, frame)) {
        stale = true;
        if (guessed?.controls.get(me) !== frame.controls.get(me)) {
          staleCause = "ownControl";
        }
      }
      if (reached === frame.tick) {
        if (mending && mendCause === "ownControl") {
          staleCause = mendCause;
        }
        stale ||= mending;
        mending = false;
        settle();
      }
    },
    confirmed,
    correcting: () => mending || stale,
    lagging: () => lagging,
    lostControls: () => lostControls,
    mine,
    plannedThrough: () => plannedThrough,
    predict: (control, delay = 0) => {
      if (!mending) {
        settle();
      }
      const tick = predicted.tick + 1;
      if (tick - confirmed.tick > INPUT_HORIZON) {
        stats.refusedPredictions += 1;
        return false;
      }
      const shrinks =
        !pressesAnew(control) && tick - shrunkAt >= SHRINK_EVERY_TICKS;
      const wanted = Math.min(
        Math.max(tick + delay, shrinks ? 0 : plannedThrough + 1),
        confirmed.tick + INPUT_HORIZON
      );
      if (wanted > plannedThrough) {
        plan(control, wanted);
      } else {
        shrunkAt = tick;
      }
      sampled = control;
      advance(tick);
      retried();
      hearOwn();
      return true;
    },
    predicted,
    settle,
    stats,
    takeCorrections: () => {
      if (!corrected) {
        return NO_CORRECTIONS;
      }
      corrected = false;
      const taken = corrections;
      corrections = handed;
      handed = taken;
      for (const moved of corrections) {
        moved.air = 0;
        moved.heading = 0;
        moved.lateralSpeed = 0;
        moved.lean = 0;
        moved.s = 0;
        moved.speed = 0;
        moved.x = 0;
      }
      return taken;
    },
    takeEvents: () => {
      if (heard.length === 0) {
        return NO_EVENTS;
      }
      const taken = heard;
      heard = [];
      return taken;
    },
    takeFights: () => {
      if (fights.length === 0) {
        return NO_FIGHTS;
      }
      const taken = fights;
      fights = [];
      return taken;
    },
    writeInputs: (view) => {
      const unsent = Math.max(sentThrough, confirmed.tick) + 1;
      const last = Math.min(plannedThrough, unsent + MOST_BATCHED_CONTROLS - 1);
      if (last < unsent) {
        return 0;
      }
      const first = Math.max(
        confirmed.tick + 1,
        last - MOST_BATCHED_CONTROLS + 1
      );
      batch.length = 0;
      for (let tick = first; tick <= last; tick += 1) {
        batch.push(ownControls[slotOf(tick)] ?? coasting);
      }
      sentThrough = last;
      return writeInput(view, first, batch);
    },
  };
};
