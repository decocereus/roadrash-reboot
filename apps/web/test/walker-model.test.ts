import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import { walkerBodies } from "../src/game/walker-clips.ts";
import { artFile } from "./art-files.ts";

const BONES = 23;
const TEXELS_PER_BONE = 3;
const ROW = BONES * TEXELS_PER_BONE * 4;
const FRAMES = [22, 16, 38, 60, 20, 90, 30];

const posesOf = (texture: THREE.DataTexture): Float32Array => {
  const image: unknown = texture.image;
  if (
    image instanceof Object &&
    "data" in image &&
    image.data instanceof Float32Array
  ) {
    return image.data;
  }
  throw new Error("The pose texture holds no floats.");
};

const rowsDiffer = (poses: Float32Array, a: number, b: number): boolean => {
  const first = poses.subarray(a * ROW, (a + 1) * ROW);
  const second = poses.subarray(b * ROW, (b + 1) * ROW);
  return first.some((value, index) => value !== second[index]);
};

describe("the pinned pedestrian model", () => {
  it("bakes every clip into one pose row per frame, for six bodies that can be skinned", async () => {
    const { release, value } = await assetParsers.walkers(
      artFile(modelUrls.walkers),
      modelUrls.walkers
    );
    const { clips, geometries, poses } = value;
    const data = posesOf(poses);
    expect(
      geometries.map((each) => Object.keys(each.attributes).toSorted())
    ).toStrictEqual(
      walkerBodies.map(() => [
        "color",
        "gloss",
        "normal",
        "position",
        "skinIndex",
        "skinWeight",
        "uv",
      ])
    );
    expect(Object.values(clips).map(({ frames }) => frames)).toStrictEqual(
      FRAMES
    );
    expect(data).toHaveLength(FRAMES.reduce((a, b) => a + b) * ROW);
    expect(
      rowsDiffer(data, clips.walk.start, clips.walk.start + 15)
    ).toBeTruthy();
    expect(rowsDiffer(data, clips.lie.start, clips.wait.start)).toBeTruthy();
    release();
  });

  it("puts a lying body on the road, neither through it nor above it", async () => {
    const { release, value } = await assetParsers.walkers(
      artFile(modelUrls.walkers),
      modelUrls.walkers
    );
    const { clips, geometries, poses } = value;
    const data = posesOf(poses);
    const [body] = geometries;
    const position = body?.getAttribute("position");
    const skinIndex = body?.getAttribute("skinIndex");
    const skinWeight = body?.getAttribute("skinWeight");
    if (!position || !skinIndex || !skinWeight) {
      throw new Error("The first body has no skin.");
    }
    const row = clips.lie.start;
    const at = new THREE.Vector3();
    const heightOf = (vertex: number, bone: number): number => {
      const start = row * ROW + bone * TEXELS_PER_BONE * 4;
      at.fromBufferAttribute(position, vertex);
      const [x, y, z, w] = [4, 5, 6, 7].map((each) => data[start + each] ?? 0);
      return (x ?? 0) * at.x + (y ?? 0) * at.y + (z ?? 0) * at.z + (w ?? 0);
    };
    let lowest = Infinity;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      lowest = Math.min(
        lowest,
        heightOf(vertex, skinIndex.getX(vertex)) * skinWeight.getX(vertex) +
          heightOf(vertex, skinIndex.getY(vertex)) * skinWeight.getY(vertex) +
          heightOf(vertex, skinIndex.getZ(vertex)) * skinWeight.getZ(vertex) +
          heightOf(vertex, skinIndex.getW(vertex)) * skinWeight.getW(vertex)
      );
    }
    expect(lowest).toBeGreaterThan(-0.06);
    expect(lowest).toBeLessThan(0.1);
    release();
  });
});
