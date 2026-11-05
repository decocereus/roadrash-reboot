import type { PedestrianView } from "@racer/sim/race-view";
import { roadHalfWidthAt } from "@racer/track/districts";
import { trackFor } from "@racer/track/roads";
import type { StallFootprint } from "@racer/track/stalls";
import type * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { crowdAt } from "../src/game/bazaar-crowd.ts";
import { BAZAAR_NAME } from "../src/game/bazaar.ts";
import { createChaseCamera } from "../src/game/chase-camera.ts";
import { KERB_WIDTH } from "../src/game/ground.ts";
import { isInstancedMesh, isMesh } from "../src/game/meshes.ts";
import { createWorld } from "../src/game/world.ts";
import type { World } from "../src/game/world.ts";
import { fakeWorldAssets } from "./walker-asset.ts";

const drawsNothing = new Proxy(
  {},
  {
    get: (_target, key) =>
      key === "createLinearGradient" || key === "createRadialGradient"
        ? () => ({ addColorStop: () => null })
        : () => null,
  }
);

const track = trackFor("breakwater-run");
const crowd = crowdAt(track);
const FAKE_PRIMITIVE_INDICES = 36;
const NO_WALKERS: readonly PedestrianView[] = [];

const bazaarOf = (world: World): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = [];
  world.scene.getObjectByName(BAZAAR_NAME)?.traverse((node) => {
    if (isMesh(node)) {
      meshes.push(node);
    }
  });
  return meshes;
};

const indicesOf = (mesh: THREE.Mesh | undefined): Int32Array => {
  const index = mesh?.geometry.getIndex();
  if (!index) {
    throw new Error("The bazaar's merged mesh has no index.");
  }
  return Int32Array.from(index.array);
};

const stallAt = (id: number): StallFootprint => {
  const stall = track.stalls[id];
  if (!stall) {
    throw new Error(`The market has no stall ${id}.`);
  }
  return stall;
};

const stallIndices = (indices: Int32Array, id: number): readonly number[] => [
  ...indices.subarray(
    id * FAKE_PRIMITIVE_INDICES,
    (id + 1) * FAKE_PRIMITIVE_INDICES
  ),
];

const collapsed = (indices: Int32Array, id: number): boolean =>
  stallIndices(indices, id).every((each) => each === 0);

const rideTo = (world: World, s: number, x: number): THREE.Vector3 => {
  const chase = createChaseCamera();
  chase.update(track, { air: 0, s, speed: 20, tuck: 0, x }, 1 / 60);
  world.follow(chase.camera, s);
  return chase.camera.position.clone();
};

const walkerCount = (world: World): number => {
  let count = 0;
  world.scene.traverse((node) => {
    if (isInstancedMesh(node) && node.geometry.hasAttribute("walkerFrame")) {
      count += node.count;
    }
  });
  return count;
};

describe("the bazaar's crowd", () => {
  it("is 56 people, half of them serving, on every third stall", () => {
    expect(crowd).toHaveLength(56);
    expect(crowd.filter(({ mode }) => mode === "serve")).toHaveLength(28);
    expect(crowd.filter(({ mode }) => mode === "haggle")).toHaveLength(14);
    expect(crowd.filter(({ mode }) => mode === "browse")).toHaveLength(14);
  });

  it("is the same people every time, each with their own id", () => {
    expect(new Set(crowd.map(({ id }) => id)).size).toBe(crowd.length);
    expect(crowdAt(track)).toStrictEqual(crowd);
  });

  it("is only there beside stalls, so a road with none has none", () => {
    expect(crowdAt(trackFor("slag-row"))).toStrictEqual([]);
  });

  it("stands clear of the kerb and the road, customers in front of their stall and servers behind its front", () => {
    const misplaced = crowd.filter((member) => {
      const stall = stallAt(Number(member.id.slice(6).split("/")[0]));
      const front = Math.abs(stall.x) - stall.halfWidth;
      const across = Math.abs(member.x);
      const onItsSide =
        across > front === (member.mode === "serve") &&
        Math.sign(member.x) === Math.sign(stall.x);
      const clearOfKerb =
        across > roadHalfWidthAt(track, member.s) + KERB_WIDTH + 1;
      const alongIt = Math.abs(member.s - stall.s) <= stall.halfLength;
      return !(onItsSide && clearOfKerb && alongIt);
    });
    expect(misplaced).toStrictEqual([]);
  });

  it("stands nobody inside a pole, chevron, tree or rock", () => {
    for (const member of crowd) {
      expect(
        track.solidProps.filter(
          (prop) =>
            Math.abs(prop.s - member.s) < prop.radius + 0.3 &&
            Math.abs(prop.x - member.x) < prop.radius + 0.3
        )
      ).toStrictEqual([]);
    }
  });

  it("faces customers at the stall and servers at the road", () => {
    for (const { mode, turn, x } of crowd) {
      const towardRoad = -Math.sign(x);
      const facing = Math.sign(turn);
      expect(facing).toBe(mode === "serve" ? towardRoad : -towardRoad);
    }
  });
});

