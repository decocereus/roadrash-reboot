import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { glbNames } from "../src/build.ts";
import type { Side } from "../src/sides.ts";

const GLB_BYTES = 64;

const ROUTE_CHUNK = "src/routes/index.tsx?tsr-split=component";
const KIT_CHUNK = "src/routes/kit.tsx?tsr-split=component";
const ENTRY_CHUNK = "client-entry.tsx";

const clientFiles = {
  "assets/asset-runtime.js": 300,
  "assets/game.js": 5000,
  "assets/invoice.js": 700,
  "assets/kit.js": 900,
  "assets/main.js": 4000,
  "assets/routes.js": 1200,
  "assets/shared.js": 2500,
  "assets/styles.css": 600,
  "assets/uploader-runtime.js": 400,
};

export interface FixtureOptions {
  readonly bikeExtraBytes: number;
  readonly missingEdge: boolean;
}

const write = (file: string, content: string | Uint8Array): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
};

const clientManifest = (missingEdge: boolean) => ({
  _invoice: { file: "assets/invoice.js", imports: [ENTRY_CHUNK] },
  _shared: { file: "assets/shared.js" },
  [ENTRY_CHUNK]: {
    file: "assets/main.js",
    imports: ["_shared"],
    isEntry: true,
  },
  [KIT_CHUNK]: { file: "assets/kit.js", imports: [ENTRY_CHUNK, "_invoice"] },
  [ROUTE_CHUNK]: {
    file: "assets/routes.js",
    imports: [
      ENTRY_CHUNK,
      "_shared",
      "_invoice",
      ...(missingEdge ? ["_missing"] : []),
    ],
  },
  "src/asset-runtime.ts": {
    assets: glbNames.map((name) => `assets/${name}.glb`),
    file: "assets/asset-runtime.js",
    imports: ["_shared"],
    src: "src/asset-runtime.ts",
  },
  "src/diagnostics/uploader-runtime.ts": {
    file: "assets/uploader-runtime.js",
    imports: ["_shared", ROUTE_CHUNK],
    src: "src/diagnostics/uploader-runtime.ts",
  },
  "src/game/game.ts": {
    file: "assets/game.js",
    imports: ["_shared", ROUTE_CHUNK],
    src: "src/game/game.ts",
  },
  ...Object.fromEntries(
    glbNames.map((name) => [
      `src/game/models/${name}.glb`,
      { file: `assets/${name}.glb`, src: `src/game/models/${name}.glb` },
    ])
  ),
});

const startManifest = `export const tsrStartManifest = () => ({
  routes: {
    __root__: { preloads: ["/assets/main.js"] },
    "/": { preloads: ["/assets/routes.js", "/assets/invoice.js"] },
    "/kit": { preloads: ["/assets/kit.js", "/assets/invoice.js"] },
  },
});
`;

export const fixtureBuild = (
  dir: string,
  name: Side["name"],
  options: FixtureOptions
) => {
  const root = path.join(dir, `side-${name}`);
  const out = path.join(dir, `out-${name}`);
  for (const glb of glbNames) {
    const bytes = new Uint8Array(
      GLB_BYTES + (glb === "bike" ? options.bikeExtraBytes : 0)
    ).fill(glb.length);
    write(path.join(root, "apps/web/src/game/models", `${glb}.glb`), bytes);
    write(path.join(out, "client/assets", `${glb}.glb`), bytes);
  }
  for (const [file, size] of Object.entries(clientFiles)) {
    write(path.join(out, "client", file), "x".repeat(size));
  }
  write(
    path.join(out, "client/.vite/manifest.json"),
    JSON.stringify(clientManifest(options.missingEdge))
  );
  write(path.join(out, "server/server.js"), "s".repeat(3000));
  write(path.join(out, "server/assets/limits.js"), "l".repeat(200));
  write(
    path.join(out, `server/assets/start-manifest-${name}.js`),
    startManifest
  );
  write(
    path.join(out, "server/.vite/manifest.json"),
    JSON.stringify({
      _limits: { file: "assets/limits.js" },
      "server-entry.ts": {
        file: "server.js",
        imports: ["_limits"],
        isEntry: true,
      },
      "tanstack-start-manifest:v": {
        file: `assets/start-manifest-${name}.js`,
      },
    })
  );
  const side: Side = {
    dirty: false,
    name,
    revision: "fixture",
    root,
    sourceDigest: "fixture",
    sourceFiles: 0,
  };
  return { out, side };
};
