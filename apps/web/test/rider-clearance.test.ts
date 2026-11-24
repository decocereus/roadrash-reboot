import { GARAGE_PLINTH } from "@racer/sim/lobby-floor";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { BikeModel } from "../src/game/assets.ts";
import { FOV, GARAGE_SHOT } from "../src/game/bar-camera.ts";
import { BIKE_TURN } from "../src/game/bike-fit.ts";
import type { BikeFit } from "../src/game/bike-fit.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { BARE_FRONT, clothOf } from "../src/game/figure-chest.ts";
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
const SCREEN_ROWS = 1080;
const BARE_DIGITS = 4;
const SEEN_PIXELS = 2;

const torso: ReadonlySet<string> = new Set([
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "head",
  "clavicle_l",
  "clavicle_r",
]);

const arms: ReadonlySet<string> = new Set([
  "upperarm_l",
  "upperarm_r",
  "lowerarm_l",
  "lowerarm_r",
]);

const chest: ReadonlySet<string> = new Set(["spine_02", "spine_03"]);

const riding: readonly (readonly [string, Partial<Stance>])[] = [
  ["rest", {}],
  ["a quarter tuck", { tuck: 0.25 }],
  ["half a tuck", { tuck: 0.5 }],
  ["three quarters of a tuck", { tuck: 0.75 }],
  ["tuck", { tuck: 1 }],
  ["lean left", { lean: -1, speed: RIDING_SPEED }],
  ["lean right", { lean: 1, speed: RIDING_SPEED }],
  ["tucked lean left", { lean: -1, speed: RIDING_SPEED, tuck: 1 }],
  ["tucked lean right", { lean: 1, speed: RIDING_SPEED, tuck: 1 }],
];

type Triangle = readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];

type Axis = 0 | 1 | 2;

const AXES = [0, 1, 2] as const satisfies readonly Axis[];

const ACROSS = [
  [1, 2],
  [2, 0],
  [0, 1],
] as const satisfies readonly (readonly [Axis, Axis])[];

interface Crossing {
  readonly at: number;
  readonly facesOn: boolean;
}

type Crossings = (point: THREE.Vector3) => Crossing[];

const cellOf = (value: number) => Math.floor(value / CELL);

const keyOf = (p: number, q: number) => `${p},${q}`;

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

const crossingsAlong = (
  triangles: readonly Triangle[],
  axis: Axis
): Crossings => {
  const [p, q] = ACROSS[axis];
  const cells = new Map<string, Triangle[]>();
  for (const triangle of triangles) {
    const ps = triangle.map((corner) => corner.getComponent(p));
    const qs = triangle.map((corner) => corner.getComponent(q));
    for (
      let pCell = cellOf(Math.min(...ps));
      pCell <= cellOf(Math.max(...ps));
      pCell += 1
    ) {
      for (
        let qCell = cellOf(Math.min(...qs));
        qCell <= cellOf(Math.max(...qs));
        qCell += 1
      ) {
        const key = keyOf(pCell, qCell);
        const list = cells.get(key) ?? [];
        list.push(triangle);
        cells.set(key, list);
      }
    }
  }
  return (point) => {
    const pAt = point.getComponent(p);
    const qAt = point.getComponent(q);
    return (cells.get(keyOf(cellOf(pAt), cellOf(qAt))) ?? []).flatMap(
      ([a, b, c]) => {
        const ap = a.getComponent(p);
        const aq = a.getComponent(q);
        const bp = b.getComponent(p) - ap;
        const bq = b.getComponent(q) - aq;
        const cp = c.getComponent(p) - ap;
        const cq = c.getComponent(q) - aq;
        const area = bp * cq - cp * bq;
        if (Math.abs(area) < FLAT) {
          return [];
        }
        const u = ((pAt - ap) * cq - cp * (qAt - aq)) / area;
        const v = (bp * (qAt - aq) - (pAt - ap) * bq) / area;
        if (u < 0 || v < 0 || u + v > 1) {
          return [];
        }
        const aAt = a.getComponent(axis);
        return [
          {
            at:
              aAt +
              u * (b.getComponent(axis) - aAt) +
              v * (c.getComponent(axis) - aAt),
            facesOn: area > 0,
          },
        ];
      }
    );
  };
};

const nearest = (crossings: readonly Crossing[], at: number) => {
  let ahead: Crossing | null = null;
  let behind: Crossing | null = null;
  for (const crossing of crossings) {
    if (crossing.at >= at) {
      if (ahead === null || crossing.at < ahead.at) {
        ahead = crossing;
      }
    } else if (behind === null || crossing.at > behind.at) {
      behind = crossing;
    }
  }
  return { ahead, behind };
};

const heightAbove = (crossings: readonly Crossing[], y: number): number => {
  const { ahead, behind } = nearest(crossings, y);
  return ahead !== null && ahead.facesOn
    ? y - ahead.at
    : y - (behind?.at ?? -Infinity);
};

const wayOut = (crossings: readonly Crossing[], at: number): number => {
  const { ahead, behind } = nearest(crossings, at);
  const forward = ahead !== null && ahead.facesOn ? ahead.at - at : 0;
  const back = behind !== null && !behind.facesOn ? at - behind.at : 0;
  return Math.min(forward, back);
};

