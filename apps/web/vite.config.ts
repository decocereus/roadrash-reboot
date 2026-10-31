import { execFileSync } from "node:child_process";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodePath from "@effect/platform-node/NodePath";
import { artBytes } from "@racer/art/cache";
import { ArtKey, contentTypes, extensionOf } from "@racer/art/manifest";
import { artCacheControl } from "@racer/art/remote";
import { jsonlStoreLayer } from "@racer/telemetry/jsonl-store";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";

import { installLocalTelemetry } from "./src/server/telemetry-local.ts";

const sessionsDirectory = path.resolve(
  import.meta.dirname,
  "../../tools/perf/results/sessions"
);

const git = (...args: string[]): string | null => {
  try {
    return execFileSync("git", args, {
      cwd: import.meta.dirname,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
};

const buildIdentity = () => ({
  dirty: (git("status", "--porcelain") ?? "") !== "",
  sha: git("rev-parse", "--short=12", "HEAD") ?? "unknown",
});

const provideLocalStore = () => {
  installLocalTelemetry(
    jsonlStoreLayer(sessionsDirectory).pipe(
      Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
    )
  );
};

const localTelemetry = (): Plugin => ({
  configurePreviewServer: provideLocalStore,
  configureServer: provideLocalStore,
  name: "rushline-local-telemetry",
});

const isArtKey = Schema.is(ArtKey);
const artServices = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  NodeHttpClient.layerUndici
);

const serveArt: Connect.NextHandleFunction = (request, response) => {
  const key = (request.url ?? "").slice(1);
  const extension = extensionOf(key);
  if (!isArtKey(key) || extension === null) {
    response.statusCode = 404;
    response.end(`No art is stored at ${key}.`);
    return;
  }
  Effect.runFork(
    artBytes(key).pipe(
      Effect.match({
        onFailure: (failure) => {
          response.statusCode = 502;
          response.end(failure.message);
        },
        onSuccess: (bytes) => {
          response.setHeader("cache-control", artCacheControl);
          response.setHeader("content-type", contentTypes[extension]);
          response.end(bytes);
        },
      }),
      Effect.provide(artServices)
    )
  );
};

const localArt = (): Plugin => ({
  configurePreviewServer: (server) => {
    server.middlewares.use("/art", serveArt);
  },
  configureServer: (server) => {
    server.middlewares.use("/art", serveArt);
  },
  name: "rushline-local-art",
});

export default defineConfig({
  build: { rolldownOptions: { external: [/^cloudflare:/u] } },
  define: { __RUSHLINE_BUILD__: JSON.stringify(buildIdentity()) },
  plugins: [
    localArt(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    localTelemetry(),
  ],
  ssr: { noExternal: ["srvx"] },
});
