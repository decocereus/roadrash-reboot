import path from "node:path";
import { parseArgs } from "node:util";

import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { clothoids } from "@racer/track/alignment";
import type { TrackPiece, TrackPieces } from "@racer/track/alignment";
import { chevronRuns } from "@racer/track/chevron-runs";
import { readCorridor } from "@racer/track/madrid-corridor";
import type { CorridorData } from "@racer/track/madrid-schema";
import { stretches as committed } from "@racer/track/stretches";
import type {
  ChevronRun,
  GroundPoint,
  SceneryBlock,
  TrackPlan,
} from "@racer/track/track";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

import { decodeScene } from "./src/scene.ts";
import { stretchEntries } from "./src/settings.ts";
import type { StretchEntry } from "./src/settings.ts";
import { buildStretch } from "./src/stretch.ts";
import type { Stretch } from "./src/stretch.ts";

const root = path.resolve(import.meta.dirname, "../..");
const tracks = path.join(root, "packages/track/src/tracks");
const SOURCE_LIMIT = 20_000;
const BLOCKS_BUDGET = 10_000;

const options = parseArgs({
  options: {
    check: { type: "boolean" },
    id: { multiple: true, type: "string" },
  },
}).values;

const camelOf = (id: string): string =>
  id.replaceAll(/-(?<letter>[a-z])/gu, (_, letter: string) =>
    letter.toUpperCase()
  );

const hex = (value: number): string =>
  `0x${(value.toString(16).match(/..?/gu) ?? []).join("_")}`;

const points = (ring: readonly GroundPoint[]): string =>
  `[${ring.map(([x, z]) => `[${x}, ${z}]`).join(", ")}]`;

type Triple = readonly [number, number, number];

const tripleOf = (piece: TrackPiece): Triple => [
  piece.length,
  piece.endCurvature,
  piece.endGrade,
];

const triples = ([first, ...rest]: TrackPieces): readonly [
  Triple,
  ...Triple[],
] => [tripleOf(first), ...rest.map(tripleOf)];

const blockText = (block: SceneryBlock): string =>
  `{ height: ${block.height}, lift: ${block.lift}, ring: ${points(block.ring)} }`;

const blockParts = (blocks: readonly SceneryBlock[]): string[][] => {
  const parts: string[][] = [[]];
  let size = 0;
  for (const block of blocks) {
    const text = blockText(block);
    const part = parts.at(-1) ?? [];
    if (size + text.length > BLOCKS_BUDGET && part.length > 0) {
      parts.push([text]);
      size = text.length;
    } else {
      part.push(text);
      size += text.length;
    }
  }
  return parts;
};

interface Written {
  readonly path: string;
  readonly text: string;
}

const blocksModule = (name: string, part: readonly string[]): string =>
  `import type { SceneryBlock } from "../track.ts";

export const ${name}: readonly SceneryBlock[] = [${part.join(", ")}];
`;

const sceneryModule = (
  entry: StretchEntry,
  stretch: Stretch,
  names: readonly string[]
): string => {
  const camel = camelOf(entry.id);
  return `import type { Scenery } from "../track.ts";
${names.map((name, index) => `import { ${name} } from "./${entry.id}-blocks-${index + 1}.ts";`).join("\n")}

export const ${camel}Scenery: Scenery = {
  blocks: [${names.map((name) => `...${name}`).join(", ")}],
  cover: "${entry.settings.cover}",
  patches: [${stretch.patches.map((patch) => `{ cover: "${patch.cover}", ring: ${points(patch.ring)} }`).join(", ")}],
  water: [${stretch.water.map((body) => `{ level: ${body.level}, ring: ${points(body.ring)} }`).join(", ")}],
};
`;
};

const planModule = (entry: StretchEntry, stretch: Stretch): string => {
  const camel = camelOf(entry.id);
  const { road } = entry.settings;
  return `import { clothoids } from "../alignment.ts";
import { chevronRuns } from "../chevron-runs.ts";
import type { TrackPlan } from "../track.ts";
import { ${camel}Scenery } from "./${entry.id}-scenery.ts";

export const ${camel}: TrackPlan = {
  chevrons: chevronRuns["${entry.id}"],
  features: [],
  hazardsPerKilometre: ${entry.hazardsPerKilometre},
  id: "${entry.id}",
  laneWidth: ${road.laneWidth},
  lanesEachWay: ${road.lanesEachWay},
  leadInLength: ${road.leadInLength},
  level: ${entry.level},
  name: "${entry.name}",
  pieces: clothoids([${triples(stretch.pieces)
    .map((triple) => `[${triple.join(", ")}]`)
    .join(", ")}]),
  region: "${entry.region}",
  roadblocks: [],
  runoffLength: ${road.runoffLength},
  scenery: ${camel}Scenery,
  seed: ${hex(entry.seed)},
  shoulderWidth: ${road.shoulderWidth},
  start: { heading: ${stretch.start.heading}, x: ${stretch.start.x}, z: ${stretch.start.z} },
  trafficPerKilometre: ${entry.trafficPerKilometre},
  vergeWidth: ${road.vergeWidth},
};
`;
};

