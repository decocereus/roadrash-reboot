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
import { MOST_BATCHED_CONTROLS, writeInput } from "./room-wire.ts";
import { INPUT_HORIZON, PILOT_FROM_TICK, seatsOf } from "./room.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { hashRace, restoreInto, writeSnapshot } from "./snapshot.ts";
import { NO_FIGHTS, isFightEvent, riderOf } from "./state.ts";
import type {
  Control,
  HeardFight,
  HitEvent,
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderId,
  RiderState,
} from "./state.ts";

const MOST_LEAD_TICKS = INPUT_HORIZON;

const NO_EVENTS: readonly RaceEvent[] = [];
const NO_CORRECTIONS: readonly RiderCorrection[] = [];

const FELT_JUMP_METRES = 0.25;

const LAG_WINDOW_TICKS = 60;
const SAME_HIT_TICKS = 15;
const MOST_RETRY_TICKS = 60;
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
  heading: number;
  lean: number;
  readonly rider: RiderId;
  s: number;
  x: number;
}

export interface RoomClient {
  readonly confirmed: RaceState;
  readonly lagging: () => boolean;
  readonly lostControls: () => number;
  readonly mine: RiderState;
  readonly predicted: RaceState;
  readonly stats: RoomStats;
  readonly predict: (control: Control) => boolean;
  readonly confirm: (frame: TickFrame, hash: Uint32Array | null) => void;
  readonly settle: () => void;
  readonly takeCorrections: () => readonly RiderCorrection[];
  readonly takeEvents: () => readonly RaceEvent[];
  readonly takeFights: () => readonly HeardFight[];
  readonly writeInputs: (view: DataView) => number;
}

interface ShownHit {
  backed: boolean;
  readonly hit: HitEvent;
  refused: boolean;
  tick: number;
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
  heading: 0,
  lean: 0,
  rider: id,
  s: 0,
  x: 0,
});

const ringOf = <Value>(fill: () => Value): Value[] =>
  Array.from({ length: MOST_LEAD_TICKS + 1 }, fill);

