import type { HeapProfiler } from "node:inspector";
import { Session as Inspector } from "node:inspector/promises";

import { standings } from "@racer/sim/race";

import { createTowerPass } from "../src/game/hud-tower-pass.ts";
import { SLIDE_MS, createTowerQuads } from "../src/game/hud-tower-quads.ts";
import { createTower } from "../src/game/hud-tower.ts";
import type { TowerRow } from "../src/game/hud.ts";
import {
  layoutAt,
  placeAt,
  placementFor,
  planFor,
  wideView,
} from "./tower-drawn.ts";
import {
  consumingRenderer,
  motionPreference,
  recordingCanvases,
} from "./tower-pass-stubs.ts";
import { noControls, rideFor, soloPlan } from "./tower-ride.ts";

const RIDE_SECONDS = 8;
const WARM_READS = 1000;
const SAMPLED_WINDOWS = 3;
const SAMPLED_READS = 2000;
const WARM_FRAMES = 150;
const SAMPLED_DRAWS = 200;
const PUBLISH_FILES = ["/hud-tower.ts"] as const;
const DRAW_FILES = ["/hud-tower-quads.ts", "/hud-layout.ts"] as const;
const PASS_FILES = ["/hud-tower-pass.ts"] as const;
const STUB_FILES = ["/tower-pass-stubs.ts", "/tower-publish-heap.ts"] as const;
const DRAWN_ORDERS = 64;
const FRAME_MS = 1000 / 60;

const bytesIn = (
  node: HeapProfiler.SamplingHeapProfileNode,
  files: readonly string[]
): number =>
  (files.some((file) => node.callFrame.url.endsWith(file))
    ? node.selfSize
    : 0) + node.children.reduce((sum, child) => sum + bytesIn(child, files), 0);

const ownBytes = (
  node: HeapProfiler.SamplingHeapProfileNode,
  stubs: readonly string[]
): number =>
  (stubs.some((file) => node.callFrame.url.endsWith(file))
    ? 0
    : node.selfSize) +
  node.children.reduce((sum, child) => sum + ownBytes(child, stubs), 0);

const bytesUnder = (
  node: HeapProfiler.SamplingHeapProfileNode,
  roots: readonly string[]
): number =>
  roots.some((file) => node.callFrame.url.endsWith(file))
    ? ownBytes(node, STUB_FILES)
    : node.children.reduce((sum, child) => sum + bytesUnder(child, roots), 0);

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

const canvases = recordingCanvases();
const clock = new Float64Array(1);
Object.assign(globalThis, {
  devicePixelRatio: 1,
  document: { createElement: canvases.createElement },
  matchMedia: () => motionPreference().media,
});
performance.now = () => clock[0] ?? 0;
const drawing = consumingRenderer();
const pass = createTowerPass(drawing.renderer);
pass.resize(wideView.width, wideView.height, 1);
pass.bake(new Map(first.map((row) => [row.id, row.name])));

const passDraws = (draws: number): boolean => {
  const { uploaded } = drawing.state;
  const painted = canvases.layers();
  for (let draw = 0; draw < draws; draw += 1) {
    const now = draw * FRAME_MS * 4;
    pass.show(drawnOrders[draw % DRAWN_ORDERS] ?? first);
    clock[0] = now;
    pass.render();
    clock[0] = now + SLIDE_MS / 2;
    pass.render();
    clock[0] = now + SLIDE_MS;
    pass.render();
  }
  return drawing.state.uploaded > uploaded && canvases.layers() === painted;
};

const drawsWithoutChange = (draws: number): boolean => {
  let moved = false;
  for (let draw = 0; draw < draws; draw += 1) {
    const rows = drawnOrders[draw % DRAWN_ORDERS] ?? first;
    const now = draw * FRAME_MS * 4;
    layoutAt(
      quads,
      rows,
      plan,
      draw % 2 === 0 ? placement : narrow,
      now,
      false
    );
    moved = placeAt(quads, now + SLIDE_MS / 2) || moved;
    placeAt(quads, now + SLIDE_MS);
  }
  return moved;
};

const warmed = (run: (draws: number) => boolean): void => {
  for (let frame = 0; frame < WARM_FRAMES; frame += 1) {
    run(SAMPLED_DRAWS);
  }
};

const readsUnchanged = (reads: number): boolean => {
  let same = true;
  for (let read = 0; read < reads; read += 1) {
    same &&= tower.read(ride.session, ride.stage, order) === first;
  }
  return same;
};

const sampled = async (
  count: (head: HeapProfiler.SamplingHeapProfileNode) => number,
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
  return { bytes: count(profile.head), same };
};

const windowsOf = async (
  windows: number,
  count: (head: HeapProfiler.SamplingHeapProfileNode) => number,
  run: () => boolean
): Promise<readonly { bytes: number; same: boolean }[]> =>
  windows === 0
    ? []
    : [
        await sampled(count, run),
        ...(await windowsOf(windows - 1, count, run)),
      ];

const publishOutput = async () => {
  readsUnchanged(WARM_READS);
  const published = await windowsOf(
    SAMPLED_WINDOWS,
    (head) => bytesIn(head, PUBLISH_FILES),
    () => readsUnchanged(SAMPLED_READS)
  );
  return {
    built: Math.max(...published.map((window) => window.bytes)),
    unchanged: published.every((window) => window.same),
  };
};

const drawOutput = async () => {
  warmed(drawsWithoutChange);
  const drawn = await windowsOf(
    SAMPLED_WINDOWS,
    (head) => bytesIn(head, DRAW_FILES),
    () => drawsWithoutChange(SAMPLED_DRAWS)
  );
  return {
    drawn: Math.max(...drawn.map((window) => window.bytes)),
    slid: drawn.every((window) => window.same),
  };
};

const passOutput = async () => {
  warmed(passDraws);
  const drawn = await windowsOf(
    SAMPLED_WINDOWS,
    (head) => bytesUnder(head, PASS_FILES),
    () => passDraws(SAMPLED_DRAWS)
  );
  return {
    passed: Math.max(...drawn.map((window) => window.bytes)),
    uploaded: drawn.every((window) => window.same),
  };
};

const outputs = { draw: drawOutput, pass: passOutput, publish: publishOutput };

const path = process.argv.at(-1);
process.stdout.write(
  JSON.stringify(
    await (path === "draw" || path === "pass" ? outputs[path] : publishOutput)()
  )
);
