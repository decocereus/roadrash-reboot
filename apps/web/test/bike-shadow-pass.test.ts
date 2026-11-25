import * as THREE from "three";
import type { WebGLCapabilities } from "three/src/renderers/webgl/WebGLCapabilities.js";
import type { WebGLObjects } from "three/src/renderers/webgl/WebGLObjects.js";
import { WebGLShadowMap } from "three/src/renderers/webgl/WebGLShadowMap.js";
import { beforeAll, describe, expect, it } from "vitest";

import { createBikes } from "../src/game/actors.ts";
import type { Bikes } from "../src/game/actors.ts";
import type { Assets } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { lookOf } from "../src/game/looks.ts";
import { isInstancedMesh } from "../src/game/meshes.ts";
import { shadowReachOf } from "../src/game/shadow-reach.ts";
import { pinnedAssets } from "./pinned-assets.ts";

type Renderer = THREE.WebGLRenderer;
type State = Renderer["state"];

interface Counting extends Pick<
  Renderer,
  | "clear"
  | "getActiveCubeFace"
  | "getActiveMipmapLevel"
  | "getRenderTarget"
  | "renderBufferDirect"
  | "setRenderTarget"
> {
  readonly state: Pick<State, "setBlending" | "setScissorTest" | "viewport"> & {
    readonly buffers: {
      readonly color: Pick<State["buffers"]["color"], "setClear">;
      readonly depth: Pick<
        State["buffers"]["depth"],
        "getReversed" | "setTest"
      >;
    };
  };
}

interface CountingObjects {
  readonly dispose: () => void;
  readonly update: (object: THREE.Mesh) => THREE.BufferGeometry;
}

const SHADOW_MAP_CALLS = [
  "clear",
  "getActiveCubeFace",
  "getActiveMipmapLevel",
  "getRenderTarget",
  "renderBufferDirect",
  "setRenderTarget",
  "state",
] as const;

const drawsShadows = (renderer: Counting): renderer is Counting & Renderer =>
  SHADOW_MAP_CALLS.every((member) => member in renderer);

const holdsObjects = (
  objects: CountingObjects
): objects is CountingObjects & WebGLObjects =>
  "update" in objects && "dispose" in objects;

const knowsTextureSize = (capabilities: {
  readonly maxTextureSize: number;
}): capabilities is { readonly maxTextureSize: number } & WebGLCapabilities =>
  "maxTextureSize" in capabilities;

const sun = (): THREE.DirectionalLight => {
  const light = new THREE.DirectionalLight();
  light.position.set(...lookOf("lowtown").keyDirection).setLength(300);
  Object.assign(light.shadow.camera, {
    bottom: -70,
    far: 600,
    left: -70,
    near: 1,
    right: 70,
    top: 70,
  });
  light.shadow.camera.updateProjectionMatrix();
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  light.shadow.updateMatrices(light);
  return light;
};

const IN_BOX = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(12, 0, -8),
  new THREE.Vector3(-20, 0, 15),
] as const;
const OUT_OF_BOX = [
  new THREE.Vector3(1000, 0, 0),
  new THREE.Vector3(-900, 0, 400),
  new THREE.Vector3(0, 0, 1200),
] as const;

const paintOf = (rider: number): number => 0x10_10_10 * (rider + 1);
const trimOf = (rider: number): number => 0xf0_f0_f0 - 0x10_10_10 * rider;

const byIndex = (a: number, b: number): number => a - b;

const solidParts = (bikes: Bikes): THREE.InstancedMesh[] =>
  bikes.group.children
    .filter(isInstancedMesh)
    .filter((mesh) => mesh.geometry.hasAttribute("livery"));

const shadowPass = (
  scene: THREE.Scene,
  light: THREE.DirectionalLight
): Map<THREE.Object3D, number[]> => {
  const submitted = new Map<THREE.Object3D, number[]>();
  const called: string[] = [];
  const counting: Counting = {
    clear: () => {
      called.push("clear");
    },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getRenderTarget: () => null,
    renderBufferDirect: (_camera, _scene, _geometry, _material, object) => {
      const counts = submitted.get(object) ?? [];
      counts.push(isInstancedMesh(object) ? object.count : 1);
      submitted.set(object, counts);
    },
    setRenderTarget: () => {
      called.push("setRenderTarget");
    },
    state: {
      buffers: {
        color: {
          setClear: () => {
            called.push("setClear");
          },
        },
        depth: {
          getReversed: () => false,
          setTest: () => {
            called.push("setTest");
          },
        },
      },
      setBlending: () => {
        called.push("setBlending");
      },
      setScissorTest: () => {
        called.push("setScissorTest");
      },
      viewport: () => {
        called.push("viewport");
      },
    },
  };
  const objects: CountingObjects = {
    dispose: () => {
      called.push("dispose");
    },
    update: (object) => object.geometry,
  };
  const capabilities = { maxTextureSize: 4096 };
  if (
    !drawsShadows(counting) ||
    !holdsObjects(objects) ||
    !knowsTextureSize(capabilities)
  ) {
    throw new Error(
      "the counting renderer lacks a member the shadow map calls"
    );
  }
  const shadows = new WebGLShadowMap(counting, objects, capabilities);
  shadows.enabled = true;
  shadows.render([light], scene, new THREE.PerspectiveCamera());
  return submitted;
};

