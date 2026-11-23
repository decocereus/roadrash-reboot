import { createHash } from "node:crypto";

import type { CelebrityId } from "@racer/sim/cast";
import * as THREE from "three";

import type {
  Assets,
  BikeModel,
  ModelParts,
  RiderAsset,
} from "../src/game/assets.ts";
import type { Primitive } from "../src/game/model-slots.ts";

const plain = (value: number): number => value + 0;

const primitiveSummary = (primitive: Primitive) => {
  const position = primitive.geometry.getAttribute("position");
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    box.expandByPoint(point.fromBufferAttribute(position, index));
  }
  return {
    attributes: Object.keys(primitive.geometry.attributes).toSorted(),
    first: [position.getX(0), position.getY(0), position.getZ(0)].map(plain),
    indices: primitive.geometry.getIndex()?.count ?? 0,
    max: box.max.toArray().map(plain),
    min: box.min.toArray().map(plain),
    slot: primitive.slot,
    vertices: position.count,
  };
};

const riderSummary = (rider: RiderAsset) => {
  let nodes = 0;
  rider.scene.traverse(() => {
    nodes += 1;
  });
  return {
    atlas: rider.atlas?.colorSpace ?? null,
    bones: rider.bones,
    nodes,
    poses: [...rider.poses].map(([name, pose]) => ({
      digest: createHash("sha256")
        .update(Float64Array.from(pose))
        .digest("hex")
        .slice(0, 16),
      name,
      values: pose.length,
    })),
    primitives: rider.primitives.map(primitiveSummary),
    standHeight: plain(rider.standHeight),
  };
};

const partsSummary = (parts: ModelParts) =>
  [...parts].map(([name, primitives]) => ({
    name,
    primitives: primitives.map(primitiveSummary),
  }));

const at = (point: THREE.Vector3) => point.toArray().map(plain);

const bikeSummary = ({ fit, parts }: BikeModel) => ({
  fit: {
    foot_l: at(fit.foot_l),
    foot_r: at(fit.foot_r),
    hand_l: at(fit.hand_l),
    hand_r: at(fit.hand_r),
    seat: at(fit.seat),
  },
  parts: partsSummary(parts),
});

interface Worn {
  readonly id: CelebrityId;
  readonly value: RiderAsset;
}

export const summary = (assets: Assets, celebrities: readonly Worn[]) => ({
  bikes: {
    classic: bikeSummary(assets.bikes.classic),
    ghost: bikeSummary(assets.bikes.ghost),
    oni: bikeSummary(assets.bikes.oni),
    seraph: bikeSummary(assets.bikes.seraph),
  },
  car: assets.car.map(primitiveSummary),
  celebrities: Object.fromEntries(
    celebrities.map(({ id, value }) => [id, riderSummary(value)])
  ),
  figures: assets.figures.map(riderSummary),
  van: assets.van.map(primitiveSummary),
});
