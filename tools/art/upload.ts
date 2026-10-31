import * as r2 from "@distilled.cloud/cloudflare/r2";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { AuthProviders } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { ArtRejected } from "./src/art-rejected.ts";
import { cachedFile } from "./src/cache.ts";
import {
  contentTypes,
  extensionOf,
  holdsKey,
  readManifest,
} from "./src/manifest.ts";
import { artBucketName, artCacheControl } from "./src/remote.ts";

const UPLOADS_AT_ONCE = 4;

const main = Effect.gen(function* upload() {
  const fs = yield* FileSystem.FileSystem;
  const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
  const keys = [...new Set(Object.values(yield* readManifest()))].toSorted();
  const stored = new Set(
    yield* r2.listObjects.items({ accountId, bucketName: artBucketName }).pipe(
      Stream.map((each) => each.key ?? ""),
      Stream.runCollect
    )
  );
  const missing = keys.filter((key) => !stored.has(key));
  const put = Effect.fnUntraced(function* put(key: string) {
    const extension = extensionOf(key);
    if (extension === null || !(yield* fs.exists(cachedFile(key)))) {
      return yield* new ArtRejected({
        message: `${key} is in the manifest but not in ${cachedFile(key)}. Stage it on the machine that made it.`,
      });
    }
    const bytes = yield* fs.readFile(cachedFile(key));
    if (!holdsKey(key, bytes)) {
      return yield* new ArtRejected({
        message: `${cachedFile(key)} does not hash to its key; delete it and stage the art again.`,
      });
    }
    yield* r2.putObject({
      accountId,
      body: bytes,
      bucketName: artBucketName,
      cacheControl: artCacheControl,
      contentType: contentTypes[extension],
      objectName: key,
    });
    yield* Effect.log(`Uploaded ${key} (${bytes.length} B)`);
    return key;
  });
  yield* Effect.all(missing.map(put), { concurrency: UPLOADS_AT_ONCE });
  yield* Effect.log(
    `${artBucketName}: ${keys.length - missing.length} keys already stored, ${missing.length} uploaded.`
  );
});

const services = Cloudflare.CloudflareApiLive().pipe(
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(Layer.succeed(AuthProviders, {}))
);

NodeRuntime.runMain(main.pipe(Effect.provide(services)));
