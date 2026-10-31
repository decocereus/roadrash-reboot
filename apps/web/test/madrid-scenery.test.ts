import { stretches, stretchIds } from "@racer/track/stretches";
import type { StretchId } from "@racer/track/stretches";
import { compileTrack } from "@racer/track/track";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createShading } from "../src/game/cel.ts";
import { buildGreybox } from "../src/game/greybox.ts";
import { lookOf } from "../src/game/looks.ts";
import { isInstancedMesh, isMesh } from "../src/game/meshes.ts";

interface Cost {
  readonly draws: number;
  readonly triangles: number;
  readonly blocks: number;
}

const budgets = {
  "madrid-gran-via": { blocks: 99, draws: 4, triangles: 107_739 },
  "madrid-hook": { blocks: 48, draws: 5, triangles: 165_774 },
} as const satisfies Readonly<Record<StretchId, Cost>>;

const facesIn = (geometry: THREE.BufferGeometry): number => {
  const index = geometry.getIndex();
  return index === null
    ? (geometry.getAttribute("position")?.count ?? 0) / 3
    : index.count / 3;
};

const costOf = (id: StretchId): Cost => {
  const plan = stretches[id];
  const { scenery } = plan;
  if (scenery === undefined) {
    throw new Error(`${id} ships no scenery.`);
  }
  const greybox = buildGreybox(
    compileTrack(plan),
    scenery,
    createShading(lookOf(plan.region))
  );
  let draws = 0;
  let triangles = 0;
  greybox.traverse((object) => {
    if (isMesh(object)) {
      draws += 1;
      triangles +=
        facesIn(object.geometry) * (isInstancedMesh(object) ? object.count : 1);
    }
  });
  return { blocks: scenery.blocks.length, draws, triangles };
};

describe("what the Madrid scenery costs every frame", () => {
  it.each(stretchIds)("holds %s to its draws and triangles", (id) => {
    const cost = costOf(id);
    const budget = budgets[id];
    expect(cost.draws, `${id} scenery draw calls`).toBe(budget.draws);
    expect(cost.blocks, `${id} scenery blocks`).toBeLessThanOrEqual(
      budget.blocks
    );
    expect(cost.triangles, `${id} scenery triangles`).toBeLessThanOrEqual(
      budget.triangles
    );
  });
});
