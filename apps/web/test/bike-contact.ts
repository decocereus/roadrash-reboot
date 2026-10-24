import * as THREE from "three";

import { browserAssetRuntime } from "../src/asset-runtime.ts";
import { createBikes } from "../src/game/actors.ts";
import type { AcquiredAssets } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { bodyFor } from "../src/game/figure-rig.ts";
import type { CelebrityId } from "../src/game/figure-wear.ts";
import { assetParsers } from "../src/game/game.ts";
import { lookOf } from "../src/game/looks.ts";
import { createPipeline } from "../src/game/post.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { Stance } from "../src/game/rider-figure.ts";

const LOOK = lookOf("salt-coast");
const CELL_WIDTH = 300;
const CELL_HEIGHT = 190;
const PIXEL_RATIO = 2;
const FULL_LEAN = 0.4;
const SETTLE_STEPS = 8;
const CONTACT_BONES = ["hand_l", "hand_r", "foot_l", "foot_r", "ball_l"];

const views = {
  detail: {
    eye: new THREE.Vector3(2.2, 0.72, -0.05),
    target: new THREE.Vector3(0, 0.7, -0.05),
  },
  front: {
    eye: new THREE.Vector3(-2.6, 1.5, -3.4),
    target: new THREE.Vector3(0, 0.78, 0),
  },
  portrait: {
    eye: new THREE.Vector3(-1.5, 1.6, -2.3),
    target: new THREE.Vector3(0, 1.15, 0.05),
  },
  side: {
    eye: new THREE.Vector3(4.4, 0.9, 0),
    target: new THREE.Vector3(0, 0.78, 0),
  },
} as const;

type View = keyof typeof views;

interface Pose {
  readonly name: string;
  readonly roll: number;
  readonly stance: Partial<Stance>;
}

const poses: readonly Pose[] = [
  { name: "rest", roll: 0, stance: {} },
  { name: "tuck", roll: 0, stance: { tuck: 1 } },
  { name: "lean", roll: FULL_LEAN, stance: { lean: 1, tuck: 1 } },
  { name: "punch", roll: 0, stance: { pose: "punch", reach: 1 } },
  { name: "kick", roll: 0, stance: { pose: "kick", reach: 1, rise: 1 } },
];

const stanceOf = (pose: Pose): Stance => ({
  flinch: 0,
  flinchSide: 1,
  lean: 0,
  pose: "seated",
  reach: 0,
  rise: 0,
  side: 1,
  time: 0,
  tuck: 0,
  weapon: "none",
  ...pose.stance,
});

const acquire = async (notes: string[]): Promise<AcquiredAssets> => {
  const { promise, reject, resolve } = Promise.withResolvers<AcquiredAssets>();
  browserAssetRuntime().mount({
    failed: reject,
    fontFallback: (error) => {
      notes.push(`fonts: ${error.message}`);
    },
    interrupted: () => {
      reject(new Error("The asset load was interrupted."));
    },
    loaded: (assets, release) => {
      resolve({ assets, release });
    },
    parsers: assetParsers,
    signal: new AbortController().signal,
  });
  return await promise;
};

const sheetCanvas = (): CanvasRenderingContext2D => {
  const canvas = document.createElement("canvas");
  canvas.width = CELL_WIDTH * poses.length * PIXEL_RATIO;
  canvas.height = CELL_HEIGHT * bikeModelIds.length * PIXEL_RATIO;
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${CELL_WIDTH * poses.length}px;height:${CELL_HEIGHT * bikeModelIds.length}px;z-index:10;background:#000`;
  const last = document.body.lastChild;
  if (!last) {
    throw new Error("The page has nothing to place the contact sheet after.");
  }
  last.after(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The contact sheet has no 2D context.");
  }
  context.font = `${14 * PIXEL_RATIO}px sans-serif`;
  context.fillStyle = "#fff";
  return context;
};

const inBikeSpace = (bike: THREE.Object3D, world: THREE.Vector3) => {
  const local = bike.worldToLocal(world.clone());
  return [-local.x, local.y, -local.z].map(
    (value) => Math.round(value * 1000) / 1000
  );
};

export const run = async (
  view: View,
  build = 0,
  celebrity: CelebrityId | null = null
) => {
  const notes: string[] = [];
  const { assets, release } = await acquire(notes);
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(CELL_WIDTH, CELL_HEIGHT, false);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const pipeline = createPipeline(renderer);
  pipeline.setLook(LOOK);
  pipeline.resize(CELL_WIDTH, CELL_HEIGHT, PIXEL_RATIO);
  const shading = createShading(LOOK);
  const bikes = createBikes(
    assets,
    shading,
    bikeModelIds.map((model) => ({ model, paint: 2, police: false }))
  );
  const figure = createRiderFigure(
    celebrity === null ? bodyFor(assets, build) : assets.celebrities[celebrity],
    shading,
    0
  );
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2a2433");
  const light = new THREE.DirectionalLight(shading.sun, 1);
  light.castShadow = true;
  light.position.copy(shading.key).multiplyScalar(8);
  scene.add(
    new THREE.AmbientLight(shading.ambient, 1),
    light,
    bikes.group,
    figure.root
  );
  try {
    pipeline.prepare(scene);
    const camera = new THREE.PerspectiveCamera(
      30,
      CELL_WIDTH / CELL_HEIGHT,
      0.1,
      40
    );
    camera.position.copy(views[view].eye);
    camera.lookAt(views[view].target);
    camera.updateMatrixWorld();
    shading.aim(camera);
    const sheet = sheetCanvas();
    const contacts: Record<string, Record<string, number[]>> = {};
    for (let row = 0; row < bikeModelIds.length; row += 1) {
      const model = bikeModelIds[row];
      const bike = bikes.roots[row];
      if (!(model && bike)) {
        continue;
      }
      for (let column = 0; column < poses.length; column += 1) {
        const pose = poses[column];
        if (!pose) {
          continue;
        }
        bike.position.set(0, 0, 0);
        bike.rotation.set(0, 0, -pose.roll, "YXZ");
        bike.updateMatrixWorld();
        figure.root.position.copy(bike.position);
        figure.root.quaternion.copy(bike.quaternion);
        figure.root.translateY(figure.seat.y);
        figure.root.translateZ(figure.seat.z);
        const stance = stanceOf(pose);
        for (let step = 0; step < SETTLE_STEPS; step += 1) {
          figure.animate(stance, 1);
        }
        figure.root.updateMatrixWorld(true);
        bikes.show(row);
        bikes.commit(new THREE.Vector3());
        pipeline.render(scene, camera);
        sheet.drawImage(
          renderer.domElement,
          column * CELL_WIDTH * PIXEL_RATIO,
          row * CELL_HEIGHT * PIXEL_RATIO
        );
        sheet.fillText(
          `${model} ${pose.name}`,
          (column * CELL_WIDTH + 8) * PIXEL_RATIO,
          (row * CELL_HEIGHT + 20) * PIXEL_RATIO
        );
        if (pose.name === "rest" && row === 0) {
          for (const name of CONTACT_BONES) {
            const bone = figure.root.getObjectByName(name);
            if (bone) {
              contacts[name] = {
                rest: inBikeSpace(
                  bike,
                  bone.getWorldPosition(new THREE.Vector3())
                ),
              };
            }
          }
        }
      }
    }
    return {
      build,
      celebrity,
      contacts,
      notes,
      seat: figure.seat.toArray(),
      view,
    };
  } finally {
    light.dispose();
    figure.dispose();
    bikes.dispose();
    shading.dispose();
    pipeline.dispose();
    renderer.dispose();
    release();
  }
};
