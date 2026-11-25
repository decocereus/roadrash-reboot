import type { HeapProfiler } from "node:inspector";
import { Session as Inspector } from "node:inspector/promises";

import { standings } from "@racer/sim/race";

import { SLIDE_MS, createTowerQuads } from "../src/game/hud-tower-quads.ts";
import { createTower } from "../src/game/hud-tower.ts";
import type { TowerRow } from "../src/game/hud.ts";
import { placementFor, planFor, wideView } from "./tower-drawn.ts";
import { noControls, rideFor, soloPlan } from "./tower-ride.ts";

const RIDE_SECONDS = 8;
const WARM_READS = 1000;
const SAMPLED_WINDOWS = 3;
const SAMPLED_READS = 2000;
const WARM_DRAWS = 5000;
const SAMPLED_DRAWS = 200;
const PUBLISH_FILES = ["/hud-tower.ts"] as const;
const DRAW_FILES = ["/hud-tower-quads.ts", "/hud-layout.ts"] as const;
const DRAWN_ORDERS = 64;
const FRAME_MS = 1000 / 60;

const bytesIn = (
  node: HeapProfiler.SamplingHeapProfileNode,
  files: readonly string[]
): number =>
  (files.some((file) => node.callFrame.url.endsWith(file))
    ? node.selfSize
    : 0) + node.children.reduce((sum, child) => sum + bytesIn(child, files), 0);

const ride = rideFor(soloPlan, RIDE_SECONDS);
const order = standings(ride.state);
const tower = createTower();
const first = tower.read(ride.session, ride.stage, order);

const drawnRide = rideFor(soloPlan, RIDE_SECONDS);
const drawnTower = createTower();
const drawnOrders: readonly (readonly TowerRow[])[] = Array.from(
  { length: DRAWN_ORDERS },
  (_, at) => {
    drawnRide.stage.race.step(noControls);
    const rows = drawnTower.read(
      drawnRide.session,
      drawnRide.stage,
      standings(drawnRide.state)
    );
    return at % 2 === 0
      ? rows
      : rows.toReversed().map((row, place) => ({ ...row, place: place + 1 }));
  }
);
const placement = placementFor(wideView, "all");
const narrow = placementFor({ height: 844, width: 390 }, 5);
const plan = planFor(
  new Map(first.map((row) => [row.id, row.name])),
  placement
);
const quads = createTowerQuads();

const drawsWithoutChange = (draws: number): boolean => {
  let moved = false;
  for (let draw = 0; draw < draws; draw += 1) {
    const rows = drawnOrders[draw % DRAWN_ORDERS] ?? first;
    const now = draw * FRAME_MS * 4;
    quads.layout(rows, plan, draw % 2 === 0 ? placement : narrow, now, false);
    moved = quads.place(now + SLIDE_MS / 2) || moved;
    quads.place(now + SLIDE_MS);
  }
  return moved;
};

const readsUnchanged = (reads: number): boolean => {
  let same = true;
  for (let read = 0; read < reads; read += 1) {
    same &&= tower.read(ride.session, ride.stage, order) === first;
  }
  return same;
};

const sampled = async (
  files: readonly string[],
  run: () => boolean
): Promise<{ bytes: number; same: boolean }> => {
  const inspector = new Inspector();
  inspector.connect();
  await inspector.post("HeapProfiler.enable");
  await inspector.post("HeapProfiler.startSampling", {
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
    samplingInterval: 16,
  });
  const same = run();
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  inspector.disconnect();
  return { bytes: bytesIn(profile.head, files), same };
};

const windowsOf = async (
  count: number,
  files: readonly string[],
  run: () => boolean
): Promise<readonly { bytes: number; same: boolean }[]> =>
  count === 0
    ? []
    : [await sampled(files, run), ...(await windowsOf(count - 1, files, run))];

const publishOutput = async () => {
  readsUnchanged(WARM_READS);
  const published = await windowsOf(SAMPLED_WINDOWS, PUBLISH_FILES, () =>
    readsUnchanged(SAMPLED_READS)
  );
  return {
    built: Math.max(...published.map((window) => window.bytes)),
    unchanged: published.every((window) => window.same),
  };
};

const drawOutput = async () => {
  drawsWithoutChange(WARM_DRAWS);
  const drawn = await windowsOf(SAMPLED_WINDOWS, DRAW_FILES, () =>
    drawsWithoutChange(SAMPLED_DRAWS)
  );
  return {
    drawn: Math.max(...drawn.map((window) => window.bytes)),
    slid: drawn.every((window) => window.same),
  };
};

process.stdout.write(
  JSON.stringify(
    process.argv.includes("draw") ? await drawOutput() : await publishOutput()
  )
);
