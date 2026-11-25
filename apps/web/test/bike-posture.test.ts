import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { paletteOf } from "../src/game/figure-rig.ts";
import { lookOf } from "../src/game/looks.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { Stance } from "../src/game/rider-figure.ts";
import { artFile } from "./art-files.ts";
import { bodyOf, seatedStance } from "./seated-contacts.ts";

const SETTLED = 1;
const SETTLE_STEPS = 8;
const LEAN_SLACK = 3;
const TUCK_LEAN = { from: 65, to: 72 };
const TUCK_ELBOW = { from: 70, to: 95 };
const TODAYS_TUCKED_HELMET = 1.344;

const restLean = {
  classic: 28,
  ghost: 39,
  oni: 35,
  seraph: 39,
} as const satisfies Record<BikeModelId, number>;

const shading = createShading(lookOf("salt-coast"));
const [referenceRider] = modelUrls.figures;

const measured = async (model: BikeModelId, stance: Partial<Stance>) => {
  const url = modelUrls.bikes[model];
  const { value: bike } = await assetParsers.bike(model)(artFile(url), url);
  const { value } = await assetParsers.rider(
    artFile(referenceRider),
    referenceRider
  );
  const figure = createRiderFigure(value, shading, paletteOf(0));
  figure.mount(new THREE.Object3D(), bike.fit, 0);
  for (let step = 0; step < SETTLE_STEPS; step += 1) {
    figure.animate(seatedStance(stance), SETTLED);
  }
  figure.root.updateMatrixWorld(true);
  const at = (name: string) => {
    const bone = figure.root.getObjectByName(name);
    if (!bone) {
      throw new Error(`The rider has no ${name} bone.`);
    }
    return bone.getWorldPosition(new THREE.Vector3());
  };
  const hips = at("thigh_l").add(at("thigh_r")).multiplyScalar(0.5);
  const shoulders = at("upperarm_l").add(at("upperarm_r")).multiplyScalar(0.5);
  const back = shoulders.sub(hips);
  const elbow = at("upperarm_l")
    .sub(at("lowerarm_l"))
    .angleTo(at("hand_l").sub(at("lowerarm_l")));
  const body = bodyOf(figure.root);
  const position = body.geometry.getAttribute("position");
  const skinIndex = body.geometry.getAttribute("skinIndex");
  const skinWeight = body.geometry.getAttribute("skinWeight");
  const head = body.skeleton.bones.findIndex((bone) => bone.name === "head");
  const vertex = new THREE.Vector3();
  let helmet = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    let owner = 0;
    for (let slot = 1; slot < 4; slot += 1) {
      if (
        skinWeight.getComponent(index, slot) >
        skinWeight.getComponent(index, owner)
      ) {
        owner = slot;
      }
    }
    if (skinIndex.getComponent(index, owner) === head) {
      body.getVertexPosition(index, vertex).applyMatrix4(body.matrixWorld);
      helmet = Math.max(helmet, vertex.y);
    }
  }
  figure.dispose();
  return {
    elbow: THREE.MathUtils.radToDeg(elbow),
    helmet,
    lean: THREE.MathUtils.radToDeg(Math.atan2(-back.z, back.y)),
  };
};

describe("each bike's riding posture on the reference rider", () => {
  it.each(bikeModelIds)(
    "sits the rider at the %s's own rest lean",
    async (model) => {
      const { lean } = await measured(model, {});
      expect(Math.abs(lean - restLean[model])).toBeLessThanOrEqual(LEAN_SLACK);
    }
  );

  it.each(bikeModelIds)(
    "lays the rider flat on the %s in a full tuck with bent elbows and the helmet no higher than before",
    async (model) => {
      const { elbow, helmet, lean } = await measured(model, { tuck: 1 });
      expect(lean).toBeGreaterThanOrEqual(TUCK_LEAN.from);
      expect(lean).toBeLessThanOrEqual(TUCK_LEAN.to);
      expect(elbow).toBeGreaterThanOrEqual(TUCK_ELBOW.from);
      expect(elbow).toBeLessThanOrEqual(TUCK_ELBOW.to);
      expect(helmet).toBeLessThanOrEqual(TODAYS_TUCKED_HELMET);
    }
  );
});