const modulesOf = (entry: StretchEntry, stretch: Stretch): Written[] => {
  const camel = camelOf(entry.id);
  const parts = blockParts(stretch.blocks);
  const names = parts.map((_, index) => `${camel}Blocks${index + 1}`);
  return [
    {
      path: path.join(tracks, `${entry.id}.ts`),
      text: planModule(entry, stretch),
    },
    {
      path: path.join(tracks, `${entry.id}-scenery.ts`),
      text: sceneryModule(entry, stretch, names),
    },
    ...parts.map((part, index) => ({
      path: path.join(tracks, `${entry.id}-blocks-${index + 1}.ts`),
      text: blocksModule(names[index] ?? "", part),
    })),
  ];
};

const metres = (value: number): string => `${value.toFixed(1)} m`;

const reportLines = (entry: StretchEntry, stretch: Stretch): string[] => {
  const { report } = stretch;
  const { settings } = entry;
  return [
    `${entry.id}: street ${settings.fromM} to ${settings.toM} m: ${report.streetLengthM.toFixed(0)} m of street, ${report.lengthM.toFixed(0)} m of road, tightest radius ${metres(report.tightestRadiusM)}`,
    `Distance from the street: RMS ${metres(report.rmsM)}, 95th percentile ${metres(report.p95M)}, largest ${metres(report.maxM)}, largest outside the slow places ${metres(report.outsidePlacesM)}`,
    `Smoothness: ${report.curvatureFlipsPerKilometre.toFixed(1)} curvature and ${report.gradeChangeFlipsPerKilometre.toFixed(1)} grade change sign flips per kilometre`,
    ...report.places.map(
      ({ maxM, place }) =>
        `  ${place.name} (${place.fromM} to ${place.toM} m, ${place.minRadiusM} m radius): largest ${metres(maxM)}`
    ),
    `Origin ${stretch.origin.join(", ")}; the road starts at ${metres(stretch.startHeightM)} above sea level, which is y 0`,
    `Grade fit: RMS ${metres(report.heightRmsM)}, largest ${metres(report.heightMaxM)}, steepest ${(report.steepestGrade * 100).toFixed(1)}%, sharpest change ${(report.sharpestGradeChange * 1000).toFixed(2)} per mille per metre`,
    `Blocks: ${report.keptBlocks} kept within ${settings.sceneReachM} m, ${report.droppedBlocks} dropped inside the verge, without a height or with a broken ring; ground ${settings.cover}, ${stretch.patches.length} grass patches`,
    ...report.brokenFootprints.map(
      (broken) => `  Dropped the footprint of ${broken}`
    ),
    ...report.massing.map(
      (landmark) =>
        `  ${landmark.name}: ${landmark.parts} parts up to ${metres(landmark.topM)}, nearest ${metres(landmark.clearanceM)} from the road`
    ),
    ...report.water.map(
      (body) =>
        `Water: level ${metres(body.level)}, ${body.points} points, closest to the road ${metres(body.clearanceM)}`
    ),
  ];
};

const planOf = (
  entry: StretchEntry,
  stretch: Stretch,
  chevrons: readonly ChevronRun[]
): TrackPlan => {
  const { road } = entry.settings;
  return {
    chevrons,
    features: [],
    hazardsPerKilometre: entry.hazardsPerKilometre,
    id: entry.id,
    laneWidth: road.laneWidth,
    lanesEachWay: road.lanesEachWay,
    leadInLength: road.leadInLength,
    level: entry.level,
    name: entry.name,
    pieces: clothoids(triples(stretch.pieces)),
    region: entry.region,
    roadblocks: [],
    runoffLength: road.runoffLength,
    scenery: {
      blocks: stretch.blocks,
      cover: entry.settings.cover,
      patches: stretch.patches,
      water: stretch.water,
    },
    seed: entry.seed,
    shoulderWidth: road.shoulderWidth,
    start: stretch.start,
    trafficPerKilometre: entry.trafficPerKilometre,
    vergeWidth: road.vergeWidth,
  };
};

