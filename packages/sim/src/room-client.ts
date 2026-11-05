import { coasting, withoutButtons } from "./control.ts";
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
import { riderOf } from "./state.ts";
import type {
  Control,
  RaceSetup,
  RaceState,
  RiderId,
  RiderState,
} from "./state.ts";

const MOST_LEAD_TICKS = INPUT_HORIZON;

const FELT_JUMP_METRES = 0.25;

const LAG_WINDOW_TICKS = 60;
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
  readonly jumps: Record<JumpCause, JumpTally>;
  readonly worstJump: { metres: number; roadMetres: number; tick: number };
}

export interface RoomClient {
  readonly confirmed: RaceState;
  readonly lagging: () => boolean;
  readonly mine: RiderState;
  readonly predicted: RaceState;
  readonly stats: RoomStats;
  readonly predict: (control: Control) => boolean;
  readonly confirm: (frame: TickFrame, hash: Uint32Array | null) => void;
  readonly settle: () => void;
  readonly writeInputs: (view: DataView) => number;
}

interface Remote {
  readonly id: RiderId;
  last: Control;
}

const outOfOrder = (tick: number, after: number): never => {
  throw new RangeError(`The room sent tick ${tick} after tick ${after}.`);
};

const sameHash = (left: Uint32Array, right: Uint32Array): boolean => {
  for (let word = 0; word < HASH_WORDS; word += 1) {
    if (left[word] !== right[word]) {
      return false;
    }
  }
  return true;
};

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
  let sentThrough = 0;
  let stale = false;
  let staleCause: JumpCause = "otherRiders";
  const overruled = new Uint8Array(LAG_WINDOW_TICKS);
  let overruledTicks = 0;
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

  const advance = (tick: number): void => {
    stepRace(predicted, setup.track, guess(tick));
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

  const settle = (): void => {
    if (!stale) {
      return;
    }
    stale = false;
    const reached = predicted.tick;
    const fromS = mine.s;
    const fromX = mine.x;
    const crashesBefore = mine.crashes;
    rewind();
    stats.rollbacks += 1;
    for (let tick = confirmed.tick + 1; tick <= reached; tick += 1) {
      advance(tick);
      stats.resimulatedTicks += 1;
    }
    stats.crashesAfterCorrection += Math.max(0, mine.crashes - crashesBefore);
    noteJump(staleCause, fromS, fromX);
    staleCause = "otherRiders";
  };

  const noteRoomChoice = (frame: TickFrame, reached: number): void => {
    const slot = frame.tick % LAG_WINDOW_TICKS;
    const lost =
      reached < frame.tick ||
      ownControls[slotOf(frame.tick)] !== frame.controls.get(me);
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
      learn(frame);
      if (serverHash) {
        hashRace(confirmed, digest, scratchFor(scratch, confirmed), hash);
        if (!sameHash(hash, serverHash)) {
          stats.desyncs += 1;
        }
      }
      const reached = predicted.tick;
      noteRoomChoice(frame, reached);
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
    mine,
    predict: (control) => {
      settle();
      const tick = predicted.tick + 1;
      if (tick - confirmed.tick > MOST_LEAD_TICKS) {
        stats.refusedPredictions += 1;
        return false;
      }
      ownControls[slotOf(tick)] = control;
      advance(tick);
      return true;
    },
    predicted,
    settle,
    stats,
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
