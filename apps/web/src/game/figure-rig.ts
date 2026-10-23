import { riderPalette } from "@racer/sim/palette";
import * as THREE from "three";

import type { Assets, Palette, RiderAsset } from "./assets.ts";

const DEFAULT_JACKET = 0x23_26_2c;
const DEFAULT_HELMET = 0xf2_c2_30;
const SUIT_PANEL = "#1c1826";

export const paletteOf = (index: number): Palette => {
  const colours = riderPalette[index];
  return new Map<string, THREE.ColorRepresentation>([
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
  const asset = assets.riders[index % assets.riders.length];
  if (!asset) {
    throw new Error("No rider model is loaded.");
  }
  return asset;
};
