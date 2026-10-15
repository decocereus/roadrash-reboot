import { emptySupport, lipOf, supportAt } from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { freeze } from "./ground.ts";
import type { Stretch } from "./ground.ts";
import { CYAN, YELLOW } from "./looks.ts";

const DECK_ROWS = 12;
const SINK = 0.08;
const STRIP_WIDTH = 0.1;
const STRIP_LIFT = 0.015;
const LIP_STRIP = 0.2;
const GRIP_LIFT = 0.012;
const GRIP_LENGTH = 0.12;
const GRIP_INSET = 0.18;
const HAZARD_BAND = 1.4;
const HAZARD_BARS = 4;
const SIDE_STRIPE = 0.5;
const CHEVRON_GAPS = [12, 24, 36, 48, 60, 72] as const;
const CHEVRON_DEPTH = 1.8;
const CHEVRON_BAR = 0.45;
const CHEVRON_FLARE = 0.5;
const DECAL_LIFT = 0.03;
const SHOWN_BEFORE = 60;
const SHOWN_AFTER = 5;
const EDGE_GLOW = 2;
const CHEVRON_GLOW = 1.3;
const DECK = new THREE.Color("#596170");
const GRIP = new THREE.Color("#a3acbc");
const LIP_FACE = new THREE.Color("#2b2f38");
const STRIPE_DARK = new THREE.Color("#15171a");
const STRIPE_LIGHT = new THREE.Color(YELLOW);
const EDGE = new THREE.Color(CYAN).multiplyScalar(EDGE_GLOW);
const CHEVRON = new THREE.Color(YELLOW).multiplyScalar(CHEVRON_GLOW);
const UP = new THREE.Vector3(0, 1, 0);

type Corner = readonly [s: number, x: number, lift: number];
type Face = readonly [Corner, Corner, Corner, Corner];

interface Sheet {
  readonly positions: number[];
  readonly colours: number[];
}

export interface Ramps {
  readonly group: THREE.Group;
  readonly stretches: readonly Stretch[];
}

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const support = emptySupport();
const corners = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
];
const across = new THREE.Vector3();
const along = new THREE.Vector3();
const normal = new THREE.Vector3();
const FRONT = [0, 1, 2, 0, 2, 3] as const;
const BACK = [0, 2, 1, 0, 3, 2] as const;

const emptySheet = (): Sheet => ({ colours: [], positions: [] });

const place = (track: Track, corner: Corner, target: THREE.Vector3): void => {
  placeOnTrack(track, corner[0], corner[1], point);
  target.set(point.x, point.y + corner[2], point.z);
};

const quad = (
  track: Track,
  sheet: Sheet,
  face: Face,
  colour: THREE.Color,
  outward: THREE.Vector3
): void => {
  for (const [index, corner] of face.entries()) {
    const target = corners[index];
    if (target) {
      place(track, corner, target);
    }
  }
  const [a, b, c] = corners;
  if (!(a && b && c)) {
    return;
  }
  across.subVectors(b, a);
  along.subVectors(c, a);
  normal.crossVectors(across, along);
  for (const index of normal.dot(outward) >= 0 ? FRONT : BACK) {
    const corner = corners[index];
    if (corner) {
      sheet.positions.push(corner.x, corner.y, corner.z);
      sheet.colours.push(colour.r, colour.g, colour.b);
    }
  }
};

const geometryOf = (sheet: Sheet): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(sheet.positions, 3)
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(sheet.colours, 3)
  );
  geometry.computeVertexNormals();
  return geometry;
};

const outwardOf = (track: Track, from: Corner, to: Corner): THREE.Vector3 => {
  const target = new THREE.Vector3();
  place(track, from, along);
  place(track, to, target);
  return target.sub(along).normalize();
};

const stripeOf = (index: number): THREE.Color =>
  index % 2 === 0 ? STRIPE_LIGHT : STRIPE_DARK;

interface Ramp {
  readonly track: Track;
  readonly jump: TrackFeature;
  readonly heightOf: (s: number) => number;
  readonly left: number;
  readonly right: number;
}

const deckStrip = (
  ramp: Ramp,
  sheet: Sheet,
  span: readonly [number, number],
  lift: number,
  colour: THREE.Color
): void => {
  const { track, heightOf, left, right } = ramp;
  const [near, far] = span;
  quad(
    track,
    sheet,
    [
      [near, left, heightOf(near) + lift],
      [near, right, heightOf(near) + lift],
      [far, right, heightOf(far) + lift],
      [far, left, heightOf(far) + lift],
    ],
    colour,
    UP
  );
};