const fieldsOf = (plan: TrackPlan): readonly (readonly [string, string])[] => [
  ["id", plan.id],
  ["name", plan.name],
  ["region", plan.region],
  ["level", String(plan.level)],
  ["seed", String(plan.seed)],
  ["lanesEachWay", String(plan.lanesEachWay)],
  ["laneWidth", String(plan.laneWidth)],
  ["shoulderWidth", String(plan.shoulderWidth)],
  ["vergeWidth", String(plan.vergeWidth)],
  ["leadInLength", String(plan.leadInLength)],
  ["runoffLength", String(plan.runoffLength)],
  ["trafficPerKilometre", String(plan.trafficPerKilometre)],
  ["hazardsPerKilometre", String(plan.hazardsPerKilometre)],
  ["features", String(plan.features.length)],
  ["roadblocks", plan.roadblocks.join(" ")],
  [
    "start",
    `heading ${plan.start.heading}, x ${plan.start.x}, z ${plan.start.z}`,
  ],
  [
    "pieces",
    triples(plan.pieces)
      .map((triple) => `[${triple.join(", ")}]`)
      .join(" "),
  ],
  [
    "chevrons",
    plan.chevrons.map((run) => `${run.from}-${run.to}/${run.side}`).join(" "),
  ],
  ["cover", plan.scenery?.cover ?? "no scenery"],
  ["blocks", (plan.scenery?.blocks ?? []).map(blockText).join(" ")],
  [
    "patches",
    (plan.scenery?.patches ?? [])
      .map((patch) => `${patch.cover} ${points(patch.ring)}`)
      .join(" "),
  ],
  [
    "water",
    (plan.scenery?.water ?? [])
      .map((body) => `${body.level} ${points(body.ring)}`)
      .join(" "),
  ],
];

const SHOWN = 90;

const differenceText = (made: string, held: string): string => {
  if (made.length <= SHOWN && held.length <= SHOWN) {
    return `${made} when built and ${held} as committed`;
  }
  let at = 0;
  while (at < made.length && at < held.length && made[at] === held[at]) {
    at += 1;
  }
  return `${made.slice(at, at + SHOWN)} when built and ${held.slice(at, at + SHOWN)} as committed, from character ${at}`;
};

const planProblems = (made: TrackPlan, held: TrackPlan): string[] => {
  const theirs = new Map(fieldsOf(held));
  return fieldsOf(made).flatMap(([field, value]) => {
    const other = theirs.get(field) ?? "";
    return value === other
      ? []
      : [`${field} is ${differenceText(value, other)}`];
  });
};

const buildStretchOf = Effect.fn("madrid.buildStretch")(
  function* buildStretchOf(data: CorridorData, entry: StretchEntry) {
    const fs = yield* FileSystem.FileSystem;
    const scene = decodeScene(
      JSON.parse(
        yield* fs.readFileString(
          path.join(import.meta.dirname, `scenes/${entry.id}.json`)
        )
      )
    );
    return buildStretch(data, scene, entry.settings);
  }
);

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const wanted = options.id ?? [];
  const chosen = stretchEntries.filter(
    (entry) => wanted.length === 0 || wanted.includes(entry.id)
  );
  if (chosen.length === 0) {
    yield* Effect.fail(
      new Error(
        `No stretch matches ${wanted.join(", ")}. Known: ${stretchEntries.map((entry) => entry.id).join(", ")}.`
      )
    );
  }
  const data = readCorridor(
    yield* fs.readFileString(
      path.join(root, "packages/track/data/madrid-corridor.json")
    )
  );
  if (options.check === true) {
    const faults: string[] = [];
    for (const entry of chosen) {
      const stretch = yield* buildStretchOf(data, entry);
      const found = planProblems(
        planOf(entry, stretch, chevronRuns[entry.id]),
        committed[entry.id]
      );
      console.log(
        found.length === 0
          ? `${entry.id} builds to its committed plan.`
          : found.map((problem) => `${entry.id}: ${problem}`).join("\n")
      );
      faults.push(...found);
    }
    if (faults.length > 0) {
      yield* Effect.fail(
        new Error(
          "The builder no longer makes the committed plan. Run pnpm madrid:stretch and commit what it writes."
        )
      );
    }
    return;
  }
  const lines: string[] = [];
  const paths: string[] = [];
  for (const entry of chosen) {
    const stretch = yield* buildStretchOf(data, entry);
    lines.push(...reportLines(entry, stretch), "");
    for (const file of modulesOf(entry, stretch)) {
      yield* fs.writeFileString(file.path, file.text);
      paths.push(file.path);
    }
  }
  const spawner = yield* ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("pnpm", ["exec", "oxfmt", ...paths], {
      cwd: root,
      stderr: "inherit",
      stdin: "ignore",
      stdout: "inherit",
    })
  );
  if (exitCode !== 0) {
    yield* Effect.fail(new Error(`Formatter exited ${exitCode}`));
  }
  for (const each of paths) {
    const size = (yield* fs.readFileString(each)).length;
    if (size > SOURCE_LIMIT) {
      yield* Effect.fail(
        new Error(
          `${path.relative(root, each)} is ${size} characters, over the ${SOURCE_LIMIT} source limit. Lower BLOCKS_BUDGET.`
        )
      );
    }
  }
  console.log(
    [
      ...lines,
      ...paths.map((each) => `Wrote ${path.relative(root, each)}`),
    ].join("\n")
  );
});

const services = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
);
NodeRuntime.runMain(main.pipe(Effect.provide(services)));
