import {
  checkpointOf,
  close,
  openCase,
  replayCases,
  restoredWith,
  ride,
  rideToEnd,
} from "./pilot-replay.ts";

export { TICK_LIMIT } from "./pilot-replay.ts";

export interface CaseRun {
  readonly final: string;
  readonly frames: readonly string[];
  readonly full: string;
  readonly problems: readonly string[];
  readonly result: string | null;
  readonly ticks: number;
  readonly window: string;
}

const HEX_RADIX = 16;
const BYTE_DIGITS = 2;

export const caseIds: readonly string[] = replayCases.map(({ id }) => id);

const caseOf = (id: string) => {
  const found = replayCases.find((replay) => replay.id === id);
  if (!found) {
    throw new RangeError(`No replay case is called ${id}.`);
  }
  return found;
};

const textOf = (bytes: Uint8Array): string =>
  [...bytes]
    .map((byte) => byte.toString(HEX_RADIX).padStart(BYTE_DIGITS, "0"))
    .join("");

const bytesFrom = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length / BYTE_DIGITS);
  for (let at = 0; at < bytes.length; at += 1) {
    bytes[at] = Number.parseInt(
      text.slice(at * BYTE_DIGITS, (at + 1) * BYTE_DIGITS),
      HEX_RADIX
    );
  }
  return bytes;
};

export const runCase = (id: string, limit: number): CaseRun => {
  const run = rideToEnd(openCase(caseOf(id)), limit);
  const closed = close(run);
  return {
    final: closed.final,
    frames: run.frames,
    full: closed.full,
    problems: run.problems,
    result: closed.result,
    ticks: closed.ticks,
    window: closed.window,
  };
};

export const checkpointAt = (id: string, at: number): string =>
  textOf(checkpointOf(ride(openCase(caseOf(id)), at)));

export const runCold = (
  id: string,
  checkpoint: string,
  ticks: number
): readonly string[] =>
  ride(restoredWith(openCase(caseOf(id)), bytesFrom(checkpoint)), ticks).frames;
