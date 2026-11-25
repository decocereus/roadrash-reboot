import * as THREE from "three";

const STEP = 0.01;
const HALF_WIDTH = 0.35;
const FRONT = -0.8;
const BACK = 0.8;
const FLAT = 1e-9;

const across = Math.round((2 * HALF_WIDTH) / STEP) + 1;
const along = Math.round((BACK - FRONT) / STEP) + 1;

export interface BikeDeck {
  readonly heightAt: (x: number, z: number) => number;
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

const deckFrom = (heights: Float32Array): BikeDeck => {
  const at = (column: number, row: number) =>
    column < 0 || column >= across || row < 0 || row >= along
      ? -Infinity
      : (heights[row * across + column] ?? -Infinity);
  return {
    heightAt(x, z) {
      const column = Math.floor((x + HALF_WIDTH) / STEP);
      const row = Math.floor((z - FRONT) / STEP);
      return Math.max(
        at(column, row),
        at(column + 1, row),
        at(column, row + 1),
        at(column + 1, row + 1)
      );
    },
  };
};

export const deckOf = (
  geometries: readonly THREE.BufferGeometry[],
  turn: THREE.Matrix4
): BikeDeck => {
  const heights = new Float32Array(across * along).fill(-Infinity);
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let at = 0; at < count; at += 3) {
      const corner = (offset: number) =>
        index ? index.getX(at + offset) : at + offset;
      a.fromBufferAttribute(position, corner(0)).applyMatrix4(turn);
      b.fromBufferAttribute(position, corner(1)).applyMatrix4(turn);
      c.fromBufferAttribute(position, corner(2)).applyMatrix4(turn);
      const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
      if (Math.abs(area) < FLAT) {
        continue;
      }
      const fromColumn = Math.max(
        0,
        Math.ceil((Math.min(a.x, b.x, c.x) + HALF_WIDTH) / STEP)
      );
      const toColumn = Math.min(
        across - 1,
        Math.floor((Math.max(a.x, b.x, c.x) + HALF_WIDTH) / STEP)
      );
      const fromRow = Math.max(
        0,
        Math.ceil((Math.min(a.z, b.z, c.z) - FRONT) / STEP)
      );
      const toRow = Math.min(
        along - 1,
        Math.floor((Math.max(a.z, b.z, c.z) - FRONT) / STEP)
      );
      for (let row = fromRow; row <= toRow; row += 1) {
        const z = FRONT + row * STEP;
        for (let column = fromColumn; column <= toColumn; column += 1) {
          const x = column * STEP - HALF_WIDTH;
          const u = ((x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z)) / area;
          const v = ((b.x - a.x) * (z - a.z) - (x - a.x) * (b.z - a.z)) / area;
          if (u < 0 || v < 0 || u + v > 1) {
            continue;
          }
          const cell = row * across + column;
          const y = a.y + u * (b.y - a.y) + v * (c.y - a.y);
          heights[cell] = Math.max(heights[cell] ?? -Infinity, y);
        }
      }
    }
  }
  return deckFrom(heights);
};