const shading = createShading(lookOf("salt-coast"));

const bikeOf = async (model: BikeModelId): Promise<BikeModel> => {
  const url = modelUrls.bikes[model];
  const { value } = await assetParsers.bike(model)(artFile(url), url);
  return value;
};

const millimetres = (metres: number) => `${(metres * 1000).toFixed(1)} mm`;

const placeOf = (bone: string, vertex: THREE.Vector3) =>
  `${bone} at ${vertex
    .toArray()
    .map((coordinate) => coordinate.toFixed(2))
    .join(" ")}`;

const ridden = async (url: string, model: BikeModelId) => {
  const bike = await bikeOf(model);
  const { value } = await assetParsers.rider(artFile(url), url);
  const figure = createRiderFigure(value, shading, paletteOf(0));
  figure.mount(new THREE.Object3D(), bike.fit, 0);
  const triangles = trianglesOf(bike);
  const along = [
    crossingsAlong(triangles, 0),
    crossingsAlong(triangles, 1),
    crossingsAlong(triangles, 2),
  ] as const;
  const vertex = new THREE.Vector3();
  const eachPoint = (
    stance: Partial<Stance>,
    bones: ReadonlySet<string>,
    visit: (bone: string, at: number, point: THREE.Vector3) => void
  ) => {
    for (let step = 0; step < SETTLE_STEPS; step += 1) {
      figure.animate(seatedStance(stance), SETTLED);
    }
    figure.root.updateMatrixWorld(true);
    const body = bodyOf(figure.root);
    const position = body.geometry.getAttribute("position");
    const skinIndex = body.geometry.getAttribute("skinIndex");
    const skinWeight = body.geometry.getAttribute("skinWeight");
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
      if (bone && bones.has(bone.name)) {
        body.getVertexPosition(at, vertex).applyMatrix4(body.matrixWorld);
        visit(bone.name, at, vertex);
      }
    }
  };
  const lowest = (stance: Partial<Stance>, bones: ReadonlySet<string>) => {
    let gap = Infinity;
    let where = "";
    eachPoint(stance, bones, (bone, _at, point) => {
      const height = heightAbove(along[1](point), point.y);
      if (height < gap) {
        gap = height;
        where = placeOf(bone, point);
      }
    });
    return { gap, where };
  };
  const deepest = (
    stance: Partial<Stance>,
    bones: ReadonlySet<string>,
    allowed: (at: number) => number
  ) => {
    let over = 0;
    let where = "";
    eachPoint(stance, bones, (bone, at, point) => {
      const depth = Math.min(
        ...AXES.map((axis) =>
          wayOut(along[axis](point), point.getComponent(axis))
        )
      );
      const allowance = allowed(at);
      if (depth - allowance > over) {
        over = depth - allowance;
        where = `${placeOf(bone, point)} ${millimetres(depth)} in with ${millimetres(allowance)} allowed`;
      }
    });
    return { over, where };
  };
  return {
    cloth: clothOf(bodyOf(figure.root)),
    deepest,
    figure,
    fit: bike.fit,
    lowest,
  };
};

const riderUrls = [
  ...modelUrls.figures,
  ...Object.values(modelUrls.celebrities),
];

const pairs = riderUrls.flatMap((url) =>
  bikeModelIds.map((model) => [url, model] as const)
);

const hiddenArmSink = ({ hand_l: grip }: BikeFit): number => {
  const across =
    Math.hypot(GARAGE_SHOT.eyeX, GARAGE_SHOT.eyeZ) - Math.hypot(grip.x, grip.z);
  const up = GARAGE_SHOT.eyeY - GARAGE_PLINTH.height - grip.y;
  const rowHeight =
    (2 *
      Math.hypot(across, up) *
      Math.tan(THREE.MathUtils.degToRad(FOV.garage) / 2)) /
    SCREEN_ROWS;
  return SEEN_PIXELS * rowHeight;
};

describe("rider clearance against the bike's own triangles", () => {
  it.each(pairs)(
    "%s on the %s keeps the upper body out of the bike in every riding pose",
    async (url, model) => {
      const { cloth, deepest, fit, figure } = await ridden(url, model);
      const armSink = hiddenArmSink(fit);
      const sunk = riding.flatMap(([name, stance]) =>
        (
          [
            [torso, (at: number) => SINK + cloth.giveAt(at)],
            [arms, () => armSink],
          ] as const
        ).flatMap(([bones, allowed]) => {
          const { over, where } = deepest(stance, bones, allowed);
          return over > 0 ? [`${name}: ${where}`] : [];
        })
      );
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

  it("takes the bare-body depth from the slimmest shipped rider", async () => {
    const ratios = await Promise.all(
      riderUrls.map(async (url) => {
        const { value } = await assetParsers.rider(artFile(url), url);
        const figure = createRiderFigure(value, shading, paletteOf(0));
        const { frontRatio } = clothOf(bodyOf(figure.root));
        figure.dispose();
        return frontRatio;
      })
    );
    expect(BARE_FRONT).toBeCloseTo(Math.min(...ratios), BARE_DIGITS);
  });
});
