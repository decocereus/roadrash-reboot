import path from "node:path";
import { parseArgs } from "node:util";

import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { readCorridor } from "@racer/track/madrid-corridor";
import { Corridor } from "@racer/track/madrid-schema";
import { madridSources } from "@racer/track/madrid-sources";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";

import { acquire } from "./src/acquire.ts";
import { buildBuildings, buildLandmark, buildSignals } from "./src/context.ts";
import { buildElevation } from "./src/elevation.ts";
import { origin } from "./src/geometry.ts";
import { preview } from "./src/preview.ts";
import { buildRoads } from "./src/roads.ts";
import { decodeInputs } from "./src/schema.ts";

const root = path.resolve(import.meta.dirname, "../..");
const options = parseArgs({
  options: {
    cache: {
      default: path.join(import.meta.dirname, ".cache"),
      type: "string",
    },
    preview: {
      default: path.join(import.meta.dirname, ".cache/corridor.html"),
      type: "string",
    },
  },
}).values;
const decoder = new TextDecoder();
const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const inputs = decodeInputs(
    JSON.parse(
      yield* fs.readFileString(path.join(import.meta.dirname, "inputs.json"))
    )
  );
  yield* fs.makeDirectory(options.cache, { recursive: true });
  const bytes = new Map<string, Uint8Array>();
  for (const input of inputs) {
    bytes.set(input.file, yield* acquire(options.cache, input));
  }
  const inputBytes = (file: string): Uint8Array => {
    const result = bytes.get(file);
    if (!result) {
      throw new Error(`Unlisted input ${file}`);
    }
    return result;
  };
  const roads = buildRoads(
    decoder.decode(inputBytes("roads")),
    yield* fs.readFileString(path.join(import.meta.dirname, "route.json")),
    decoder.decode(inputBytes("widths"))
  );
  const data = readCorridor(
    JSON.stringify({
      bufferM: 180,
      buildings: buildBuildings(inputBytes("buildings.gz"), roads.line, 180),
      crs: "EPSG:25830",
      elevation: buildElevation(decoder.decode(inputBytes("elev")), roads.line),
      inputs,
      junctions: roads.junctions,
      landmarks: inputs
        .filter((input) => input.source === "wikidata-landmarks")
        .map((input) =>
          buildLandmark(decoder.decode(inputBytes(input.file)), roads.line)
        )
        .toSorted(
          (a, b) => a.atM - b.atM || a.wikidata.localeCompare(b.wikidata)
        ),
      lengthM: roads.lengthM,
      origin,
      signals: buildSignals(inputBytes("signals-csv"), roads.line),
      sources: madridSources,
      streets: roads.streets,
      version: 1,
    })
  );
  const output = `${JSON.stringify(data)}\n`;
  const schema = Schema.toJsonSchemaDocument(Corridor);
  const target = path.join(root, "packages/track/data");
  yield* fs.writeFileString(path.join(target, "madrid-corridor.json"), output);
  const schemaFile = path.join(target, "madrid-corridor.schema.json");
  yield* fs.writeFileString(
    schemaFile,
    JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...schema.schema,
      $defs: schema.definitions,
    })
  );
  const spawner = yield* ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("pnpm", ["exec", "oxfmt", schemaFile], {
      cwd: root,
      stderr: "inherit",
      stdin: "ignore",
      stdout: "inherit",
    })
  );
  if (exitCode !== 0) {
    yield* Effect.fail(new Error(`Schema formatter exited ${exitCode}`));
  }
  const font = yield* fs.readFile(
    path.join(
      root,
      "packages/ui/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"
    )
  );
  const fontLicence = yield* fs.readFileString(
    path.join(
      root,
      "packages/ui/node_modules/@fontsource-variable/geist/LICENSE"
    )
  );
  const dataLicence = yield* fs.readFileString(
    path.join(target, "CDLA-Permissive-2.0.txt")
  );
  yield* fs.makeDirectory(path.dirname(options.preview), { recursive: true });
  yield* fs.writeFileString(
    options.preview,
    preview(
      data,
      { dataLicence, font: Buffer.from(font).toString("base64"), fontLicence },
      Buffer.byteLength(output)
    )
  );
  console.log(
    `${data.lengthM} m · ${Buffer.byteLength(output)} bytes · ${data.buildings.length} buildings · ${data.junctions.length} junctions · ${data.signals.length} signal devices`
  );
  console.log(`Preview: ${options.preview}`);
});

const services = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
);
NodeRuntime.runMain(main.pipe(Effect.provide(services)));
