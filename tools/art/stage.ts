import path from "node:path";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { ArtRejected } from "./src/art-rejected.ts";
import { stageArt } from "./src/stage.ts";
import type { StagedArt } from "./src/stage.ts";

const pairs = process.argv.slice(2);

const main = Effect.gen(function* stage() {
  const fs = yield* FileSystem.FileSystem;
  if (pairs.length === 0) {
    return yield* new ArtRejected({
      message:
        "Usage: pnpm art:stage <name>=<file> ... (for example models/bike.glb=tools/blender/out/bike.glb)",
    });
  }
  const entries = yield* Effect.all(
    pairs.map((pair) => {
      const [name, file] = pair.split("=");
      return name === undefined || file === undefined
        ? Effect.fail(
            new ArtRejected({ message: `${pair} is not <name>=<file>.` })
          )
        : Effect.map(fs.readFile(path.resolve(file)), (bytes): StagedArt => ({
            bytes,
            name,
          }));
    })
  );
  const lines = yield* stageArt(entries);
  yield* Effect.log(lines.join("\n"));
  return lines.length;
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)));