const buildDeck = (ramp: Ramp, solid: Sheet): void => {
  const { jump } = ramp;
  const lip = lipOf(jump);
  const band = lip - HAZARD_BAND;
  for (let row = 0; row < DECK_ROWS; row += 1) {
    const near = jump.s + (jump.length * row) / DECK_ROWS;
    const far = Math.min(band, jump.s + (jump.length * (row + 1)) / DECK_ROWS);
    if (far > near) {
      deckStrip(ramp, solid, [near, far], 0, DECK);
    }
    const grip = near + GRIP_INSET;
    if (grip + GRIP_LENGTH < band) {
      deckStrip(ramp, solid, [grip, grip + GRIP_LENGTH], GRIP_LIFT, GRIP);
    }
  }
  const bar = HAZARD_BAND / HAZARD_BARS;
  for (let index = 0; index < HAZARD_BARS; index += 1) {
    deckStrip(
      ramp,
      solid,
      [band + bar * index, band + bar * (index + 1)],
      0,
      stripeOf(index)
    );
  }
};

const buildSides = (ramp: Ramp, solid: Sheet): void => {
  const { track, jump, heightOf, left, right } = ramp;
  const leftward = outwardOf(track, [jump.s, right, 0], [jump.s, left, 0]);
  const rightward = leftward.clone().negate();
  const stripes = Math.ceil(jump.length / SIDE_STRIPE);
  for (let index = 0; index < stripes; index += 1) {
    const near = jump.s + (jump.length * index) / stripes;
    const far = jump.s + (jump.length * (index + 1)) / stripes;
    for (const [x, outward] of [
      [left, leftward],
      [right, rightward],
    ] as const) {
      quad(
        track,
        solid,
        [
          [near, x, -SINK],
          [far, x, -SINK],
          [far, x, heightOf(far)],
          [near, x, heightOf(near)],
        ],
        stripeOf(index),
        outward
      );
    }
  }
  const lip = lipOf(jump);
  const top = heightOf(lip);
  quad(
    track,
    solid,
    [
      [lip, left, -SINK],
      [lip, right, -SINK],
      [lip, right, top],
      [lip, left, top],
    ],
    LIP_FACE,
    outwardOf(track, [lip - 1, jump.x, 0], [lip, jump.x, 0])
  );
};

const buildGlow = (ramp: Ramp, glow: Sheet): void => {
  const { track, jump, heightOf, left, right } = ramp;
  for (let row = 0; row < DECK_ROWS; row += 1) {
    const near = jump.s + (jump.length * row) / DECK_ROWS;
    const far = jump.s + (jump.length * (row + 1)) / DECK_ROWS;
    for (const [x, inner] of [
      [left, left + STRIP_WIDTH],
      [right, right - STRIP_WIDTH],
    ] as const) {
      quad(
        track,
        glow,
        [
          [near, x, heightOf(near) + STRIP_LIFT],
          [near, inner, heightOf(near) + STRIP_LIFT],
          [far, inner, heightOf(far) + STRIP_LIFT],
          [far, x, heightOf(far) + STRIP_LIFT],
        ],
        EDGE,
        UP
      );
    }
  }
  const lip = lipOf(jump);
  deckStrip(ramp, glow, [lip - LIP_STRIP, lip], STRIP_LIFT * 2, EDGE);
  const reach = jump.width / 2 + CHEVRON_FLARE;
  for (const gap of CHEVRON_GAPS) {
    const tip = jump.s - gap;
    const tail = tip - CHEVRON_DEPTH;
    for (const side of [-1, 1]) {
      const outer = jump.x + side * reach;
      quad(
        track,
        glow,
        [
          [tail, outer, DECAL_LIFT],
          [tip, jump.x, DECAL_LIFT],
          [tip - CHEVRON_BAR, jump.x, DECAL_LIFT],
          [tail - CHEVRON_BAR, outer, DECAL_LIFT],
        ],
        CHEVRON,
        UP
      );
    }
  }
};

const buildRamp = (
  track: Track,
  jump: TrackFeature,
  index: number,
  materials: readonly [THREE.Material, THREE.Material]
): THREE.Group => {
  const ramp: Ramp = {
    heightOf: (s) => {
      supportAt(track, s, jump.x, support);
      return support.feature === index ? support.height : 0;
    },
    jump,
    left: jump.x - jump.width / 2,
    right: jump.x + jump.width / 2,
    track,
  };
  const solid = emptySheet();
  const glow = emptySheet();
  buildDeck(ramp, solid);
  buildSides(ramp, solid);
  buildGlow(ramp, glow);
  const [cel, light] = materials;
  const body = new THREE.Mesh(geometryOf(solid), cel);
  body.castShadow = true;
  body.receiveShadow = true;
  const group = new THREE.Group();
  group.add(body, onFxLayer(new THREE.Mesh(geometryOf(glow), light)));
  return freeze(group);
};

export function buildRamps(track: Track, shading: Shading): Ramps {
  const group = new THREE.Group();
  const stretches: Stretch[] = [];
  if (track.features.length === 0) {
    return { group, stretches };
  }
  const materials = [
    shading.cel("#ffffff", { rim: 0.5, vertexColors: true }),
    shading.glowPaint(),
  ] as const;
  for (const [index, jump] of track.features.entries()) {
    const ramp = buildRamp(track, jump, index, materials);
    group.add(ramp);
    stretches.push({
      from: jump.s - SHOWN_BEFORE,
      object: ramp,
      to: lipOf(jump) + SHOWN_AFTER,
    });
  }
  return { group, stretches };
}
