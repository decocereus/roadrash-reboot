import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { RED } from "./looks.ts";

type SlotPolicy =
  | { readonly kind: "painted"; readonly gloss: number }
  | { readonly kind: "fixed"; readonly colour: string; readonly gloss: number }
  | {
      readonly kind: "lamp";
      readonly colour: string;
      readonly strength: number;
    }
  | { readonly kind: "authored"; readonly glows: boolean };

const slotPolicies = {
  accent: { gloss: 0.6, kind: "painted" },
  armour: { colour: "#231d30", gloss: 0, kind: "fixed" },
  atlas: { colour: "#ffffff", gloss: 0, kind: "fixed" },
  body: { gloss: 1, kind: "painted" },
  boot: { colour: "#15121c", gloss: 0, kind: "fixed" },
  dark: { colour: "#231d30", gloss: 0, kind: "fixed" },
  glass: { colour: "#101c30", gloss: 1, kind: "fixed" },
  glove: { colour: "#15121c", gloss: 0, kind: "fixed" },
  gold: { colour: "#e0ac3a", gloss: 0.7, kind: "fixed" },
  helmet: { gloss: 1, kind: "painted" },
  helmet2: { gloss: 1, kind: "painted" },
  light_head: { colour: "#fff7d6", kind: "lamp", strength: 1.5 },
  light_ind: { colour: "#ff9a1f", kind: "lamp", strength: 1.6 },
  light_tail: { colour: RED, kind: "lamp", strength: 2.4 },
  metal: { colour: "#8f93ad", gloss: 0.5, kind: "fixed" },
  plate: { colour: "#ece6d8", gloss: 0, kind: "fixed" },
  seat: { colour: "#17141f", gloss: 0, kind: "fixed" },
  stall_cel: { glows: false, kind: "authored" },
  stall_glow: { glows: true, kind: "authored" },
  suit: { gloss: 0, kind: "painted" },
  suit2: { gloss: 0, kind: "painted" },
  tyre: { colour: "#17141f", gloss: 0, kind: "fixed" },
  visor: { colour: "#0f1c33", gloss: 1, kind: "fixed" },
} as const satisfies Record<string, SlotPolicy>;

export type Slot = keyof typeof slotPolicies;

export const isSlot = (name: string): name is Slot =>
  Object.hasOwn(slotPolicies, name);

export interface Primitive {
  readonly slot: Slot;
  readonly geometry: THREE.BufferGeometry;
}

export type Palette = ReadonlyMap<Slot, THREE.ColorRepresentation>;

export interface Painted {
  readonly cel: THREE.BufferGeometry | null;
  readonly glow: THREE.BufferGeometry | null;
}

export const glows = (slot: Slot): boolean => {
  const policy = slotPolicies[slot];
  switch (policy.kind) {
    case "lamp": {
      return true;
    }
    case "authored": {
      return policy.glows;
    }
    case "fixed":
    case "painted": {
      return false;
    }
    default: {
      return policy satisfies never;
    }
  }
};

export const coloured = (
  primitive: Primitive,
  colour: THREE.Color,
  gloss: number
): THREE.BufferGeometry => {
  const source = primitive.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.getIndex());
  for (const name of ["position", "normal", "uv", "skinIndex", "skinWeight"]) {
    if (source.hasAttribute(name)) {
      geometry.setAttribute(name, source.getAttribute(name));
    }
  }
  const { count } = source.getAttribute("position");
  const colours = new Float32Array(count * 3);
  const glosses = new Float32Array(count).fill(gloss);
  for (let vertex = 0; vertex < count; vertex += 1) {
    colours[vertex * 3] = colour.r;
    colours[vertex * 3 + 1] = colour.g;
    colours[vertex * 3 + 2] = colour.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute("gloss", new THREE.BufferAttribute(glosses, 1));
  return geometry;
};

const tint = new THREE.Color();

export const paintPrimitives = (
  primitives: readonly Primitive[],
  palette: Palette
): Painted => {
  const cel: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  for (const primitive of primitives) {
    const policy = slotPolicies[primitive.slot];
    switch (policy.kind) {
      case "lamp": {
        tint.set(policy.colour).multiplyScalar(policy.strength);
        glow.push(coloured(primitive, tint, 0));
        break;
      }
      case "fixed": {
        cel.push(coloured(primitive, tint.set(policy.colour), policy.gloss));
        break;
      }
      case "painted": {
        const colour = palette.get(primitive.slot);
        if (colour === undefined) {
          throw new Error(
            `The ${primitive.slot} part has no colour in its palette.`
          );
        }
        cel.push(coloured(primitive, tint.set(colour), policy.gloss));
        break;
      }
      case "authored": {
        throw new Error(
          `The ${primitive.slot} part keeps the colours it was modelled with.`
        );
      }
      default: {
        return policy satisfies never;
      }
    }
  }
  return {
    cel: cel.length > 0 ? mergeGeometries(cel) : null,
    glow: glow.length > 0 ? mergeGeometries(glow) : null,
  };
};
