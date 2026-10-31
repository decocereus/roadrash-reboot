import { ARM_LENGTH, armSpans } from "@racer/track/crossings";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { groundLift, rolling, smoothstep } from "./ground.ts";
import type { Look } from "./looks.ts";

const ROAD_STEP = 2;
const TERRAIN_STEP = 4;
const TERRAIN_RINGS = [0, 1.5, 4, 9, 20, 45, 90, 160];
const ARM_CUT_MARGIN = 2;
const ARM_CUT_REACH = ARM_LENGTH + 30;

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const tint = new THREE.Color();

export type Rail = readonly [offset: number, lift: number, u: number];
export type Span = readonly [from: number, to: number];

const rowsAlong = (
  [from, to]: Span,
  step: number,
  edges: readonly number[] = []
): number[] => {
  const rows: number[] = [];
  for (let s = from; s < to; s += step) {
    rows.push(s);
  }
  rows.push(to);
  for (const edge of edges) {
    if (edge > from && edge < to && !rows.includes(edge)) {
      rows.push(edge);
    }
  }
  return rows.toSorted((a, b) => a - b);
};

export const buildRibbon = (
  track: Track,
  span: Span,
  rails: readonly Rail[],
  tile: number
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const columns = rails.length;
  const rows = rowsAlong(span, ROAD_STEP);
  let row = 0;
  for (const s of rows) {
    for (const [offset, lift, u] of rails) {
      placeOnTrack(track, s, offset, point);
      positions.push(point.x, point.y + lift, point.z);
      uvs.push(u, s / tile);
    }
    if (row < rows.length - 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const near = row * columns + column;
        const far = near + columns;
        indices.push(near, near + 1, far, near + 1, far + 1, far);
      }
    }
    row += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export const piecesBesideArms = (
  track: Track,
  span: Span,
  side: number
): Span[] => {
  const pieces: Span[] = [];
  let [from] = span;
  for (const [gapFrom, gapTo] of armSpans(track.crossings, side, 0)) {
    if (gapTo > from && gapFrom < span[1]) {
      if (gapFrom > from) {
        pieces.push([from, gapFrom]);
      }
      from = Math.max(from, gapTo);
    }
  }
  if (span[1] > from) {
    pieces.push([from, span[1]]);
  }
  return pieces;
};

const terrainColor = (
  look: Look,
  ring: number,
  worldX: number,
  worldZ: number
): THREE.Color => {
  if (ring <= 1) {
    return tint.set(look.walk);
  }
  const patch = (rolling(worldX * 3.1, worldZ * 2.7) + 1.5) / 3;
  return tint
    .set(look.groundNear)
    .lerp(new THREE.Color(look.groundFar), smoothstep((ring - 2) / 5))
    .lerp(new THREE.Color(look.groundPatch), patch * 0.35);
};

export const buildTerrainChunk = (
  track: Track,
  span: Span,
  side: number,
  look: Look
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const columns = TERRAIN_RINGS.length;
  const cuts = armSpans(track.crossings, side, ARM_CUT_MARGIN);
  const rows = rowsAlong(span, TERRAIN_STEP, cuts.flat());
  let row = 0;
  for (const s of rows) {
    const cut = cuts.some(([from, to]) => s >= from && s <= to);
    const bend = track.curvature[Math.round(s - track.startS)] ?? 0;
    const inside = side * bend > 0;
    const reach = inside ? 0.8 / Math.abs(bend) : Number.POSITIVE_INFINITY;
    for (let ring = 0; ring < TERRAIN_RINGS.length; ring += 1) {
      const offset = TERRAIN_RINGS[ring];
      if (offset === undefined) {
        continue;
      }
      const distance = Math.min(offset, reach);
      placeOnTrack(track, s, side * (track.roadHalfWidth + distance), point);
      const lift =
        cut && distance <= ARM_CUT_REACH
          ? 0
          : groundLift("open", distance, point.x, point.z);
      positions.push(point.x, point.y + lift, point.z);
      const color = terrainColor(look, ring, point.x, point.z);
      colors.push(color.r, color.g, color.b);
    }
    if (row < rows.length - 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const near = row * columns + column;
        const far = near + columns;
        if (side > 0) {
          indices.push(near, near + 1, far, near + 1, far + 1, far);
        } else {
          indices.push(near, far, near + 1, near + 1, far, far + 1);
        }
      }
    }
    row += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};