export const createRoomClient = (setup: RaceSetup, me: RiderId): RoomClient => {
  const confirmed = createRace(setup);
  const predicted = createRace(setup);
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
  const shownHits: ShownHit[] = [];
  const others = predicted.riders.filter((rider) => rider.id !== me);
  const wasAt = others.map(stillCorrection);
  let corrections = others.map(stillCorrection);
  let handed = others.map(stillCorrection);
  let corrected = false;
  let sentThrough = 0;
  let stale = false;
  let staleCause: JumpCause = "otherRiders";
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

  const remoteRider = (remote: Remote): RiderState | undefined =>
    riderOf(predicted.riders, remote.id);

  const guess = (tick: number): TickFrame => {
    const frame = guesses[slotOf(tick)] ?? createTickFrame();
    clearFrame(frame, tick);
    if (tick >= PILOT_FROM_TICK) {
      if (mine.controller === "human") {
        frame.handovers.set(me, "pilot");
      }
      for (const remote of remotes) {
        if (remoteRider(remote)?.controller === "human") {
          frame.handovers.set(remote.id, "pilot");
        }
      }
      return frame;
    }
    const control = ownControls[slotOf(tick)] ?? coasting;
    if (mine.controller === "pilot") {
      frame.handovers.set(me, "human");
    }
    frame.controls.set(me, control);
    for (const remote of remotes) {
      if (remoteRider(remote)?.controller === "human") {
        frame.controls.set(remote.id, withoutButtons(remote.last));
      }
    }
    return frame;
  };

  const hear = (event: RaceEvent): void => {
    heard.push({ ...event });
  };

  const shownHitOf = (event: HitEvent, tick: number): ShownHit | undefined =>
    shownHits.find(
      (shown) =>
        shown.hit.rider === event.rider &&
        shown.hit.target === event.target &&
        shown.hit.attack === event.attack &&
        Math.abs(shown.tick - tick) <= SAME_HIT_TICKS
    );

  const guessedHit = (event: HitEvent, tick: number): void => {
    const shown = shownHitOf(event, tick);
    if (shown) {
      shown.backed = true;
      shown.refused = false;
      shown.tick = tick;
      return;
    }
    shownHits.push({ backed: true, hit: { ...event }, refused: false, tick });
    if (event.rider === me) {
      hear(event);
    }
  };

  const roomHit = (event: HitEvent, tick: number): void => {
    const shown = shownHitOf(event, tick);
    if (shown) {
      shownHits.splice(shownHits.indexOf(shown), 1);
    } else if (event.rider === me) {
      hear(event);
    }
  };

  const refuseUnbacked = (): void => {
    for (const shown of shownHits) {
      if (!shown.backed && !shown.refused) {
        shown.refused = true;
        fights.push({ refused: shown.hit, tick: shown.tick });
      }
    }
  };

  const hearFights = (race: RaceState): void => {
    for (const event of race.events) {
      if (isFightEvent(event)) {
        fights.push({ event: { ...event }, tick: race.tick });
      }
      if (event.kind === "hit") {
        (race === predicted ? guessedHit : roomHit)(event, race.tick);
      }
    }
  };

  const advance = (tick: number): void => {
    stepRace(predicted, setup.track, guess(tick));
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
    const overdue = confirmed.tick - SAME_HIT_TICKS;
    for (const shown of shownHits) {
      shown.backed &&= shown.tick >= overdue;
    }
    refuseUnbacked();
    for (let at = shownHits.length - 1; at >= 0; at -= 1) {
      if ((shownHits[at]?.tick ?? overdue) < overdue) {
        shownHits.splice(at, 1);
      }
    }
  };

  const rewind = (): void => {
    const view = scratchFor(scratch, confirmed);
    writeSnapshot(confirmed, digest, view);
    restoreInto(predicted, digest, view, setup.track);
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
    for (let index = 0; index < others.length; index += 1) {
      const rider = others[index];
      const was = wasAt[index];
      if (rider && was) {
        was.heading = rider.heading;
        was.lean = rider.lean;
        was.s = rider.s;
        was.x = rider.x;
      }
    }
  };

  const noteCorrections = (): void => {
    corrected = true;
    for (let index = 0; index < others.length; index += 1) {
      const rider = others[index];
      const was = wasAt[index];
      const moved = corrections[index];
      if (rider && was && moved) {
        moved.heading += was.heading - rider.heading;
        moved.lean += was.lean - rider.lean;
        moved.s += was.s - rider.s;
        moved.x += was.x - rider.x;
      }
    }
  };

  const settle = (): void => {
    if (!stale) {
      return;
    }
    stale = false;
    const reached = predicted.tick;
    const fromS = mine.s;
    const fromX = mine.x;
    const crashesBefore = mine.crashes;
    noteWhereRidersAre();
    rewind();
    stats.rollbacks += 1;
    for (const shown of shownHits) {
      shown.backed = false;
    }
    for (let tick = confirmed.tick + 1; tick <= reached; tick += 1) {
      advance(tick);
      stats.resimulatedTicks += 1;
    }
    refuseUnbacked();
    noteCorrections();
    stats.crashesAfterCorrection += Math.max(0, mine.crashes - crashesBefore);
    noteJump(staleCause, fromS, fromX);
    staleCause = "otherRiders";
  };

  const notePresses = (frame: TickFrame, reached: number): void => {
    const sent =
      frame.tick <= reached && frame.tick < PILOT_FROM_TICK
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
          stats.retriedPresses += 1;
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

  const retried = (): void => {
    const [button] = missed;
    if (button === undefined) {
      return;
    }
    retriedFor += 1;
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
      frame.tick < PILOT_FROM_TICK &&
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

  return {
    confirm: (frame, serverHash) => {
      if (frame.tick !== confirmed.tick + 1) {
        outOfOrder(frame.tick, confirmed.tick);
      }
      stepRace(confirmed, setup.track, frame);
      hearRoom();
      learn(frame);
      if (serverHash) {
        hashRace(confirmed, digest, scratchFor(scratch, confirmed), hash);
        if (!sameHash(hash, serverHash)) {
          stats.desyncs += 1;
        }
      }
      const reached = predicted.tick;
      noteRoomChoice(frame, reached);
      notePresses(frame, reached);
      if (reached < frame.tick) {
        const fromS = mine.s;
        const fromX = mine.x;
        stale = false;
        rewind();
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
        settle();
      }
    },
    confirmed,
    lagging: () => lagging,
    lostControls: () => lostControls,
    mine,
    predict: (control) => {
      settle();
      const tick = predicted.tick + 1;
      if (tick - confirmed.tick > MOST_LEAD_TICKS) {
        stats.refusedPredictions += 1;
        return false;
      }
      ownControls[slotOf(tick)] = retryMissed(control);
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
        moved.heading = 0;
        moved.lean = 0;
        moved.s = 0;
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
      const last = Math.min(predicted.tick, unsent + MOST_BATCHED_CONTROLS - 1);
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
