import * as THREE from "three";

import { disposeTree } from "../src/game/dispose.ts";
import { createRenderer } from "../src/game/game.ts";
import { lookOf } from "../src/game/looks.ts";
import { createPipeline } from "../src/game/post.ts";

const SIZE = 320;
const BOARD = 4;
const BOARD_AT = 6;
const RIDER_AT = 12;
const INK = 0.5;

const luminanceAt = (pixels: Uint8Array, column: number, row: number) => {
  const at = (row * SIZE + column) * 4;
  return (
    0.2126 * (pixels[at] ?? 0) +
    0.7152 * (pixels[at + 1] ?? 0) +
    0.0722 * (pixels[at + 2] ?? 0)
  );
};

const inkIn = (
  pixels: Uint8Array,
  from: number,
  to: number,
  keep: (column: number, row: number) => boolean
): number => {
  const levels: number[] = [];
  for (let row = from; row < to; row += 1) {
    for (let column = from; column < to; column += 1) {
      if (keep(column, row)) {
        levels.push(luminanceAt(pixels, column, row));
      }
    }
  }
  const sorted = levels.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return levels.filter((level) => level < median * INK).length;
};

const sceneOf = (facing: "front" | "back"): THREE.Scene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d8d8e0");
  const rider = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.8, 1.2),
    new THREE.MeshBasicMaterial({ color: "#d05080" })
  );
  rider.position.set(0, 0, -RIDER_AT);
  rider.rotation.set(0.4, 0.7, 0);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD, BOARD),
    new THREE.MeshBasicMaterial({ color: "#c8a000", side: THREE.DoubleSide })
  );
  board.position.set(0, 0, -BOARD_AT);
  board.rotation.y = facing === "back" ? Math.PI : 0;
  scene.add(rider, board);
  return scene;
};

export const run = () => {
  const renderer = createRenderer(document.createElement("canvas"));
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  const pipeline = createPipeline(renderer);
  pipeline.setLook(lookOf("lowtown"));
  pipeline.resize(SIZE, SIZE, 1);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 6000);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const halfView = Math.tan(THREE.MathUtils.degToRad(25));
  const edge = Math.round((SIZE / 2) * (1 - BOARD / 2 / BOARD_AT / halfView));
  const measure = (facing: "front" | "back") => {
    const scene = sceneOf(facing);
    pipeline.render(scene, camera);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const middle = SIZE / 2;
    const inside = edge + 12;
    const result = {
      boardEdgeInk: inkIn(pixels, edge - 4, SIZE - edge + 4, (column, row) => {
        const fromEdge = Math.min(
          Math.abs(column - edge),
          Math.abs(column - (SIZE - edge)),
          Math.abs(row - edge),
          Math.abs(row - (SIZE - edge))
        );
        return fromEdge <= 3;
      }),
      insideInk: inkIn(pixels, inside, SIZE - inside, () => true),
      middleLevel: Math.round(luminanceAt(pixels, middle, middle)),
    };
    disposeTree(scene);
    return result;
  };
  const back = measure("back");
  const front = measure("front");
  const programs = renderer.info.programs?.length ?? 0;
  pipeline.dispose();
  renderer.dispose();
  return {
    back,
    front,
    ghosted: back.insideInk > 0 || front.insideInk > 0,
    outlined: back.boardEdgeInk > 0 && front.boardEdgeInk > 0,
    programs,
  };
};
