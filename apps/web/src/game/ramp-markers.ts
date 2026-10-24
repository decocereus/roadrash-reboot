import { lipOf } from "@racer/track/features";
import type * as THREE from "three";

import { freeze } from "./ground.ts";
import { emptySheet, facingAt, prism, quad, UP } from "./ramp-geometry.ts";
import type { Face, Ramp, Sheet } from "./ramp-geometry.ts";
import {
  CHEVRON,
  FASCIA,
  LAMP,
  meshesOf,
  POLE,
  SIGN_BACK,
  SIGN_FACE,
  SIGN_INK,
  stripeOf,
} from "./ramp-materials.ts";
import type { Materials } from "./ramp-materials.ts";

export const CHEVRON_GAPS = [12, 24, 36, 48, 60, 72] as const;
export const CHEVRON_DEPTH = 1.8;
export const CHEVRON_BAR = 0.45;
const CHEVRON_FLARE = 0.5;
const DECAL_LIFT = 0.03;
export const SIGN_BEFORE = 150;
const SIGN_OUT = 1.6;
const SIGN_POLE = 6.6;
const SIGN_POLE_HALF = 0.09;
const SIGN_SINK = 0.4;
const SIGN_RADIUS = 1.9;
const SIGN_BORDER = 0.2;
const SIGN_CENTRE = 5.2;
const SIGN_GLYPHS = [
  [
    [-0.46, -0.31],
    [0.37, -0.31],
    [0.37, 0.06],
    [0.37, 0.06],
  ],
  [
    [-0.53, -0.43],
    [0.53, -0.43],
    [0.53, -0.36],
    [-0.53, -0.36],
  ],
  [
    [0.09, 0.22],
    [0.27, 0.22],
    [0.27, 0.4],
    [0.09, 0.4],
  ],
] as const;
const BEACON_HEIGHT = 2.9;
const BEACON_HALF = 0.09;
export const BEACON_OUT = 0.3;
const BEACON_BACK = 0.35;
const BEACON_BAND = 0.4;
const LAMP_HALF = 0.17;
const LAMP_HEIGHT = 0.34;

export const buildChevrons = (ramp: Ramp, glow: Sheet): void => {
  const { track, jump } = ramp;
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

const diamond = (s: number, x: number, radius: number): Face => [
  [s, x, SIGN_CENTRE + radius],
  [s, x + radius, SIGN_CENTRE],
  [s, x, SIGN_CENTRE - radius],
  [s, x - radius, SIGN_CENTRE],
];

const buildSign = (
  ramp: Ramp,
  solid: Sheet,
  glow: Sheet,
  at: readonly [s: number, x: number]
): void => {
  const { track, facing } = ramp;
  const [s, x] = at;
  prism(
    ramp,
    solid,
    {
      across: [x - SIGN_POLE_HALF, x + SIGN_POLE_HALF],
      bottom: () => -SIGN_SINK,
      colour: POLE,
      span: [s - SIGN_POLE_HALF, s + SIGN_POLE_HALF],
      top: () => SIGN_POLE,
    },
    true
  );
  const face = s - SIGN_POLE_HALF - 0.02;
  quad(
    track,
    solid,
    diamond(face + 0.01, x, SIGN_RADIUS),
    SIGN_BACK,
    facing.ahead
  );
  quad(track, glow, diamond(face, x, SIGN_RADIUS), SIGN_INK, facing.back);
  quad(
    track,
    glow,
    diamond(face - 0.01, x, SIGN_RADIUS - SIGN_BORDER),
    SIGN_FACE,
    facing.back
  );
  const ink = face - 0.02;
  for (const glyph of SIGN_GLYPHS) {
    quad(
      track,
      glow,
      [
        [
          ink,
          x + glyph[0][0] * SIGN_RADIUS,
          SIGN_CENTRE + glyph[0][1] * SIGN_RADIUS,
        ],
        [
          ink,
          x + glyph[1][0] * SIGN_RADIUS,
          SIGN_CENTRE + glyph[1][1] * SIGN_RADIUS,
        ],
        [
          ink,
          x + glyph[2][0] * SIGN_RADIUS,
          SIGN_CENTRE + glyph[2][1] * SIGN_RADIUS,
        ],
        [
          ink,
          x + glyph[3][0] * SIGN_RADIUS,
          SIGN_CENTRE + glyph[3][1] * SIGN_RADIUS,
        ],
      ],
      SIGN_INK,
      facing.back
    );
  }
};

export const buildBeacon = (
  ramp: Ramp,
  x: number,
  materials: Materials
): THREE.Group => {
  const solid = emptySheet();
  const glow = emptySheet();
  const s = lipOf(ramp.jump) - BEACON_BACK;
  const span = [s - BEACON_HALF, s + BEACON_HALF] as const;
  const across = [x - BEACON_HALF, x + BEACON_HALF] as const;
  const bands = Math.ceil(BEACON_HEIGHT / BEACON_BAND);
  for (let band = 0; band < bands; band += 1) {
    const from = band * BEACON_BAND;
    const to = Math.min(BEACON_HEIGHT, from + BEACON_BAND);
    prism(
      ramp,
      solid,
      {
        across,
        bottom: () => from,
        colour: stripeOf(band, FASCIA),
        span,
        top: () => to,
      },
      true
    );
  }
  prism(
    ramp,
    glow,
    {
      across: [x - LAMP_HALF, x + LAMP_HALF],
      bottom: () => BEACON_HEIGHT,
      colour: LAMP,
      span: [s - LAMP_HALF, s + LAMP_HALF],
      top: () => BEACON_HEIGHT + LAMP_HEIGHT,
    },
    true
  );
  return meshesOf(solid, glow, materials);
};

export const buildWarning = (ramp: Ramp, materials: Materials): THREE.Group => {
  const solid = emptySheet();
  const glow = emptySheet();
  const { track, jump } = ramp;
  const side = Math.sign(jump.x) || 1;
  const s = jump.s - SIGN_BEFORE;
  const sign = { ...ramp, facing: facingAt(track, s, jump.x) };
  buildSign(sign, solid, glow, [s, side * (track.roadHalfWidth + SIGN_OUT)]);
  return freeze(meshesOf(solid, glow, materials));
};
