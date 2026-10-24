import { readFileSync } from "node:fs";
import path from "node:path";

import { noDistanceHideRule } from "../rushline/rules/no-distance-hide.ts";
import { runRule } from "./cases.ts";

const repository = path.join(import.meta.dirname, "../../..");

const actualSource = (file: string) => ({
  code: readFileSync(path.join(repository, file), "utf-8"),
  filename: file,
});

const distance = { messageId: "distance" };

const preFixBeacons = `
const clearView = (eye: THREE.Vector3): void => {
  for (const { object, foot } of beacons) {
    object.visible =
      Math.hypot(eye.x - foot.x, eye.z - foot.z) > BEACON_CLEARANCE;
  }
};`;

runRule("rushline/no-distance-hide", noDistanceHideRule, {
  invalid: [
    { code: preFixBeacons, errors: [distance] },
    {
      code: "if (camera.position.distanceTo(sign.position) < 3) {\n  sign.visible = false;\n}",
      errors: [distance],
    },
    {
      code: "if (eye.distanceToSquared(foot) > 9) {\n  sign.visible = true;\n} else {\n  sign.visible = false;\n}",
      errors: [distance, distance],
    },
    {
      code: "mesh.setMatrixAt(index, Math.sqrt(dx * dx + dz * dz) < 3 ? hidden : pose);",
      errors: [distance],
    },
    {
      code: "for (const tree of trees) {\n  if (tree.box.distanceToPoint(eye) <= 3) {\n    mesh.setMatrixAt(tree.index, hidden);\n  }\n}",
      errors: [distance],
    },
    {
      code: "near(eye) || (lamp.visible = toEye.subVectors(eye, lamp.position).length() > 3);",
      errors: [distance],
    },
    {
      code: "if (parts.some((part) => Math.hypot(part.x - eye.x, part.z - eye.z) < 3)) {\n  parts.forEach((part) => {\n    part.mesh.visible = false;\n  });\n}",
      errors: [distance],
    },
    {
      code: "while (offset.lengthSq() < 9) {\n  board.visible = false;\n  offset.add(step);\n}",
      errors: [distance],
    },
    {
      code: "switch (Math.sign(Math.hypot(x, z) - 3)) {\n  case -1:\n    post.visible = false;\n    break;\n  default:\n    post.visible = true;\n}",
      errors: [distance, distance],
    },
  ],
  valid: [
    "stretch.object.visible = stretch.from < to && stretch.to > from;",
    "mesh.visible = count > 0;",
    "if (!node.visible) {\n  node.visible = true;\n}",
    "const reach = Math.hypot(dx, dz);\nif (shown) {\n  part.visible = true;\n}",
    "if (reaches(unit, eye)) {\n  show(unit, false);\n}",
    "mesh.setMatrixAt(index, shown ? unit.pose : HIDDEN);",
    "for (let index = 0; index < placements.length; index += 1) {\n  mesh.setMatrixAt(index, placer.matrix);\n}",
    "const length = upper.distanceTo(lower);\nbone.position.setLength(length);",
    actualSource("apps/web/src/game/clearance.ts"),
    actualSource("apps/web/src/game/ground.ts"),
    actualSource("apps/web/src/game/hazards.ts"),
  ],
});
