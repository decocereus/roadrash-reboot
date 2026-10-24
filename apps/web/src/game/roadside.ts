import { createRandom } from "@racer/track/random";
import type { Random } from "@racer/track/random";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { Shading } from "./cel.ts";
import { FRONT_GAP } from "./city.ts";
import type { Clearance } from "./clearance.ts";
import { groundLift, lifted, plant, rolling } from "./ground.ts";
import type { Part, Placement, Stretch } from "./ground.ts";
import { RED } from "./looks.ts";
import type { Roadside } from "./looks.ts";
import { warningSignTexture } from "./sign-textures.ts";
import { owned } from "./texture-canvas.ts";

const CHUNK_LENGTH = 200;
const BANK_STEP = 2;
const BANK_TAPER = 8;
const BANK_CREST = 0.6;
const BANK_BACK = 5;
const BANK_SKIRT = 0.6;
const POST_SPACING = 28;
const SIGN_SPACING = 260;
const BOULDER_SPACING = 12;
const TREELINE_SPACING = 10;
const SEED_SALT = 0x5e_ed;
const POLE = "#221a30";

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const origin = new THREE.Vector3();
const edge = new THREE.Vector3();
const edge2 = new THREE.Vector3();
const normal = new THREE.Vector3();
const toward = new THREE.Vector3();
const centre = new THREE.Vector3();

interface Bank {
  readonly side: number;
  readonly from: number;
  readonly to: number;
  readonly height: number;
}

type Row = readonly [foot: number[], crest: number[], back: number[]];

export const pineParts = (shading: Shading): Part[] => {
  const { look } = shading;
  return [
    {
      geometry: lifted(
        new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6),
        [0, 0.9, 0]
      ),
      material: shading.cel(look.trunk),
    },
    {
      geometry: lifted(new THREE.ConeGeometry(2.1, 4.2, 8), [0, 3.9, 0]),
      material: shading.cel(look.foliage[0]),
    },
    {
      geometry: lifted(new THREE.ConeGeometry(1.5, 3.4, 8), [0, 6.1, 0]),
      material: shading.cel(look.foliage[1]),
    },
  ];
};

export const boulderParts = (shading: Shading): Part[] => [
  {
    geometry: lifted(new THREE.IcosahedronGeometry(0.95, 0), [0, 0.35, 0]),
    material: shading.cel(shading.look.rock),
  },
];

const postParts = (shading: Shading): Part[] => [
  {
    geometry: lifted(new THREE.BoxGeometry(0.12, 1.2, 0.12), [0, 0.6, 0]),
    material: shading.cel(shading.look.line),
  },
  {
    geometry: lifted(new THREE.BoxGeometry(0.05, 0.14, 0.1), [0.08, 1.02, 0]),
    material: shading.glow(RED, 1.8),
  },
];

const signParts = (shading: Shading, textures: Set<THREE.Texture>): Part[] => [
  {
    geometry: lifted(
      new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6),
      [0, 1.15, 0]
    ),
    material: shading.cel(POLE),
  },
  {
    geometry: lifted(
      new THREE.PlaneGeometry(0.9, 0.9).rotateZ(Math.PI / 4),
      [0, 2.5, 0]
    ),
    material: new THREE.MeshBasicMaterial({
      map: owned(textures, warningSignTexture()),
      side: THREE.DoubleSide,
    }),
  },
];

const layBanks = (track: Track, random: Random, roadside: Roadside): Bank[] => {
  const banks: Bank[] = [];
  if (roadside.bank <= 0) {
    return banks;
  }
  const [low, high] = roadside.bankHeight;
  for (const side of [-1, 1]) {
    let s = track.startS + 40;
    while (s < track.endS - 60) {
      const bend = track.curvature[Math.round(s - track.startS)] ?? 0;
      const inside = side * bend > 0;
      const chance = roadside.bank * (inside ? 1.5 : 1);
      if (random() < chance) {
        const length = 40 + random() * 140;
        banks.push({
          from: s,
          height: low + random() * (high - low),
          side,
          to: Math.min(track.endS - 40, s + length),
        });
        s += length + 10 + random() * 40;
      } else {
        s += 30 + random() * 90;
      }
    }
  }
  return banks;
};

const bankRow = (track: Track, bank: Bank, front: number, s: number): Row => {
  const taper = Math.min(
    1,
    (s - bank.from) / BANK_TAPER,
    (bank.to - s) / BANK_TAPER
  );
  placeOnTrack(track, s, bank.side * front, point);
  const height =
    bank.height * taper * (1 + 0.2 * rolling(point.x * 5, point.z * 5));
  const jag = 0.4 * rolling(point.x * 9, point.z * 9);
  const rail = (distance: number, lift: number): number[] => {
    const across = front + distance + jag;
    placeOnTrack(track, s, bank.side * across, point);
    const ground = groundLift(
      "open",
      across - track.roadHalfWidth,
      point.x,
      point.z
    );
    return [point.x, point.y + ground + lift, point.z];
  };
  return [
    rail(0, -BANK_SKIRT),
    rail(BANK_CREST, height),
    rail(BANK_BACK, height * 0.85),
  ];
};

const vector = (target: THREE.Vector3, corner: number[]): THREE.Vector3 =>
  target.set(corner[0] ?? 0, corner[1] ?? 0, corner[2] ?? 0);

const emit = (
  positions: number[],
  colors: number[],
  corners: readonly [number[], number[], number[]],
  colour: THREE.Color
): void => {
  const [a, b, c] = corners;
  vector(origin, a);
  vector(edge, b).sub(origin);
  vector(edge2, c).sub(origin);
  normal.crossVectors(edge, edge2);
  toward.copy(centre).sub(origin);
  toward.y += 3;
  const ordered = normal.dot(toward) >= 0 ? [a, b, c] : [a, c, b];
  for (const corner of ordered) {
    positions.push(corner[0] ?? 0, corner[1] ?? 0, corner[2] ?? 0);
    colors.push(colour.r, colour.g, colour.b);
  }
};

