import { execFileSync } from "node:child_process";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { jsonlStoreLayer } from "@racer/telemetry/jsonl-store";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import * as Layer from "effect/Layer";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

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

export default defineConfig({
  build: { rolldownOptions: { external: [/^cloudflare:/u] } },
  define: { __RUSHLINE_BUILD__: JSON.stringify(buildIdentity()) },
  plugins: [tailwindcss(), tanstackStart(), viteReact(), localTelemetry()],
  ssr: { noExternal: ["srvx"] },
});
