import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { cacheDirectory, pullAll } from "./src/cache.ts";
import { readManifest } from "./src/manifest.ts";

const main = Effect.gen(function* pull() {
  const { cached, downloaded } = yield* pullAll(yield* readManifest());
  yield* Effect.log(
    `Art cache ${cacheDirectory}: ${cached} already held, ${downloaded} downloaded.`
  );
});

NodeRuntime.runMain(
  main.pipe(
    Effect.provide(
      Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerUndici)
    )
  )
);
