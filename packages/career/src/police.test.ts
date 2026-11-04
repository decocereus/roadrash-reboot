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
import { tiers } from "./tables.ts";
import type { Tier } from "./tables.ts";

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

const tallyOf = (season: readonly PoliceRide[], tier: Tier): Tally => {
  const tally: Tally = {
    busted: 0,
    finished: 0,
    rivalsBusted: 0,
    unsettled: 0,
    wrecked: 0,
  };
  for (const race of season) {
    if (race.tier === tier) {
      tally[race.ending] += 1;
      tally.rivalsBusted += race.rivalsBusted;
    }
  }
  return tally;
};

interface Band {
  readonly tier: Tier;
  readonly fewest: number;
  readonly most: number;
}

const bands: readonly Band[] = [
  { fewest: 2, most: 14, tier: 1 },
  { fewest: 3, most: 14, tier: 2 },
  { fewest: 5, most: 17, tier: 3 },
];

const MINUTES = 60_000;

describe("police balance", () => {
  let season: readonly PoliceRide[] = [];

  beforeAll(async () => {
    season = await rideSeason();
  }, 15 * MINUTES);

  it.each(bands)(
    "a pilot standing in for the decent player is busted in $fewest to $most of 39 starts at tier $tier",
    ({ fewest, tier, most }) => {
      const tally = tallyOf(season, tier);
      expect(tally.busted + tally.finished + tally.wrecked).toBe(STARTS);
      expect(tally.busted).toBeGreaterThanOrEqual(fewest);
      expect(tally.busted).toBeLessThanOrEqual(most);
      expect(tally.rivalsBusted / STARTS).toBeLessThan(
        (2.5 * (recordedRules.fieldSize - 1)) / 7
      );
    }
  );

  it("over the three tiers the busts come to between an eighth and 30% of all starts", () => {
    const starts = tiers.length * STARTS;
    const busted = tiers
      .map((tier) => tallyOf(season, tier).busted)
      .reduce((total, count) => total + count, 0);
    expect(busted / starts).toBeGreaterThan(1 / 8);
    expect(busted / starts).toBeLessThanOrEqual(0.3);
  });
});
