import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import { walkerBodies } from "../src/game/walker-clips.ts";
import { artFile } from "./art-files.ts";

const BONES = 23;
const TEXELS_PER_BONE = 3;
const ROW = BONES * TEXELS_PER_BONE * 4;
const FRAMES = [22, 16, 38, 60, 20, 90, 30];
const LYING_KNEE = 0.401;
const LOWEST_LYING = -0.05;

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

const heightsOf = (
  body: THREE.BufferGeometry,
  poses: Float32Array,
  row: number
) => {
  const position = body.getAttribute("position");
  const skinIndex = body.getAttribute("skinIndex");
  const skinWeight = body.getAttribute("skinWeight");
  const heightOf = (vertex: number, bone: number, weight: number): number => {
    const start = row * ROW + bone * TEXELS_PER_BONE * 4 + 4;
    return (
      weight *
      ((poses[start] ?? 0) * position.getX(vertex) +
        (poses[start + 1] ?? 0) * position.getY(vertex) +
        (poses[start + 2] ?? 0) * position.getZ(vertex) +
        (poses[start + 3] ?? 0))
    );
  };
  let low = Infinity;
  let high = -Infinity;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const height =
      heightOf(vertex, skinIndex.getX(vertex), skinWeight.getX(vertex)) +
      heightOf(vertex, skinIndex.getY(vertex), skinWeight.getY(vertex)) +
      heightOf(vertex, skinIndex.getZ(vertex), skinWeight.getZ(vertex)) +
      heightOf(vertex, skinIndex.getW(vertex), skinWeight.getW(vertex));
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  return { high, low };
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

  it("stands every body on the road at its full height, and lays them on it", async () => {
    const { release, value } = await assetParsers.walkers(
      artFile(modelUrls.walkers),
      modelUrls.walkers
    );
    const { clips, geometries, poses } = value;
    const data = posesOf(poses);
    for (const body of geometries) {
      const standing = heightsOf(body, data, clips.wait.start);
      const lying = heightsOf(body, data, clips.lie.start);
      expect(standing.low).toBeCloseTo(0, 2);
      expect(standing.high).toBeGreaterThan(1.69);
      expect(standing.high).toBeLessThan(1.75);
      expect(lying.high).toBeCloseTo(LYING_KNEE, 2);
      expect(lying.low).toBeGreaterThan(LOWEST_LYING);
    }
    release();
  });
});
