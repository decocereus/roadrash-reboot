import { readFileSync } from "node:fs";
import path from "node:path";

import { rangedBufferUploadRule } from "../rushline/rules/ranged-buffer-upload.ts";
import { runRule } from "./cases.ts";

const repository = path.join(import.meta.dirname, "../../..");

const actualSource = (file: string) => ({
  code: readFileSync(path.join(repository, file), "utf-8"),
  filename: file,
});

const unranged = { messageId: "unranged" };

const preFixBikes = `
const paint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
const trim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
const commit = () => {
  for (const { mesh } of parts) {
    mesh.count = slot;
    mesh.visible = slot > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (beacons) {
    beacons.count = cop;
    beacons.visible = cop > 0;
    beacons.instanceMatrix.needsUpdate = true;
  }
  if (recoloured) {
    paint.needsUpdate = true;
    trim.needsUpdate = true;
  }
};`;

const preFixFleet = `
for (const part of parts) {
  part.mesh.count = slot;
  part.mesh.instanceMatrix.needsUpdate = true;
  if (part.painted && part.mesh.instanceColor) {
    part.mesh.instanceColor.needsUpdate = true;
  }
}`;

const preFixDust = `
const position = new THREE.BufferAttribute(positions, 3);
const size = new THREE.BufferAttribute(sizes, 1);
const alpha = new THREE.BufferAttribute(alphas, 1);
const settle = () => {
  geometry.setDrawRange(0, shown);
  if (shown > 0) {
    position.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
  }
};`;

runRule("rushline/ranged-buffer-upload", rangedBufferUploadRule, {
  invalid: [
    { code: preFixBikes, errors: [unranged, unranged, unranged, unranged] },
    { code: preFixFleet, errors: [unranged, unranged] },
    { code: preFixDust, errors: [unranged, unranged, unranged] },
    {
      code: "if (shown > 0) { mesh.instanceMatrix.needsUpdate = true; }",
      errors: [unranged],
    },
    {
      code: "for (const mesh of meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }",
      errors: [unranged],
    },
    {
      code: "geometry.attributes.position.needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: "geometry.attributes[name].needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: 'geometry.getAttribute("position").needsUpdate = true;',
      errors: [unranged],
    },
    {
      code: 'mesh["instanceMatrix"]["needsUpdate"] = true;',
      errors: [unranged],
    },
    {
      code: "mesh.instanceColor!.needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: "const matrix = mesh.instanceMatrix;\nmatrix.needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: 'const position = geometry.getAttribute("position");\nconst moved = position;\nmoved.needsUpdate = true;',
      errors: [unranged],
    },
    {
      code: "const colours = new Float32BufferAttribute(values, 3);\ncolours.needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: "const mark = (attribute: THREE.InstancedBufferAttribute | null) => {\n  if (attribute) {\n    attribute.needsUpdate = true;\n  }\n};",
      errors: [unranged],
    },
    {
      code: "let paint: BufferAttribute | null = null;\nconst mark = () => {\n  if (paint) {\n    paint.needsUpdate = true;\n  }\n};",
      errors: [unranged],
    },
    {
      code: "mesh.instanceMatrix.needsUpdate = changed;",
      errors: [unranged],
    },
    {
      code: "mesh.instanceColor.addUpdateRange(0, 3);\nmesh.instanceMatrix.needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: "parts[0].mesh.instanceMatrix.addUpdateRange(0, 16);\nparts[1].mesh.instanceMatrix.needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: "const mark = (attribute: THREE.BufferAttribute) => {\n  attribute.addUpdateRange(0, 3);\n  shown += 1;\n  attribute.needsUpdate = true;\n};",
      errors: [unranged],
    },
    {
      code: "const mark = (attribute: THREE.BufferAttribute) => {\n  if (shown > 0) {\n    attribute.addUpdateRange(0, 3);\n  }\n  attribute.needsUpdate = true;\n};",
      errors: [unranged],
    },
    {
      code: "if (shown > 0) mesh.instanceMatrix.needsUpdate = true;",
      errors: [unranged],
    },
    {
      code: "const mark = (attribute: THREE.BufferAttribute) => (attribute.needsUpdate = true);",
      errors: [unranged],
    },
  ],
  valid: [
    actualSource("apps/web/src/game/uploads.ts"),
    actualSource("apps/web/src/game/actors.ts"),
    actualSource("apps/web/src/game/puffs.ts"),
    actualSource("apps/web/src/game/hazards.ts"),
    actualSource("apps/web/src/game/ground.ts"),
    actualSource("apps/web/src/game/cel.ts"),
    actualSource("apps/web/src/game/post.ts"),
    "material.needsUpdate = true;",
    "texture.needsUpdate = true;",
    "renderer.shadowMap.needsUpdate = true;",
    "target.texture.needsUpdate = true;",
    "const ramp = new THREE.DataTexture(data, 4, 1);\nramp.needsUpdate = true;",
    "const mark = (material: THREE.Material) => {\n  material.needsUpdate = true;\n};",
    "mesh.instanceMatrix.needsUpdate = false;",
    "mesh.instanceMatrix.addUpdateRange(0, 16);\nmesh.instanceMatrix.needsUpdate = true;",
    'mesh["instanceMatrix"].addUpdateRange(0, 16);\nmesh.instanceMatrix.needsUpdate = true;',
    'geometry.getAttribute("position").addUpdateRange(0, 3);\ngeometry.getAttribute("position").needsUpdate = true;',
    "const mark = (attribute: THREE.BufferAttribute) => {\n  attribute.addUpdateRange(0, 3);\n  attribute.needsUpdate = true;\n};",
    "switch (kind) {\n  case 1:\n    mesh.instanceMatrix.addUpdateRange(0, 16);\n    mesh.instanceMatrix.needsUpdate = true;\n    break;\n}",
  ],
});
