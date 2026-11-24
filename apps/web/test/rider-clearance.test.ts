import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { BikeModel } from "../src/game/assets.ts";
import { BIKE_TURN } from "../src/game/bike-fit.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { paletteOf } from "../src/game/figure-rig.ts";
import { lookOf } from "../src/game/looks.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { Stance } from "../src/game/rider-figure.ts";
import { artFile } from "./art-files.ts";
import { bodyOf, seatedStance } from "./seated-contacts.ts";

const CELL = 0.02;
const SINK = 0.005;
const RESTING = 0.02;
const SETTLED = 1;
const SETTLE_STEPS = 8;
const RIDING_SPEED = 30;
const FLAT = 1e-6;

const upperBody: ReadonlySet<string> = new Set([
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "head",
  "clavicle_l",
  "clavicle_r",
  "upperarm_l",
  "upperarm_r",
  "lowerarm_l",
  "lowerarm_r",
]);

const chest: ReadonlySet<string> = new Set(["spine_02", "spine_03"]);

const riding: readonly (readonly [string, Partial<Stance>])[] = [
  ["rest", {}],
  ["tuck", { tuck: 1 }],
  ["lean left", { lean: -1, speed: RIDING_SPEED }],
  ["lean right", { lean: 1, speed: RIDING_SPEED }],
  ["tucked lean left", { lean: -1, speed: RIDING_SPEED, tuck: 1 }],
  ["tucked lean right", { lean: 1, speed: RIDING_SPEED, tuck: 1 }],
];

type Triangle = readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];

interface Crossing {
  readonly y: number;
  readonly facesUp: boolean;
}

const cellOf = (value: number) => Math.floor(value / CELL);

const keyOf = (x: number, z: number) => `${x},${z}`;

const trianglesOf = (bike: BikeModel): Triangle[] => {
  const triangles: Triangle[] = [];
  for (const primitives of bike.parts.values()) {
    for (const { geometry } of primitives) {
      const position = geometry.getAttribute("position");
      const index = geometry.getIndex();
      const count = index ? index.count : position.count;
      const corner = (at: number) =>
        new THREE.Vector3()
          .fromBufferAttribute(position, index ? index.getX(at) : at)
          .applyMatrix4(BIKE_TURN);
      for (let at = 0; at < count; at += 3) {
        triangles.push([corner(at), corner(at + 1), corner(at + 2)]);
      }
    }
  }
  return triangles;
};

const crossingOf = (
  [a, b, c]: Triangle,
  x: number,
  z: number
): Crossing | null => {
  const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
  if (Math.abs(area) < FLAT) {
    return null;
  }
  const u = ((x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z)) / area;
  const v = ((b.x - a.x) * (z - a.z) - (x - a.x) * (b.z - a.z)) / area;
  if (u < 0 || v < 0 || u + v > 1) {
    return null;
  }
  return { facesUp: area < 0, y: a.y + u * (b.y - a.y) + v * (c.y - a.y) };
};

const verticalCrossings = (bike: BikeModel) => {
  const cells = new Map<string, Triangle[]>();
  for (const triangle of trianglesOf(bike)) {
    const xs = triangle.map((corner) => corner.x);
    const zs = triangle.map((corner) => corner.z);
    for (
      let x = cellOf(Math.min(...xs));
      x <= cellOf(Math.max(...xs));
      x += 1
    ) {
      for (
        let z = cellOf(Math.min(...zs));
        z <= cellOf(Math.max(...zs));
        z += 1
      ) {
        const key = keyOf(x, z);
        const list = cells.get(key) ?? [];
        list.push(triangle);
        cells.set(key, list);
      }
    }
  }
  return (x: number, z: number): Crossing[] =>
    (cells.get(keyOf(cellOf(x), cellOf(z))) ?? []).flatMap((triangle) => {
      const crossing = crossingOf(triangle, x, z);
      return crossing ? [crossing] : [];
    });
};

const heightAbove = (crossings: readonly Crossing[], y: number): number => {
  let above: Crossing | null = null;
  let below = -Infinity;
  for (const crossing of crossings) {
    if (crossing.y >= y) {
      if (above === null || crossing.y < above.y) {
        above = crossing;
      }
    } else {
      below = Math.max(below, crossing.y);
    }
  }
  return above !== null && above.facesUp ? y - above.y : y - below;
};

const shading = createShading(lookOf("salt-coast"));

const bikeOf = async (model: BikeModelId): Promise<BikeModel> => {
  const url = modelUrls.bikes[model];
  const { value } = await assetParsers.bike(artFile(url), url);
  return value;
};

const ridden = async (url: string, model: BikeModelId) => {
  const bike = await bikeOf(model);
  const { value } = await assetParsers.rider(artFile(url), url);
  const figure = createRiderFigure(value, shading, paletteOf(0));
  figure.mount(new THREE.Object3D(), bike.fit, 0);
  const crossings = verticalCrossings(bike);
  const lowest = (stance: Partial<Stance>, bones: ReadonlySet<string>) => {
    for (let step = 0; step < SETTLE_STEPS; step += 1) {
      figure.animate(seatedStance(stance), SETTLED);
    }
    figure.root.updateMatrixWorld(true);
    const body = bodyOf(figure.root);
    const position = body.geometry.getAttribute("position");
    const skinIndex = body.geometry.getAttribute("skinIndex");
    const skinWeight = body.geometry.getAttribute("skinWeight");
    const vertex = new THREE.Vector3();
    let gap = Infinity;
    let where = "";
    for (let at = 0; at < position.count; at += 1) {
      let owner = 0;
      for (let slot = 1; slot < 4; slot += 1) {
        if (
          skinWeight.getComponent(at, slot) > skinWeight.getComponent(at, owner)
        ) {
          owner = slot;
        }
      }
      const bone = body.skeleton.bones[skinIndex.getComponent(at, owner)];
      if (!(bone && bones.has(bone.name))) {
        continue;
      }
      body.getVertexPosition(at, vertex).applyMatrix4(body.matrixWorld);
      const height = heightAbove(crossings(vertex.x, vertex.z), vertex.y);
      if (height < gap) {
        gap = height;
        where = `${bone.name} at ${vertex
          .toArray()
          .map((coordinate) => coordinate.toFixed(2))
          .join(" ")}`;
      }
    }
    return { gap, where };
  };
  return { figure, lowest };
};

const riderUrls = [
  ...modelUrls.figures,
  ...Object.values(modelUrls.celebrities),
];

const pairs = riderUrls.flatMap((url) =>
  bikeModelIds.map((model) => [url, model] as const)
);

const millimetres = (metres: number) => `${(metres * 1000).toFixed(0)} mm`;

describe("rider clearance against the bike's own triangles", () => {
  it.each(pairs)(
    "%s on the %s keeps the upper body out of the bike in every riding pose",
    async (url, model) => {
      const { figure, lowest } = await ridden(url, model);
      const sunk = riding.flatMap(([name, stance]) => {
        const { gap, where } = lowest(stance, upperBody);
        return gap < -SINK ? [`${name}: ${where} ${millimetres(gap)}`] : [];
      });
      figure.dispose();
      expect(sunk).toStrictEqual([]);
    }
  );

  it.each(pairs)(
    "%s on the %s lies with the chest on the tank in a full tuck",
    async (url, model) => {
      const { figure, lowest } = await ridden(url, model);
      const { gap, where } = lowest({ tuck: 1 }, chest);
      figure.dispose();
      const floating =
        gap > RESTING ? [`${where} ${millimetres(gap)} above the bike`] : [];
      expect(floating).toStrictEqual([]);
    }
  );
});