const bankGeometry = (
  track: Track,
  bank: Bank,
  span: readonly [number, number],
  front: number,
  colours: readonly [THREE.Color, THREE.Color]
): THREE.BufferGeometry | null => {
  const from = Math.max(bank.from, span[0]);
  const to = Math.min(bank.to, span[1]);
  if (to - from < BANK_STEP) {
    return null;
  }
  const [face, top] = colours;
  const positions: number[] = [];
  const colors: number[] = [];
  let previous: Row | null = null;
  const shaded = new THREE.Color();
  for (let s = from; s < to + BANK_STEP; s += BANK_STEP) {
    const row = bankRow(track, bank, front, Math.min(s, to));
    if (previous) {
      placeOnTrack(track, Math.min(s, to), 0, point);
      centre.set(point.x, point.y, point.z);
      shaded
        .copy(face)
        .multiplyScalar(1 + 0.1 * rolling(point.x * 13, point.z * 11));
      const [foot, crest, back] = row;
      const [lastFoot, lastCrest, lastBack] = previous;
      emit(positions, colors, [lastFoot, lastCrest, crest], shaded);
      emit(positions, colors, [lastFoot, crest, foot], shaded);
      emit(positions, colors, [lastCrest, lastBack, back], top);
      emit(positions, colors, [lastCrest, back, crest], top);
    }
    previous = row;
    if (s >= to) {
      break;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const layPosts = (track: Track, random: Random, front: number): Placement[] => {
  const posts: Placement[] = [];
  for (let s = track.startS + 14; s < track.endS; s += POST_SPACING) {
    for (const side of [-1, 1]) {
      posts.push({ s: s + random() * 2, scale: 1, x: side * (front + 0.15) });
    }
  }
  return posts;
};

const layTreeline = (
  track: Track,
  random: Random,
  front: number,
  treeline: number
): Placement[] => {
  const trees: Placement[] = [];
  if (treeline <= 0) {
    return trees;
  }
  const spacing = TREELINE_SPACING / treeline;
  for (let s = track.startS; s < track.endS; s += spacing) {
    for (const side of [-1, 1]) {
      if (random() < 0.85) {
        const spread = random();
        trees.push({
          s: s + random() * spacing * 0.8,
          scale: 0.9 + random() * 0.7,
          x: side * (front + 0.4 + spread * spread * 6),
        });
      }
    }
  }
  return trees;
};

const layBoulders = (
  track: Track,
  random: Random,
  front: number,
  boulders: number
): Placement[] => {
  const rocks: Placement[] = [];
  if (boulders <= 0) {
    return rocks;
  }
  for (let s = track.startS; s < track.endS; s += BOULDER_SPACING) {
    for (const side of [-1, 1]) {
      if (random() < boulders) {
        rocks.push({
          s: s + random() * BOULDER_SPACING,
          scale: 0.7 + random() * 1.6,
          x: side * (front + 0.6 + random() * 8),
        });
      }
    }
  }
  return rocks;
};

const laySigns = (
  track: Track,
  random: Random,
  front: number,
  signs: number
): Placement[] => {
  const boards: Placement[] = [];
  if (signs <= 0) {
    return boards;
  }
  for (let s = 120; s < track.length; s += SIGN_SPACING) {
    if (random() < signs) {
      boards.push({ s: s + random() * 60, scale: 1, x: front + 0.5 });
    }
  }
  return boards;
};

export interface RoadsideDressing {
  readonly group: THREE.Group;
  readonly stretches: readonly Stretch[];
}

export const buildRoadside = (
  track: Track,
  shading: Shading,
  textures: Set<THREE.Texture>,
  clearance: Clearance
): RoadsideDressing => {
  const { look } = shading;
  const { roadside } = look;
  const random = createRandom(track.plan.seed + SEED_SALT);
  const front = track.vergeHalfWidth + FRONT_GAP;
  const group = new THREE.Group();
  const stretches: Stretch[] = [];

  const banks = layBanks(track, random, roadside);
  const colours = [
    new THREE.Color(roadside.bankColour),
    new THREE.Color(look.groundNear),
  ] as const;
  const bankMaterial = shading.cel("#ffffff", { vertexColors: true });
  for (let from = track.startS; from < track.endS; from += CHUNK_LENGTH) {
    const span = [from, Math.min(track.endS, from + CHUNK_LENGTH)] as const;
    const pieces: THREE.BufferGeometry[] = [];
    for (const bank of banks) {
      const piece = bankGeometry(track, bank, span, front, colours);
      if (piece) {
        pieces.push(piece);
      }
    }
    if (pieces.length === 0) {
      continue;
    }
    const mesh = new THREE.Mesh(mergeGeometries(pieces), bankMaterial);
    for (const piece of pieces) {
      piece.dispose();
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    stretches.push({ from: span[0], object: mesh, to: span[1] });
  }

  plant(
    clearance,
    group,
    track,
    layPosts(track, random, front),
    postParts(shading),
    true
  );
  plant(
    clearance,
    group,
    track,
    layTreeline(track, random, front, roadside.treeline),
    pineParts(shading)
  );
  plant(
    clearance,
    group,
    track,
    layBoulders(track, random, front, roadside.boulders),
    boulderParts(shading)
  );
  plant(
    clearance,
    group,
    track,
    laySigns(track, random, front, roadside.signs),
    signParts(shading, textures)
  );
  return { group, stretches };
};
