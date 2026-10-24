import path from "node:path";

import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { readCorridor } from "@racer/track/madrid-corridor";
import { Point } from "@racer/track/madrid-schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";

import { buildHook } from "./src/hook.ts";
import type { Hook, HookSettings } from "./src/hook.ts";

const root = path.resolve(import.meta.dirname, "../..");
const target = path.join(root, "packages/track/src/tracks/madrid-hook.ts");
const decodeLake = Schema.decodeUnknownSync(
  Schema.Struct({ ring: Schema.NonEmptyArray(Point) })
);

const LANE_WIDTH = 3.5;
const SHOULDER_WIDTH = 0.5;
const VERGE_WIDTH = 5;

const settings: HookSettings = {
  fromM: 3600,
  lakeDropM: 1.5,
  leadInLength: 80,
  minRadiusM: 60,
  pieceLengthM: 25,
  places: [
    {
      fromM: 4030,
      minRadiusM: 35,
      name: "Embarcadero S-bend by the boathouse",
      toM: 4230,
    },
    {
      fromM: 4380,
      minRadiusM: 25,
      name: "Glorieta de los Patines",
      toM: 4620,
    },
  ],
  runoffLength: 200,
  sceneReachM: 180,
  toM: 4650,
  vergeHalfWidthM: LANE_WIDTH + SHOULDER_WIDTH + VERGE_WIDTH,
};

const points = (ring: readonly (readonly [number, number])[]): string =>
  `[${ring.map(([x, z]) => `[${x}, ${z}]`).join(", ")}]`;

const moduleOf = (
  hook: Hook
): string => `import { clothoids } from "../alignment.ts";
import type { TrackPlan } from "../track.ts";

export const madridHook: TrackPlan = {
  features: [],
  hazardsPerKilometre: 2,
  id: "madrid-hook",
  laneWidth: ${LANE_WIDTH},
  lanesEachWay: 1,
  leadInLength: ${settings.leadInLength},
  level: 1,
  name: "Casa de Campo hook",
  pieces: clothoids([${hook.pieces.map((piece) => `[${piece.length}, ${piece.endCurvature}, ${piece.endGrade}]`).join(", ")}]),
  region: "casa-de-campo",
  roadblocks: [],
  runoffLength: ${settings.runoffLength},
  scenery: {
    blocks: [${hook.blocks.map((block) => `{ height: ${block.height}, ring: ${points(block.ring)} }`).join(", ")}],
    lake: { level: ${hook.lake.level}, ring: ${points(hook.lake.ring)} },
  },
  seed: 0x4d_48_4b,
  shoulderWidth: ${SHOULDER_WIDTH},
  start: { heading: ${hook.start.heading}, x: ${hook.start.x}, z: ${hook.start.z} },
  trafficPerKilometre: 6,
  vergeWidth: ${VERGE_WIDTH},
};
`;

const metres = (value: number): string => `${value.toFixed(1)} m`;

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const data = readCorridor(
    yield* fs.readFileString(
      path.join(root, "packages/track/data/madrid-corridor.json")
    )
  );
  const lake = decodeLake(
    JSON.parse(
      yield* fs.readFileString(path.join(import.meta.dirname, "lake.json"))
    )
  );
  const hook = buildHook(data, lake.ring, settings);
  yield* fs.writeFileString(target, moduleOf(hook));
  const spawner = yield* ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("pnpm", ["exec", "oxfmt", target], {
      cwd: root,
      stderr: "inherit",
      stdin: "ignore",
      stdout: "inherit",
    })
  );
  if (exitCode !== 0) {
    yield* Effect.fail(new Error(`Formatter exited ${exitCode}`));
  }
  const { report } = hook;
  console.log(
    [
      `Street ${settings.fromM} to ${settings.toM} m: ${report.streetLengthM.toFixed(0)} m of street, ${report.lengthM.toFixed(0)} m of road, tightest radius ${metres(report.tightestRadiusM)}`,
      `Distance from the street: RMS ${metres(report.rmsM)}, 95th percentile ${metres(report.p95M)}, largest ${metres(report.maxM)}, largest outside the slow places ${metres(report.outsidePlacesM)}`,
      `Smoothness: ${report.curvatureFlipsPerKilometre.toFixed(1)} curvature sign flips per kilometre, largest grade step ${(report.largestGradeStep * 100).toFixed(1)}%`,
      ...report.places.map(
        ({ maxM, place }) =>
          `  ${place.name} (${place.fromM} to ${place.toM} m, ${place.minRadiusM} m radius): largest ${metres(maxM)}`
      ),
      `Origin ${hook.origin.join(", ")}; the road starts at ${metres(hook.startHeightM)} above sea level, which is y 0`,
      `Grade fit: RMS ${metres(report.heightRmsM)}, largest ${metres(report.heightMaxM)}, steepest ${(report.steepestGrade * 100).toFixed(1)}%, sharpest change ${(report.sharpestGradeChange * 1000).toFixed(2)} per mille per metre`,
      `Blocks: ${report.keptBlocks} kept, ${report.droppedBlocks} dropped inside the verge or without a height`,
      `Lake: level ${metres(hook.lake.level)}, ${hook.lake.ring.length} points, closest to the road ${metres(report.lakeClearanceM)}`,
      `Wrote ${path.relative(root, target)}`,
    ].join("\n")
  );
});

const services = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
);
NodeRuntime.runMain(main.pipe(Effect.provide(services)));