describe("the bazaar in the world", () => {
  beforeAll(() => {
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => drawsNothing }),
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("is two merged meshes, casting no shadow, and only the market's road has it", () => {
    const world = createWorld(track, fakeWorldAssets());
    const meshes = bazaarOf(world);
    expect(meshes).toHaveLength(2);
    expect(meshes.map(({ castShadow }) => castShadow)).toStrictEqual([
      false,
      false,
    ]);
    world.dispose();
    const bare = createWorld(trackFor("slag-row"), fakeWorldAssets());
    expect(bazaarOf(bare)).toStrictEqual([]);
    bare.dispose();
  });

  it("hides nothing while the rider stays on the road or the kerbside strip", () => {
    const world = createWorld(track, fakeWorldAssets());
    const versions = () =>
      bazaarOf(world).map(({ geometry }) => geometry.getIndex()?.version);
    const before = versions();
    for (let s = 1290; s < 1750; s += 2) {
      for (const x of [-5.2, -3.5, 0, 3.5, 5.2]) {
        rideTo(world, s, x);
      }
    }
    expect(versions()).toStrictEqual(before);
    world.dispose();
  });

  it("collapses the stall the camera reaches, leaves the rest, and restores it once the camera leaves", () => {
    const world = createWorld(track, fakeWorldAssets());
    const meshes = bazaarOf(world);
    const [cel] = meshes;
    const whole = indicesOf(cel);
    const id = track.stalls.findIndex(
      ({ s, x }) => x > 0 && s > 1500 && s < 1520
    );
    const stall = stallAt(id);
    const far = track.stalls.findIndex(({ s, x }) => x > 0 && s > stall.s + 30);
    let touched = false;
    for (let s = stall.s - 12; s < stall.s + 12 && !touched; s += 0.25) {
      rideTo(world, s, 10.6);
      touched = collapsed(indicesOf(cel), id);
    }
    expect(touched).toBeTruthy();
    expect(stallIndices(indicesOf(cel), far)).toStrictEqual(
      stallIndices(whole, far)
    );
    rideTo(world, stall.s + 60, 0);
    expect(indicesOf(cel)).toStrictEqual(whole);
    world.dispose();
  });

  it("shows the crowd from 300 m and none once the market is behind, on the walker instances", () => {
    const world = createWorld(track, fakeWorldAssets());
    const show = (s: number): number => {
      world.showRoadLife(
        { hazards: [], pedestrians: NO_WALKERS, tick: 600 },
        s
      );
      return walkerCount(world);
    };
    const first = Math.min(...crowd.map(({ s }) => s));
    expect(show(0)).toBe(0);
    expect(show(first - 301)).toBe(0);
    const entering = show(first - 299);
    expect(entering).toBeGreaterThan(0);
    expect(entering).toBeLessThan(crowd.length);
    const midway = show(1600);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(crowd.length);
    expect(show(1800)).toBe(0);
    world.dispose();
  });
});
