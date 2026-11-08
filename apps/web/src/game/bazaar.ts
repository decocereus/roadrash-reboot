import { createRandom } from "@racer/track/random";
import { stallVariants } from "@racer/track/stalls";
import type { StallFootprint } from "@racer/track/stalls";
import type { Track, TrackPoint } from "@racer/track/track";
import type { WalkSite } from "@racer/track/walk-sites";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { ModelParts } from "./assets.ts";
import type { Shading } from "./cel.ts";
import { extentOf } from "./clearance.ts";
import type { Clearance, Extent } from "./clearance.ts";
import { placeOnGround } from "./ground.ts";
import type { Stretch } from "./ground.ts";
import { glows } from "./model-slots.ts";
import type { Primitive } from "./model-slots.ts";

const groundDecos = [
  "deco_crates",
  "deco_bin",
  "deco_stool",
  "deco_hanging_sign",
] as const;
const LANTERNS = "deco_lanterns";
const STRING_LIGHTS = "deco_string_lights";

export const stallParts = stallVariants.map((variant) => `stall_${variant}`);
export const decoParts = [...groundDecos, LANTERNS, STRING_LIGHTS] as const;

export const BAZAAR_NAME = "bazaar";

const SEED_SALT = 41;
const GROUND_DECO_CHANCE = 0.75;
const GROUND_DECO_BACK = 0.35;
const STRING_LIGHTS_BACK = 1.7;
const GLOW_PAINT = 1.6;
const VISIBLE_MARGIN = 10;
const LONGEST_GAP = 4;
const COPIED = ["position", "normal", "color"] as const;

interface Drawn {
  readonly part: string;
  readonly s: number;
  readonly x: number;
  readonly turn: number;
}

interface Laid {
  readonly drawn: Drawn;
  readonly stall: StallFootprint | null;
}

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const placer = new THREE.Object3D();

const turnOf = (x: number): number => (x > 0 ? Math.PI : 0);

const decosBetween = (
  stall: StallFootprint,
  next: StallFootprint,
  place: number,
  random: () => number,
  walkSites: readonly WalkSite[]
): Laid[] => {
  const end = stall.s + stall.halfLength;
  const gap = next.s - next.halfLength - end;
  if (gap <= 0 || gap > LONGEST_GAP) {
    return [];
  }
  const side = Math.sign(stall.x);
  const front = Math.abs(stall.x) - stall.halfWidth;
  const s = end + gap / 2;
  const laid: Laid[] = [];
  const ground = groundDecos[place % groundDecos.length];
  const x = side * (front + GROUND_DECO_BACK);
  const walkersPass = walkSites.some(
    (site) => site.s > end && site.s < end + gap
  );
  if (ground && random() < GROUND_DECO_CHANCE && !walkersPass) {
    laid.push({ drawn: { part: ground, s, turn: turnOf(x), x }, stall: null });
  }
  const overhead = side * (front + STRING_LIGHTS_BACK);
  if (place % 2 === 0) {
    laid.push({
      drawn: {
        part: STRING_LIGHTS,
        s,
        turn: -side * (Math.PI / 2),
        x: overhead,
      },
      stall: null,
    });
  }
  if (place % 4 === 0) {
    laid.push({
      drawn: { part: LANTERNS, s, turn: turnOf(overhead), x: overhead },
      stall: null,
    });
  }
  return laid;
};

const layOut = ({ plan, stalls, walkSites }: Track): Laid[] => {
  const random = createRandom(plan.seed + SEED_SALT);
  const laid: Laid[] = stalls.map((stall) => ({
    drawn: {
      part: `stall_${stall.variant}`,
      s: stall.s,
      turn: turnOf(stall.x),
      x: stall.x,
    },
    stall,
  }));
  for (const side of [-1, 1]) {
    const row = stalls.filter((stall) => Math.sign(stall.x) === side);
    for (let place = 0; place + 1 < row.length; place += 1) {
      const stall = row[place];
      const next = row[place + 1];
      if (stall && next) {
        laid.push(...decosBetween(stall, next, place, random, walkSites));
      }
    }
  }
  return laid;
};

