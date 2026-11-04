import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Vec = readonly [number, number, number];

interface Placed {
  readonly yaw?: number;
  readonly tilt?: number;
  readonly strength?: number;
}

export interface Kit {
  readonly box: (
    centre: Vec,
    size: Vec,
    colour: string,
    placed?: Placed
  ) => void;
  readonly panel: (
    centre: Vec,
    size: readonly [number, number],
    colour: string,
    placed?: Placed
  ) => void;
  readonly pole: (
    centre: Vec,
    radii: readonly [number, number],
    height: number,
    colour: string,
    placed?: Placed & { readonly sides?: number }
  ) => void;
  readonly ball: (centre: Vec, radius: number, colour: string) => void;
  readonly build: () => THREE.BufferGeometry | null;
}

const DEFAULT_SIDES = 10;
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const SHEET = new THREE.PlaneGeometry(1, 1);
const SPHERE = new THREE.SphereGeometry(1, 10, 8);

const paintGeometry = (
  source: THREE.BufferGeometry,
  placement: THREE.Matrix4,
  colour: string,
  strength: number
): THREE.BufferGeometry => {
  const geometry = source.clone();
  geometry.deleteAttribute("uv");
  geometry.applyMatrix4(placement);
  const { count } = geometry.getAttribute("position");
  const colours = new Float32Array(count * 3);
  const tint = new THREE.Color(colour).multiplyScalar(strength);
  for (let vertex = 0; vertex < count; vertex += 1) {
    tint.toArray(colours, vertex * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
};

export const createKit = (): Kit => {
  const parts: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();
  const place = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const composed = (
    centre: Vec,
    size: Vec,
    { tilt = 0, yaw = 0 }: Placed
  ): THREE.Matrix4 =>
    matrix.compose(
      place.set(...centre),
      turn.setFromEuler(euler.set(tilt, yaw, 0, "YXZ")),
      scale.set(...size)
    );
  return {
    ball(centre, radius, colour) {
      parts.push(
        paintGeometry(
          SPHERE,
          composed(centre, [radius, radius, radius], {}),
          colour,
          1
        )
      );
    },
    box(centre, size, colour, placed = {}) {
      parts.push(
        paintGeometry(
          UNIT,
          composed(centre, size, placed),
          colour,
          placed.strength ?? 1
        )
      );
    },
    build() {
      if (parts.length === 0) {
        return null;
      }
      const merged = mergeGeometries(parts);
      for (const part of parts) {
        part.dispose();
      }
      return merged;
    },
    panel(centre, [wide, high], colour, placed = {}) {
      parts.push(
        paintGeometry(
          SHEET,
          composed(centre, [wide, high, 1], placed),
          colour,
          placed.strength ?? 1
        )
      );
    },
    pole(centre, [top, bottom], height, colour, placed = {}) {
      const source = new THREE.CylinderGeometry(
        top,
        bottom,
        height,
        placed.sides ?? DEFAULT_SIDES
      );
      parts.push(
        paintGeometry(
          source,
          composed(centre, [1, 1, 1], placed),
          colour,
          placed.strength ?? 1
        )
      );
      source.dispose();
    },
  };
};
