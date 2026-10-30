import {
  close,
  openCase,
  replayCases,
  restoredFrom,
  ride,
} from "./pilot-replay.ts";

export interface CaseRun {
  readonly final: string;
  readonly frames: readonly string[];
  readonly full: string;
  readonly window: string;
}

export const caseIds: readonly string[] = replayCases.map(({ id }) => id);

const caseOf = (id: string) => {
  const found = replayCases.find((replay) => replay.id === id);
  if (!found) {
    throw new RangeError(`No replay case is called ${id}.`);
  }
  return found;
};

export const runCase = (id: string, ticks: number): CaseRun => {
  const run = ride(openCase(caseOf(id)), ticks);
  const closed = close(run);
  return {
    final: closed.final,
    frames: run.frames,
    full: closed.full,
    window: closed.window,
  };
};

export const runRestored = (
  id: string,
  at: number,
  ticks: number
): readonly string[] => {
  const run = ride(openCase(caseOf(id)), at);
  restoredFrom(run);
  return ride(run, ticks).frames;
};