const posed = (
  { geometry }: Primitive,
  matrix: THREE.Matrix4
): THREE.BufferGeometry => {
  const copy = new THREE.BufferGeometry();
  copy.setIndex(geometry.getIndex()?.clone() ?? null);
  for (const name of COPIED) {
    copy.setAttribute(name, geometry.getAttribute(name).clone());
  }
  return copy.applyMatrix4(matrix);
};

const stallExtents = (
  track: Track,
  stall: StallFootprint,
  top: number
): Extent[] => {
  const reach = stall.halfLength - stall.halfWidth;
  return [-reach, reach].map((along) => {
    placeOnGround(track, stall.s + along, stall.x, point);
    return {
      bottom: point.y,
      radius: stall.halfWidth,
      top: point.y + top,
      x: point.x,
      z: point.z,
    };
  });
};

const heightOf = (primitives: readonly Primitive[]): number => {
  let top = 0;
  for (const { geometry } of primitives) {
    geometry.computeBoundingBox();
    top = Math.max(top, geometry.boundingBox?.max.y ?? 0);
  }
  return top;
};

const primitivesOf = (kit: ModelParts, part: string): readonly Primitive[] => {
  const primitives = kit.get(part);
  if (!primitives) {
    throw new Error(`The stall kit has no ${part}.`);
  }
  return primitives;
};

const brightened = (mesh: THREE.Mesh): THREE.Mesh => {
  const colours = mesh.geometry.getAttribute("color");
  for (let index = 0; index < colours.count; index += 1) {
    colours.setXYZ(
      index,
      colours.getX(index) * GLOW_PAINT,
      colours.getY(index) * GLOW_PAINT,
      colours.getZ(index) * GLOW_PAINT
    );
  }
  return mesh;
};

interface Batch {
  readonly geometries: THREE.BufferGeometry[];
  indices: number;
}

const addTo = (
  batch: Batch,
  primitive: Primitive,
  matrix: THREE.Matrix4
): readonly [number, number] => {
  const geometry = posed(primitive, matrix);
  const from = batch.indices;
  batch.geometries.push(geometry);
  batch.indices += geometry.getIndex()?.count ?? 0;
  return [from, batch.indices];
};

export const buildBazaar = (
  track: Track,
  shading: Shading,
  kit: ModelParts,
  clearance: Clearance
): Stretch => {
  const cel: Batch = { geometries: [], indices: 0 };
  const glow: Batch = { geometries: [], indices: 0 };
  const placed = layOut(track).map(({ drawn, stall }) => {
    const primitives = primitivesOf(kit, drawn.part);
    placeOnGround(track, drawn.s, drawn.x, point);
    placer.position.set(point.x, point.y, point.z);
    placer.rotation.set(0, drawn.turn - point.heading, 0);
    placer.updateMatrix();
    const matrix = placer.matrix.clone();
    const spans = primitives.map((primitive) => {
      const batch = glows(primitive.slot) ? glow : cel;
      return { batch, span: addTo(batch, primitive, matrix) };
    });
    const extents = stall
      ? stallExtents(track, stall, heightOf(primitives))
      : primitives.map(({ geometry }) => extentOf(geometry, matrix));
    return { extents, spans };
  });
  const celMesh = new THREE.Mesh(
    mergeGeometries(cel.geometries),
    shading.cel("#ffffff", { vertexColors: true })
  );
  celMesh.receiveShadow = true;
  const glowMesh = brightened(
    new THREE.Mesh(mergeGeometries(glow.geometries), shading.glowPaint())
  );
  const indexOf = (batch: Batch): THREE.BufferAttribute => {
    const index = (batch === glow ? glowMesh : celMesh).geometry.getIndex();
    if (!index) {
      throw new Error("A merged stall mesh has no index.");
    }
    return index;
  };
  for (const { extents, spans } of placed) {
    clearance.addSpans(
      spans.map(({ batch, span: [from, to] }) => ({
        from,
        index: indexOf(batch),
        to,
      })),
      extents
    );
  }
  const object = new THREE.Group();
  object.name = BAZAAR_NAME;
  object.add(celMesh, glowMesh);
  return {
    from: (track.stalls[0]?.s ?? 0) - VISIBLE_MARGIN,
    object,
    to: (track.stalls.at(-1)?.s ?? 0) + VISIBLE_MARGIN,
  };
};
