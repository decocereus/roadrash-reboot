import type { Random } from "@racer/track/random";
import * as THREE from "three";

export const FULL_TURN = Math.PI * 2;

interface Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

export const sheet = (width: number, height: number): Sheet => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("A texture needs a 2D canvas.");
  }
  return { canvas, context };
};

export const textureOf = (
  canvas: HTMLCanvasElement,
  repeat: boolean
): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
};

export const pick = <Item>(random: Random, items: readonly Item[]): Item => {
  const item = items[Math.floor(random() * items.length)] ?? items[0];
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list.");
  }
  return item;
};

export interface Lit {
  readonly map: THREE.CanvasTexture;
  readonly glow: THREE.CanvasTexture;
}
