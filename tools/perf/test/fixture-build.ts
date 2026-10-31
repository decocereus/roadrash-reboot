import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { keyOf } from "@racer/art/manifest";

import { glbNames } from "../src/build.ts";
import type { GlbName } from "../src/build.ts";
import type { Side } from "../src/sides.ts";

export const GLB_BYTES = 64;
const ATLAS_SIDE = 1024;
const VP8L_SIZE_SPAN = 2 ** 14;

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

const ROUTER_BYTES = 1500;

export interface FixtureOptions {
  readonly atlas: "webp" | "png" | null;
  readonly bikeExtraBytes: number;
  readonly missingGlb: GlbName | null;
  readonly missingEdge: boolean;
  readonly routerExtraBytes: number;
}

export const plainFixture: FixtureOptions = {
  atlas: null,
  bikeExtraBytes: 0,
  missingEdge: false,
  missingGlb: null,
  routerExtraBytes: 0,
};

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
});

const startManifest = `export const tsrStartManifest = () => ({
  routes: {
    __root__: { preloads: ["/assets/main.js"] },
    "/": { preloads: ["/assets/routes.js", "/assets/invoice.js"] },
    "/kit": { preloads: ["/assets/kit.js", "/assets/invoice.js"] },
  },
});
`;

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

const atlasImage = (format: "webp" | "png"): Uint8Array => {
  const image = new Uint8Array(32);
  const view = new DataView(image.buffer);
  if (format === "png") {
    image.set(ascii("\u0089PNG\r\n\u001A\n"));
    return image;
  }
  image.set(ascii("RIFF"));
  image.set(ascii("WEBPVP8L"), 8);
  image[20] = 0x2f;
  view.setUint32(21, ATLAS_SIDE - 1 + (ATLAS_SIDE - 1) * VP8L_SIZE_SPAN, true);
  return image;
};

const glbOf = (size: number, atlas: FixtureOptions["atlas"]): Uint8Array => {
  const image = atlas === null ? null : atlasImage(atlas);
  const gltf =
    image === null
      ? { asset: { version: "2.0" } }
      : {
          asset: { version: "2.0" },
          bufferViews: [{ buffer: 0, byteLength: image.length }],
          images: [{ bufferView: 0, mimeType: `image/${atlas}` }],
        };
  const binBytes = image === null ? 0 : 8 + image.length;
  const json = ascii(JSON.stringify(gltf).padEnd(size - 20 - binBytes, " "));
  const bytes = new Uint8Array(20 + json.length + binBytes);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("glTF"));
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, json.length, true);
  bytes.set(ascii("JSON"), 16);
  bytes.set(json, 20);
  if (image !== null) {
    view.setUint32(20 + json.length, image.length, true);
    bytes.set(ascii("BIN\u0000"), 24 + json.length);
    bytes.set(image, 28 + json.length);
  }
  return bytes;
};

export const PLATE_BYTES = 48;

export const fixtureBuild = (
  dir: string,
  name: Side["name"],
  options: FixtureOptions
) => {
  const root = path.join(dir, `side-${name}`);
  const out = path.join(dir, `out-${name}`);
  const artCache = path.join(dir, `art-${name}`);
  const manifest: Record<string, string> = {};
  const stage = (artName: string, bytes: Uint8Array): void => {
    const key = keyOf(bytes, artName.endsWith(".glb") ? "glb" : "webp");
    write(path.join(artCache, key), bytes);
    manifest[artName] = key;
  };
  for (const glb of glbNames.filter((each) => each !== options.missingGlb)) {
    stage(
      `models/${glb}.glb`,
      glbOf(
        GLB_BYTES + (glb === "bike" ? options.bikeExtraBytes : 0),
        glb === "rider_kylie" ? options.atlas : null
      )
    );
  }
  stage("clubhouse/wall.webp", new Uint8Array(PLATE_BYTES));
  write(
    path.join(root, "apps/web/src/assets/art.json"),
    JSON.stringify(manifest)
  );
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
    path.join(out, "server/assets/router.js"),
    "r".repeat(ROUTER_BYTES + options.routerExtraBytes)
  );
  write(
    path.join(out, `server/assets/start-manifest-${name}.js`),
    startManifest
  );
  write(
    path.join(out, "server/.vite/manifest.json"),
    JSON.stringify({
      _limits: { file: "assets/limits.js" },
      "server-entry.ts": {
        dynamicImports: ["src/router.tsx"],
        file: "server.js",
        imports: ["_limits"],
        isEntry: true,
      },
      "src/router.tsx": { file: "assets/router.js", imports: ["_limits"] },
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
  return { artCache, out, side };
};
