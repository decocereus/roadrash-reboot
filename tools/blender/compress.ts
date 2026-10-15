import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { Logger, NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const RAW = path.join(import.meta.dirname, "out");
const SHIPPED = path.join(
  import.meta.dirname,
  "..",
  "..",
  "apps",
  "web",
  "src",
  "game",
  "models"
);

const READ_ATTRIBUTES = new Set([
  "POSITION",
  "NORMAL",
  "JOINTS_0",
  "WEIGHTS_0",
]);

const keepsChannel = (target: string | null, bone: string | undefined) =>
  target === "rotation" || (target === "translation" && bone === "pelvis");

const dropUnread = (document: Document): void => {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (!READ_ATTRIBUTES.has(semantic)) {
          primitive.setAttribute(semantic, null);
        }
      }
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

const compress = async (name: string): Promise<string> => {
  const source = path.join(RAW, name);
  const target = path.join(SHIPPED, name);
  const document = await io.read(source);
  document.setLogger(new Logger(Logger.Verbosity.WARN));
  dropUnread(document);
  await document.transform(
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: "high" })
  );
  await io.write(target, document);
  const [before, after] = await Promise.all([stat(source), stat(target)]);
  return `${name}: ${before.size} -> ${after.size} bytes`;
};

const exported = await readdir(RAW);
const names = exported.filter((name) => name.endsWith(".glb"));
if (names.length === 0) {
  throw new Error(
    `No models in ${RAW}. Export them with the Blender scripts first.`
  );
}
await mkdir(SHIPPED, { recursive: true });
for (const line of await Promise.all(names.map(compress))) {
  console.log(line);
}
