import type { HeapProfiler } from "node:inspector";
import { Session as Inspector } from "node:inspector/promises";

import { standings } from "@racer/sim/race";

import { createTower } from "../src/game/hud-tower.ts";
import { rideFor, soloPlan } from "./tower-ride.ts";

const RIDE_SECONDS = 8;
const WARM_READS = 1000;
const SAMPLED_WINDOWS = 3;
const SAMPLED_READS = 2000;
const FILE = "hud-tower.ts";

const bytesIn = (node: HeapProfiler.SamplingHeapProfileNode): number =>
  (node.callFrame.url.includes(FILE) ? node.selfSize : 0) +
  node.children.reduce((sum, child) => sum + bytesIn(child), 0);

const ride = rideFor(soloPlan, RIDE_SECONDS);
const order = standings(ride.state);
const tower = createTower();
const first = tower.read(ride.session, ride.stage, order);

const readsUnchanged = (reads: number): boolean => {
  let same = true;
  for (let read = 0; read < reads; read += 1) {
    same &&= tower.read(ride.session, ride.stage, order) === first;
  }
  return same;
};

const sampled = async (): Promise<{ bytes: number; same: boolean }> => {
  const inspector = new Inspector();
  inspector.connect();
  await inspector.post("HeapProfiler.enable");
  await inspector.post("HeapProfiler.startSampling", {
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
    samplingInterval: 16,
  });
  const same = readsUnchanged(SAMPLED_READS);
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  inspector.disconnect();
  return { bytes: bytesIn(profile.head), same };
};

const windowsOf = async (
  count: number
): Promise<readonly { bytes: number; same: boolean }[]> =>
  count === 0 ? [] : [await sampled(), ...(await windowsOf(count - 1))];

readsUnchanged(WARM_READS);
const windows = await windowsOf(SAMPLED_WINDOWS);
process.stdout.write(
  JSON.stringify({
    built: Math.max(...windows.map((window) => window.bytes)),
    unchanged: windows.every((window) => window.same),
  })
);
