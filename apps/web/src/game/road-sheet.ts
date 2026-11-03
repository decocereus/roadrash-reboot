import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

export const UP = new THREE.Vector3(0, 1, 0);

type Corner = readonly [s: number, x: number, lift: number];
type Face = readonly [Corner, Corner, Corner, Corner];

export interface Sheet {
  readonly positions: number[];
  readonly colours: number[];
  readonly alphas: boolean;
}

interface Facing {
  readonly left: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly back: THREE.Vector3;
  readonly ahead: THREE.Vector3;
}

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const corners = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
];
const edgeVector = new THREE.Vector3();
const along = new THREE.Vector3();
const normal = new THREE.Vector3();
const FRONT = [0, 1, 2, 0, 2, 3] as const;
const BACK = [0, 2, 1, 0, 3, 2] as const;

export const emptySheet = (alphas = false): Sheet => ({
  alphas,
  colours: [],
  positions: [],
});

const place = (track: Track, corner: Corner, target: THREE.Vector3): void => {
  placeOnTrack(track, corner[0], corner[1], point);
  target.set(point.x, point.y + corner[2], point.z);
};

const shade = (
  track: Track,
  sheet: Sheet,
  face: Face,
  outward: THREE.Vector3,
  paint: (index: number) => void
): void => {
  for (let index = 0; index < face.length; index += 1) {
    const corner = face[index];
    const target = corners[index];
    if (corner && target) {
      place(track, corner, target);
    }
  }
  const [a, b, c] = corners;
  if (!(a && b && c)) {
    return;
  }
  edgeVector.subVectors(b, a);
  along.subVectors(c, a);
  normal.crossVectors(edgeVector, along);
  for (const index of normal.dot(outward) >= 0 ? FRONT : BACK) {
    const corner = corners[index];
    if (corner) {
      sheet.positions.push(corner.x, corner.y, corner.z);
      paint(index);
    }
  }
};

export const quad = (
  track: Track,
  sheet: Sheet,
  face: Face,
  colour: THREE.Color,
  outward: THREE.Vector3
): void => {
  shade(track, sheet, face, outward, () => {
    sheet.colours.push(colour.r, colour.g, colour.b);
  });
};

export const geometryOf = (sheet: Sheet): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(sheet.positions, 3)
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(sheet.colours, sheet.alphas ? 4 : 3)
  );
  geometry.computeVertexNormals();
  return geometry;
};

const directionOf = (track: Track, from: Corner, to: Corner): THREE.Vector3 => {
  const target = new THREE.Vector3();
  place(track, from, along);
  place(track, to, target);
  return target.sub(along).normalize();
};

export const facingAt = (track: Track, s: number, x: number): Facing => {
  const left = directionOf(track, [s, x + 1, 0], [s, x, 0]);
  const ahead = directionOf(track, [s, x, 0], [s + 1, x, 0]);
  return {
    ahead,
    back: ahead.clone().negate(),
    left,
    right: left.clone().negate(),
  };
};
