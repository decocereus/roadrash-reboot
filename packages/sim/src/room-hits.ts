import type { HitEvent } from "./state.ts";

const SAME_HIT_TICKS = 15;

interface ShownHit {
  backed: boolean;
  readonly hit: HitEvent;
  refused: boolean;
  tick: number;
}

export interface HitLedger {
  readonly guessed: (event: HitEvent, tick: number, replaying: boolean) => void;
  readonly landed: (event: HitEvent, tick: number) => void;
  readonly passed: (confirmedTick: number) => void;
  readonly replayDrawn: () => void;
  readonly replayDropped: () => void;
  readonly replayStarted: () => void;
}

export const createHitLedger = (
  shows: (hit: HitEvent) => void,
  refuses: (hit: HitEvent, tick: number) => void
): HitLedger => {
  const shown: ShownHit[] = [];
  const replayed: ShownHit[] = [];

  const sameHit = (
    among: readonly ShownHit[],
    event: HitEvent,
    tick: number
  ): ShownHit | undefined =>
    among.find(
      ({ hit, tick: at }) =>
        hit.rider === event.rider &&
        hit.target === event.target &&
        hit.attack === event.attack &&
        Math.abs(at - tick) <= SAME_HIT_TICKS
    );

  const refuse = (hit: ShownHit): void => {
    hit.refused = true;
    refuses(hit.hit, hit.tick);
  };

  return {
    guessed: (event, tick, replaying) => {
      const known = sameHit(shown, event, tick);
      if (known) {
        known.backed = true;
        known.refused = false;
        known.tick = tick;
        return;
      }
      const found = { backed: true, hit: { ...event }, refused: false, tick };
      if (replaying) {
        replayed.push(found);
        return;
      }
      shown.push(found);
      shows(event);
    },
    landed: (event, tick) => {
      const known = sameHit(shown, event, tick);
      if (known) {
        shown.splice(shown.indexOf(known), 1);
        return;
      }
      const pending = sameHit(replayed, event, tick);
      if (pending) {
        replayed.splice(replayed.indexOf(pending), 1);
      }
      shows(event);
    },
    passed: (confirmedTick) => {
      const overdue = confirmedTick - SAME_HIT_TICKS;
      for (let at = shown.length - 1; at >= 0; at -= 1) {
        const hit = shown[at];
        if (hit && hit.tick < overdue) {
          if (!hit.refused) {
            refuse(hit);
          }
          shown.splice(at, 1);
        }
      }
    },
    replayDrawn: () => {
      for (const found of replayed) {
        shown.push(found);
        shows(found.hit);
      }
      replayed.length = 0;
      for (const hit of shown) {
        if (!hit.backed && !hit.refused) {
          refuse(hit);
        }
      }
    },
    replayDropped: () => {
      replayed.length = 0;
    },
    replayStarted: () => {
      replayed.length = 0;
      for (const hit of shown) {
        hit.backed = false;
      }
    },
  };
};
