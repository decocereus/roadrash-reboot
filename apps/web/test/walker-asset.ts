import * as THREE from "three";

import type { WalkerAsset } from "../src/game/assets.ts";
import { walkerBodies } from "../src/game/walker-clips.ts";

const clip = { frames: 1, start: 0 };

export const fakeWalkerAsset = (): WalkerAsset => ({
  atlas: new THREE.Texture(),
  clips: {
    fall: clip,
    flinch: clip,
    get_up: clip,
    lie: clip,
    run: clip,
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
