import * as THREE from "three";
import type { WebGLCapabilities } from "three/src/renderers/webgl/WebGLCapabilities.js";
import type { WebGLObjects } from "three/src/renderers/webgl/WebGLObjects.js";
import { WebGLShadowMap } from "three/src/renderers/webgl/WebGLShadowMap.js";

import { isInstancedMesh } from "../src/game/meshes.ts";

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

export const shadowPass = (
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
