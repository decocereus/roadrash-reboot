import { once } from "node:events";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import { beforeAll, describe, expect, it } from "vitest";

import { recordedRules } from "./bench.ts";
import {
  policeStarts,
  ridesIn,
  SEASON_SLOTS,
  STARTS,
} from "./police-fixtures.ts";
import type { PoliceRide } from "./police-fixtures.ts";
import { levels } from "./tables.ts";
import type { Level } from "./tables.ts";

const rideSeason = async (): Promise<readonly PoliceRide[]> => {
  const season = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * SEASON_SLOTS)
  );
  await Promise.all(
    Array.from(
      { length: Math.min(availableParallelism(), policeStarts.length) },
      async () => {
        const worker = new Worker(
          new URL("police-worker.ts", import.meta.url),
          {
            workerData: season.buffer,
          }
        );
        const exit: unknown[] = await once(worker, "exit");
        const [code] = exit;
        if (code !== 0) {
          throw new Error(`A police worker exited with code ${String(code)}.`);
        }
      }
    )
  );
  return ridesIn(season);
};

interface Tally {
  busted: number;
  finished: number;
  wrecked: number;
  unsettled: number;
  rivalsBusted: number;
}

const tallyOf = (season: readonly PoliceRide[], level: Level): Tally => {
  const tally: Tally = {
    busted: 0,
    finished: 0,
    rivalsBusted: 0,
    unsettled: 0,
    wrecked: 0,
  };
  for (const race of season) {
    if (race.level === level) {
      tally[race.ending] += 1;
      tally.rivalsBusted += race.rivalsBusted;
    }
  }
  return tally;
};

interface Band {
  readonly level: Level;
  readonly fewest: number;
  readonly most: number;
}

const bands: readonly Band[] = [
  { fewest: 2, level: 1, most: 9 },
  { fewest: 3, level: 2, most: 14 },
  { fewest: 4, level: 3, most: 13 },
  { fewest: 4, level: 4, most: 14 },
  { fewest: 5, level: 5, most: 15 },
];

const MINUTES = 60_000;

describe("police balance", () => {
  let season: readonly PoliceRide[] = [];

  beforeAll(async () => {
    season = await rideSeason();
  }, 15 * MINUTES);

  it.each(bands)(
    "a pilot standing in for the decent player is busted in $fewest to $most of 40 starts at level $level",
    ({ fewest, level, most }) => {
      const tally = tallyOf(season, level);
      expect(tally.busted + tally.finished + tally.wrecked).toBe(STARTS);
      expect(tally.busted).toBeGreaterThanOrEqual(fewest);
      expect(tally.busted).toBeLessThanOrEqual(most);
      expect(tally.rivalsBusted / STARTS).toBeLessThan(
        (2.5 * (recordedRules.fieldSize - 1)) / 7
      );
    }
  );

  it("over the five levels the busts come to between an eighth and 27% of all starts", () => {
    const starts = levels.length * STARTS;
    const busted = levels
      .map((level) => tallyOf(season, level).busted)
      .reduce((total, count) => total + count, 0);
    expect(busted / starts).toBeGreaterThan(1 / 8);
    expect(busted / starts).toBeLessThanOrEqual(0.27);
  });
});
