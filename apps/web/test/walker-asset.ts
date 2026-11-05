import * as THREE from "three";

import type { Assets, ModelParts, WalkerAsset } from "../src/game/assets.ts";
import { decoParts, stallParts } from "../src/game/bazaar.ts";
import { walkerBodies } from "../src/game/walker-clips.ts";

const clip = { frames: 1, start: 0 };

export const fakeWalkerAsset = (): WalkerAsset => ({
  atlas: new THREE.Texture(),
  clips: {
    browse: clip,
    fall: clip,
    flinch: clip,
    get_up: clip,
    haggle: clip,
    lie: clip,
    run: clip,
    serve: clip,
    wait: clip,
    walk: clip,
  },
  geometries: walkerBodies.map(() => new THREE.BufferGeometry()),
  poses: new THREE.DataTexture(
    new Float32Array(4),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  ),
});

const fakePrimitive = (slot: string) => {
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  geometry.deleteAttribute("uv");
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(
      new Float32Array(geometry.getAttribute("position").count * 3).fill(0.5),
      3
    )
  );
  return { geometry, slot };
};

const fakeStallKit = (): ModelParts =>
  new Map(
    [...stallParts, ...decoParts].map((name) => [
      name,
      [fakePrimitive("stall_cel"), fakePrimitive("stall_glow")],
    ])
  );

export const fakeWorldAssets = (): Pick<Assets, "stalls" | "walkers"> => ({
  stalls: fakeStallKit(),
  walkers: fakeWalkerAsset(),
});
