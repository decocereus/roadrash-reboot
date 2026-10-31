import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { Logger, NodeIO } from "@gltf-transform/core";
import type { Document, Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { stageArt } from "@racer/art/stage";
import type { StagedArt } from "@racer/art/stage";
import * as Effect from "effect/Effect";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const RAW = path.join(import.meta.dirname, "out");
const ATLAS_SIZE = 1024;

const READ_ATTRIBUTES = new Set([
  "POSITION",
  "NORMAL",
  "JOINTS_0",
  "WEIGHTS_0",
]);

const keepsChannel = (target: string | null, bone: string | undefined) =>
  target === "rotation" || (target === "translation" && bone === "pelvis");

const reads = (primitive: Primitive, semantic: string): boolean =>
  READ_ATTRIBUTES.has(semantic) ||
  (semantic === "TEXCOORD_0" &&
    (primitive.getMaterial()?.getBaseColorTexture() ?? null) !== null);

const dropUnread = (document: Document): void => {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (!reads(primitive, semantic)) {
          primitive.setAttribute(semantic, null);
        }
      }
    }
  }
  for (const material of document.getRoot().listMaterials()) {
    material
      .setNormalTexture(null)
      .setOcclusionTexture(null)
      .setEmissiveTexture(null)
      .setMetallicRoughnessTexture(null);
  }
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName.startsWith("KHR_materials_")) {
      extension.dispose();
    }
  }
  for (const animation of document.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      if (
        !keepsChannel(
          channel.getTargetPath(),
          channel.getTargetNode()?.getName()
        )
      ) {
        channel.getSampler()?.dispose();
        channel.dispose();
      }
    }
  }
};

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

const compress = async (name: string): Promise<StagedArt> => {
  const source = path.join(RAW, name);
  const document = await io.read(source);
  document.setLogger(new Logger(Logger.Verbosity.WARN));
  dropUnread(document);
  await document.transform(
    prune(),
    textureCompress({
      effort: 100,
      encoder: sharp,
      lossless: true,
      resize: [ATLAS_SIZE, ATLAS_SIZE],
      targetFormat: "webp",
    }),
    meshopt({ encoder: MeshoptEncoder, level: "high" })
  );
  const bytes = await io.writeBinary(document);
  const before = await stat(source);
  console.log(`${name}: ${before.size} -> ${bytes.length} bytes`);
  return { bytes, name: `models/${name}` };
};

const exported = await readdir(RAW);
const names = exported.filter((name) => name.endsWith(".glb"));
if (names.length === 0) {
  throw new Error(
    `No models in ${RAW}. Export them with the Blender scripts first.`
  );
}
const staged = await Promise.all(names.map(compress));
const lines = await Effect.runPromise(
  stageArt(staged).pipe(Effect.provide(NodeServices.layer))
);
console.log(lines.join("\n"));
