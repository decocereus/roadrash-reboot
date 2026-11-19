import type { RaceView, RiderView } from "./race-view.ts";
import { TICK_SECONDS, riderOf } from "./state.ts";
import type { RiderId } from "./state.ts";

export const TIMING_LINE_METRES = 1;

const NO_CROSSING = -1;

const NOTHING_REACHED = -0x80_00_00_00;

const noLines = new Int32Array(0);

export type Interval = number | "unknown";

export interface TimingView {
  readonly crossing: (rider: RiderId, line: number) => number;
  readonly reached: (rider: RiderId) => number;
}

interface Ledger {
  readonly ticks: readonly Int32Array[];
  readonly reached: Int32Array;
}

const lineAt = (s: number): number => Math.floor(s / TIMING_LINE_METRES);

const ledgerFor = (view: RaceView, lines: number): Ledger => ({
  reached: new Int32Array(view.riders.length).fill(NOTHING_REACHED),
  ticks: view.riders.map((rider) =>
    rider.profile.role === "racer"
      ? new Int32Array(lines).fill(NO_CROSSING)
      : noLines
  ),
});

const reachedIn = (ledger: Ledger, rider: RiderId): number =>
  ledger.reached[rider] ?? NOTHING_REACHED;

const pass = (ledger: Ledger, under: Ledger | null, view: RaceView): void => {
  for (const rider of view.riders) {
    const ticks = riderOf(ledger.ticks, rider.id) ?? noLines;
    if (ticks.length > 0) {
      const line = Math.min(lineAt(rider.bodyS), ticks.length - 1);
      const own = reachedIn(ledger, rider.id);
      const from = under ? Math.max(own, reachedIn(under, rider.id)) : own;
      if (line > from) {
        for (let next = Math.max(0, from + 1); next <= line; next += 1) {
          ticks[next] = view.tick;
        }
        ledger.reached[rider.id] = line;
      }
    }
  }
};

const startFrom = (ledger: Ledger, view: RaceView): void => {
  for (const rider of view.riders) {
    riderOf(ledger.ticks, rider.id)?.fill(NO_CROSSING);
    ledger.reached[rider.id] = lineAt(rider.bodyS);
  }
};

const forget = (ledger: Ledger): void => {
  ledger.reached.fill(NOTHING_REACHED);
};

const stampIn = (ledger: Ledger, rider: RiderId, line: number): number =>
  riderOf(ledger.ticks, rider)?.[line] ?? NO_CROSSING;

const linesOn = (roadMetres: number): number =>
  Math.floor(roadMetres / TIMING_LINE_METRES) + 2;

export interface RaceTiming extends TimingView {
  readonly record: (view: RaceView) => void;
  readonly startOver: (view: RaceView) => void;
}

export const createRaceTiming = (
  view: RaceView,
  roadMetres: number
): RaceTiming => {
  const kept = ledgerFor(view, linesOn(roadMetres));
  startFrom(kept, view);
  return {
    crossing: (rider, line) =>
      line < 0 || line > reachedIn(kept, rider)
        ? NO_CROSSING
        : stampIn(kept, rider, line),
    reached: (rider) => reachedIn(kept, rider),
    record: (race) => {
      pass(kept, null, race);
    },
    startOver: (race) => {
      startFrom(kept, race);
    },
  };
};

export interface ShownTiming extends TimingView {
  readonly confirmed: (view: RaceView) => void;
  readonly shown: (view: RaceView) => void;
  readonly mended: (view: RaceView) => void;
  readonly startMending: () => void;
  readonly showMended: () => void;
  readonly showConfirmed: () => void;
  readonly startOver: (view: RaceView) => void;
}

export const createShownTiming = (
  view: RaceView,
  roadMetres: number
): ShownTiming => {
  const lines = linesOn(roadMetres);
  const kept = ledgerFor(view, lines);
  let guessed = ledgerFor(view, lines);
  let mending = ledgerFor(view, lines);
  startFrom(kept, view);
  const reached = (rider: RiderId): number =>
    Math.max(reachedIn(kept, rider), reachedIn(guessed, rider));
  return {
    confirmed: (race) => {
      pass(kept, null, race);
    },
    crossing: (rider, line) => {
      if (line < 0) {
        return NO_CROSSING;
      }
      if (line <= reachedIn(kept, rider)) {
        return stampIn(kept, rider, line);
      }
      return line <= reachedIn(guessed, rider)
        ? stampIn(guessed, rider, line)
        : NO_CROSSING;
    },
    mended: (race) => {
      pass(mending, kept, race);
    },
    reached,
    showConfirmed: () => {
      forget(guessed);
    },
    showMended: () => {
      const shown = guessed;
      guessed = mending;
      mending = shown;
    },
    shown: (race) => {
      pass(guessed, kept, race);
    },
    startMending: () => {
      forget(mending);
    },
    startOver: (race) => {
      startFrom(kept, race);
      forget(guessed);
      forget(mending);
    },
  };
};

export const intervalAhead = (
  timing: TimingView,
  now: number,
  follower: RiderView,
  ahead: RiderView
): Interval => {
  if (follower.finishTick >= 0 && ahead.finishTick >= 0) {
    return (follower.finishTick - ahead.finishTick) * TICK_SECONDS;
  }
  const line = lineAt(follower.bodyS);
  const from = timing.crossing(ahead.id, line);
  if (from === NO_CROSSING) {
    return "unknown";
  }
  if (line === timing.reached(ahead.id)) {
    return (now - from) * TICK_SECONDS;
  }
  const to = timing.crossing(ahead.id, line + 1);
  const share = follower.bodyS / TIMING_LINE_METRES - line;
  return (now - from - (to - from) * share) * TICK_SECONDS;
};
