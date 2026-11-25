import * as THREE from "three";

import type { TowerRenderer } from "../src/game/hud-tower-pass.ts";
import { isMesh } from "../src/game/meshes.ts";

const CHARACTER_EM = 0.5;
const ASCENT_EM = 0.9;
const DESCENT_EM = 0.3;
const DEFAULT_PX = 24;

interface Drawing {
  readonly layer: number;
  readonly call: string;
  readonly args: readonly number[];
  readonly lineWidth: number;
}

const pxOf = (font: string): number =>
  Number(/(?<px>\d+(?:\.\d+)?)px/u.exec(font)?.groups?.px ?? DEFAULT_PX);

const untargeted = (): void => undefined;

export const recordingCanvases = () => {
  const drawings: Drawing[] = [];
  const counts = { layers: 0, reads: 0, refusals: 0 };
  const createElement = () => {
    const layer = counts.layers;
    counts.layers += 1;
    const pen = { font: "", lineWidth: 1 };
    const draw =
      (call: string) =>
      (...args: readonly number[]): void => {
        drawings.push({ args, call, layer, lineWidth: pen.lineWidth });
      };
    const canvas = {
      getContext: () => ({
        canvas,
        fillRect: draw("fillRect"),
        fillStyle: "",
        fillText: (_text: string, x: number, y: number) => {
          draw("fillText")(x, y);
        },
        get font() {
          return pen.font;
        },
        set font(font: string) {
          pen.font = font;
        },
        getImageData: (
          _x: number,
          _y: number,
          width: number,
          height: number
        ) => {
          counts.reads += 1;
          if (counts.refusals > 0) {
            counts.refusals -= 1;
            throw new Error("The test canvas refused the atlas read.");
          }
          return { data: new Uint8ClampedArray(width * height * 4) };
        },
        letterSpacing: "",
        get lineWidth() {
          return pen.lineWidth;
        },
        set lineWidth(width: number) {
          pen.lineWidth = width;
        },
        measureText: (text: string) => {
          const px = pxOf(pen.font);
          return {
            fontBoundingBoxAscent: px * ASCENT_EM,
            fontBoundingBoxDescent: px * DESCENT_EM,
            width: text.length * px * CHARACTER_EM,
          };
        },
        restore: draw("restore"),
        save: draw("save"),
        setTransform: draw("setTransform"),
        shadowBlur: 0,
        shadowColor: "",
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        strokeRect: draw("strokeRect"),
        strokeStyle: "",
        textBaseline: "",
      }),
      height: 0,
      width: 0,
    };
    return canvas;
  };
  return {
    createElement,
    drawings,
    layers: () => counts.layers,
    reads: () => counts.reads,
    refuseNextRead: () => {
      counts.refusals += 1;
    },
  };
};

export const motionPreference = () => {
  const listeners = new Set<() => void>();
  const media = {
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    matches: false,
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
  return {
    change: (reduced: boolean) => {
      media.matches = reduced;
      for (const listener of listeners) {
        listener();
      }
    },
    listeners,
    media,
  };
};

export const meshOf = (scene: THREE.Object3D): THREE.Mesh => {
  const [mesh] = scene.children;
  if (!mesh || !isMesh(mesh)) {
    throw new TypeError("The tower scene holds no mesh.");
  }
  return mesh;
};

export const consumingRenderer = () => {
  const versions = new Map<THREE.BufferAttribute, number>();
  const scenes: THREE.Object3D[] = [];
  const state = { draws: 0, failing: false, uploaded: 0 };
  const renderer: TowerRenderer = {
    autoClear: true,
    compile: (scene) => {
      scenes.push(scene);
      return new Set();
    },
    render: (scene) => {
      if (state.failing) {
        throw new Error("The test renderer failed the draw.");
      }
      const { attributes } = meshOf(scene).geometry;
      state.draws += 1;
      for (const attribute of [
        attributes.position,
        attributes.uv,
        attributes.fill,
        attributes.edge,
      ]) {
        if (
          attribute instanceof THREE.BufferAttribute &&
          attribute.version !== versions.get(attribute)
        ) {
          for (const range of attribute.updateRanges) {
            state.uploaded += range.count;
          }
          attribute.clearUpdateRanges();
          versions.set(attribute, attribute.version);
        }
      }
    },
    setRenderTarget: untargeted,
  };
  return { renderer, scenes, state };
};
