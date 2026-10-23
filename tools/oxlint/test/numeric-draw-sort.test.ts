import { readFileSync } from "node:fs";
import path from "node:path";

import { numericDrawSortRule } from "../rushline/rules/numeric-draw-sort.ts";
import { runRule } from "./cases.ts";

const repository = path.join(import.meta.dirname, "../../..");

const uuid = { messageId: "uuid" };
const lookup = (name: string) => ({ data: { name }, messageId: "lookup" });
const unreadable = { messageId: "unreadable" };

const variantOf = `
const variantOf = (object: THREE.Object3D): number => {
  if (object instanceof THREE.InstancedMesh) {
    return 1;
  }
  return object instanceof THREE.SkinnedMesh ? 2 : 0;
};
`;

const beforeMaterialIds = `${variantOf}
const byMaterial = (a: THREE.Material, b: THREE.Material): number => {
  if (a.uuid === b.uuid) {
    return 0;
  }
  return a.uuid < b.uuid ? -1 : 1;
};

const byVariantThenMaterial = (
  a: THREE.RenderItem,
  b: THREE.RenderItem
): number =>
  a.groupOrder - b.groupOrder ||
  a.renderOrder - b.renderOrder ||
  variantOf(a.object) - variantOf(b.object) ||
  byMaterial(a.material, b.material) ||
  a.z - b.z;

export const createPipeline = (renderer: THREE.WebGLRenderer) => {
  renderer.setOpaqueSort(byVariantThenMaterial);
};
`;

const materialNumbering = `${variantOf}
const materialOrder = new WeakMap<THREE.Material, number>();
let materialsSeen = 0;

const orderOf = (material: THREE.Material): number => {
  const known = materialOrder.get(material);
  if (known !== undefined) {
    return known;
  }
  materialsSeen += 1;
  materialOrder.set(material, materialsSeen);
  return materialsSeen;
};

const byVariantThenMaterial = (
  a: THREE.RenderItem,
  b: THREE.RenderItem
): number =>
  a.groupOrder - b.groupOrder ||
  a.renderOrder - b.renderOrder ||
  variantOf(a.object) - variantOf(b.object) ||
  orderOf(a.material) - orderOf(b.material) ||
  a.z - b.z;

export const createPipeline = (renderer: THREE.WebGLRenderer) => {
  renderer.setOpaqueSort(byVariantThenMaterial);
};
`;

const arrayWalks = `
const rankOf = (item: THREE.RenderItem): number =>
  ranks.find((rank) => rank.material === item.material)?.order ??
  ranks.findIndex((rank) => rank.object === item.object) +
    Number(names.includes(item.material.name)) +
    ranks.sort(byOrder).length +
    ranks.toSorted(byOrder).length +
    ranks.map((rank) => rank.order).filter(Boolean).reduce(add, 0);

renderer.setOpaqueSort((a, b) => rankOf(a) - rankOf(b));
`;

runRule("rushline/numeric-draw-sort", numericDrawSortRule, {
  invalid: [
    { code: beforeMaterialIds, errors: [uuid, uuid, uuid, uuid] },
    { code: materialNumbering, errors: [lookup("get")] },
    {
      code: arrayWalks,
      errors: [
        lookup("find"),
        lookup("findIndex"),
        lookup("includes"),
        lookup("sort"),
        lookup("toSorted"),
        lookup("map"),
        lookup("filter"),
        lookup("reduce"),
      ],
    },
    {
      code: "renderer.setTransparentSort((a, b) => a.material.name.localeCompare(b.material.name));",
      errors: [lookup("localeCompare")],
    },
    {
      code: "function byName(a, b) {\n  return a.material.name.localeCompare(b.material.name);\n}\nrenderer.setOpaqueSort(byName);",
      errors: [lookup("localeCompare")],
    },
    {
      code: 'renderer.setOpaqueSort((a, b) => Number(seen["has"](a.material)) - Number(seen["has"](b.material)));',
      errors: [lookup("has"), lookup("has")],
    },
    {
      code: 'renderer.setOpaqueSort((a, b) => (a.material["uuid"] < b.material[`uuid`] ? -1 : 1));',
      errors: [uuid, uuid],
    },
    {
      code: "renderer.setOpaqueSort((a, b) => (order?.get(a.material) ?? 0) - (order?.get(b.material) ?? 0));",
      errors: [lookup("get"), lookup("get")],
    },
    {
      code: "renderer.setOpaqueSort((a, b) => order.indexOf(a.material) - order.indexOf(b.material));",
      errors: [lookup("indexOf"), lookup("indexOf")],
    },
    {
      code: "const keyOf = (item) => item.material.uuid;\nconst rankOf = (item) => keyOf(item);\nrenderer.setOpaqueSort((a, b) => (rankOf(a) < rankOf(b) ? -1 : 1));",
      errors: [uuid],
    },
    {
      code: "renderer.setOpaqueSort((a, b) => {\n  const { uuid: key } = a.material;\n  return key === b.material.uuid ? 0 : 1;\n});",
      errors: [uuid, uuid],
    },
    {
      code: 'import { byMaterial } from "./sorts.ts";\nrenderer.setOpaqueSort(byMaterial);',
      errors: [unreadable],
    },
    {
      code: "renderer.setOpaqueSort(sortBy(depth));",
      errors: [unreadable],
    },
    {
      code: "let byDepth = (a, b) => a.z - b.z;\nrenderer.setOpaqueSort(byDepth);",
      errors: [unreadable],
    },
    {
      code: 'import { rankOf } from "./ranks.ts";\nrenderer.setOpaqueSort((a, b) => rankOf(a) - rankOf(b));',
      errors: [
        { data: { name: "rankOf" }, messageId: "unreadableHelper" },
        { data: { name: "rankOf" }, messageId: "unreadableHelper" },
      ],
    },
  ],
  valid: [
    {
      code: readFileSync(
        path.join(repository, "apps/web/src/game/post.ts"),
        "utf-8"
      ),
      filename: "apps/web/src/game/post.ts",
    },
    "renderer.setOpaqueSort(null);",
    `${variantOf}
renderer.setOpaqueSort(
  (a, b) =>
    a.groupOrder - b.groupOrder ||
    variantOf(a.object) - variantOf(b.object) ||
    a.material.id - b.material.id ||
    a.z - b.z
);`,
    "renderer.setTransparentSort((a, b) => Math.sign(b.z - a.z) || Number(a.id) - Number(b.id));",
    "const names = new Map();\nconst label = (material) => names.get(material.uuid);\nrenderer.setOpaqueSort((a, b) => a.z - b.z);\nstandings.sort((a, b) => a.name.localeCompare(b.name));",
  ],
});
