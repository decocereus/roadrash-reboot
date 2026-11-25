import * as THREE from "three";

import type { AssetParsers, Decoded, RiderAsset } from "../src/game/assets.ts";
import type { Primitive } from "../src/game/model-slots.ts";
import { fakeBike } from "./fake-bike.ts";
import { fakeRiderMoves, fakeWalkerAsset } from "./walker-asset.ts";

export type Decode = () => Promise<null>;

interface Parsing {
  readonly parsers: AssetParsers;
  readonly decodes: Map<string, number>;
  readonly releases: Map<string, number>;
}

const fakeRider = (): RiderAsset => ({
  atlas: null,
  bones: [],
  poses: new Map(),
  primitives: [],
  scene: new THREE.Object3D(),
  standHeight: 0,
  url: "/models/rider_a.glb",
});

export const parsingOf = (
  script: ReadonlyMap<string, readonly Decode[]> = new Map()
): Parsing => {
  const decodes = new Map<string, number>();
  const releases = new Map<string, number>();
  const decoded = async <Value>(
    url: string,
    value: Value
  ): Promise<Decoded<Value>> => {
    const call = decodes.get(url) ?? 0;
    decodes.set(url, call + 1);
    await script.get(url)?.[call]?.();
    return {
      release: () => {
        releases.set(url, (releases.get(url) ?? 0) + 1);
      },
      value,
    };
  };
  return {
    decodes,
    parsers: {
      bike: () => async (_, url) => await decoded(url, fakeBike()),
      moves: async (_, url) => await decoded(url, fakeRiderMoves()),
      parts: async (_, url) =>
        await decoded(url, new Map<string, readonly Primitive[]>()),
      rider: async (_, url) => await decoded(url, fakeRider()),
      walkers: async (_, url) => await decoded(url, fakeWalkerAsset()),
      whole: async (_, url) => await decoded<readonly Primitive[]>(url, []),
    },
    releases,
  };
};