const cases = [
  {
    anchor: [0, 0, 0],
    at: [IN_BOX[0], OUT_OF_BOX[0]],
    casting: 1,
    name: "a near bike and a far one",
  },
  {
    anchor: [0, 0, 0],
    at: [OUT_OF_BOX[0], OUT_OF_BOX[1]],
    casting: 0,
    name: "no bike in the box",
  },
  {
    anchor: [0, 0, 0],
    at: [IN_BOX[0], IN_BOX[1]],
    casting: 2,
    name: "every bike in the box",
  },
  {
    anchor: [250, 4, -600],
    at: [IN_BOX[0], OUT_OF_BOX[0]],
    casting: 1,
    name: "a near and a far bike round a far anchor",
  },
] as const;

const reorders = [
  { at: [OUT_OF_BOX[0], IN_BOX[1], OUT_OF_BOX[1]], casters: [1] },
  { at: [IN_BOX[0], OUT_OF_BOX[2], IN_BOX[2]], casters: [0, 2] },
] as const;

describe("bikes in three's shadow pass", () => {
  let assets: Assets;
  beforeAll(async () => {
    assets = await pinnedAssets();
  });

  const ride = (model: BikeModelId, riders: number) => {
    const shading = createShading(lookOf("lowtown"));
    const bikes = createBikes(
      assets,
      shading,
      Array.from({ length: riders }, (_, rider) => ({
        livery: { bike: paintOf(rider), trim: trimOf(rider) },
        model,
        paint: 0,
        police: false,
      }))
    );
    const light = sun();
    const scene = new THREE.Scene();
    scene.add(bikes.group, light, light.target);
    const commit = (
      at: readonly THREE.Vector3[],
      anchor: THREE.Vector3
    ): Map<THREE.Object3D, number[]> => {
      for (const [rider, position] of at.entries()) {
        bikes.roots[rider]?.position.copy(position);
        bikes.show(rider);
      }
      bikes.commit(anchor, shadowReachOf(light));
      scene.updateMatrixWorld(true);
      return shadowPass(scene, light);
    };
    const dispose = () => {
      bikes.dispose();
      shading.dispose();
      light.dispose();
    };
    return { bikes, commit, dispose };
  };

  describe.each(bikeModelIds)("the %s bike", (model) => {
    it.each(cases)(
      "with $name, each solid part draws only the bikes in the box and draws them all again after",
      ({ anchor, at, casting }) => {
        const { bikes, commit, dispose } = ride(model, at.length);
        const submitted = commit(at, new THREE.Vector3(...anchor));
        const parts = solidParts(bikes);
        expect(parts).toHaveLength(3);
        for (const part of parts) {
          expect(submitted.get(part)).toStrictEqual([casting]);
          expect(part.count).toBe(at.length);
        }
        const solid = new Set<THREE.Object3D>(parts);
        expect(
          [...submitted.keys()].filter((drawn) => !solid.has(drawn))
        ).toStrictEqual([]);
        dispose();
      }
    );

    it("keeps each bike's paint and trim when the casters change", () => {
      const { bikes, commit, dispose } = ride(model, 3);
      const anchor = new THREE.Vector3(40, 0, -30);
      const slot = new THREE.Matrix4();
      const where = new THREE.Vector3();
      const colour = new THREE.Color();
      for (const { at, casters } of reorders) {
        const submitted = commit(at, anchor);
        const [body] = solidParts(bikes);
        if (!body) {
          throw new Error(`${model} has no solid body part`);
        }
        expect(submitted.get(body)).toStrictEqual([casters.length]);
        expect(body.count).toBe(3);
        const paint = body.geometry.getAttribute("instancePaint");
        const trim = body.geometry.getAttribute("instanceTrim");
        const inSlots = Array.from({ length: body.count }, (_, index) => {
          body.getMatrixAt(index, slot);
          where.setFromMatrixPosition(slot).add(anchor);
          const rider = at.findIndex(
            (position) => position.distanceTo(where) < 1e-6
          );
          expect(paint.getX(index)).toBeCloseTo(colour.set(paintOf(rider)).r);
          expect(trim.getX(index)).toBeCloseTo(colour.set(trimOf(rider)).r);
          return rider;
        });
        expect(
          inSlots.slice(0, casters.length).toSorted(byIndex)
        ).toStrictEqual([...casters]);
        expect(inSlots.toSorted(byIndex)).toStrictEqual([0, 1, 2]);
      }
      dispose();
    });
  });
});
