import { riderPalette } from "@racer/sim/palette";
import type { RiderBlocks } from "@racer/sim/palette";
import type { RiderView } from "@racer/sim/race-view";
import * as THREE from "three";

import type { Assets, RiderAsset } from "./assets.ts";
import type { Dressing } from "./figure-wardrobe.ts";
import type { Palette, Slot } from "./model-slots.ts";

const DEFAULT_JACKET = 0x23_26_2c;
const DEFAULT_HELMET = 0xf2_c2_30;
const SUIT_PANEL = "#1c1826";

export const suitOf = (
  rider: Pick<RiderView, "id" | "profile">,
  blocks: RiderBlocks | undefined,
  dressing: Dressing
): number =>
  dressing.get(rider.id)?.suit ??
  blocks?.suit ??
  riderPalette[rider.profile.jacket]?.jacket ??
  DEFAULT_JACKET;

export const paletteOf = (index: number): Palette => {
  const colours = riderPalette[index];
  return new Map<Slot, THREE.ColorRepresentation>([
    ["suit", colours?.jacket ?? DEFAULT_JACKET],
    ["suit2", SUIT_PANEL],
    ["helmet", colours?.helmet ?? DEFAULT_HELMET],
    ["helmet2", colours?.trim ?? colours?.bike ?? DEFAULT_HELMET],
  ]);
};

export interface Rig {
  readonly root: THREE.Object3D;
  readonly skeleton: THREE.Skeleton;
  readonly names: readonly string[];
  readonly bones: readonly (THREE.Bone | undefined)[];
}

export const boneNamed = (
  skeleton: THREE.Skeleton,
  name: string
): THREE.Bone => {
  const bone = skeleton.getBoneByName(name);
  if (!bone) {
    throw new Error(`The rider model has no ${name} bone.`);
  }
  return bone;
};

export const posed = ({ bones, root }: Rig, pose: readonly number[]) => {
  for (let index = 0; index < bones.length; index += 1) {
    bones[index]?.quaternion.fromArray(pose, index * 4);
  }
  root.updateMatrixWorld(true);
};

export const read = ({ bones }: Rig, into: number[]): number[] => {
  for (let index = 0; index < bones.length; index += 1) {
    bones[index]?.quaternion.toArray(into, index * 4);
  }
  return into;
};

export class PosedSkeleton extends THREE.Skeleton {
  stale = true;

  override update(): void {
    if (this.stale) {
      this.stale = false;
      super.update();
    }
  }
}

export const bodyFor = (assets: Assets, index: number): RiderAsset => {
  const asset = assets.figures[index % assets.figures.length];
  if (!asset) {
    throw new Error("No rider model is loaded.");
  }
  return asset;
};
