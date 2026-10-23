import { lipOf } from "@racer/track/features";
import type * as THREE from "three";

import { prism, quad, UP } from "./ramp-geometry.ts";
import type { Lift, Ramp, Sheet } from "./ramp-geometry.ts";
import {
  ACCENT,
  DECK,
  FASCIA,
  GRIP,
  LIP_ACCENT,
  RAIL,
  stripeOf,
} from "./ramp-materials.ts";

export const DECK_ROWS = 16;
export const RAIL_WIDTH = 0.09;
const RAIL_HEIGHT = 0.13;
const GRIP_LIFT = 0.012;
const GRIP_LENGTH = 0.12;
const GRIP_INSET = 0.3;
const HAZARD_BAND = 1.4;
const HAZARD_BARS = 6;
const FASCIA_STRIPE = 1;
const ACCENT_WIDTH = 0.035;
const ACCENT_LIFT = 0.006;
const LIP_LINE = 0.07;

const deckStrip = (
  ramp: Ramp,
  sheet: Sheet,
  span: readonly [number, number],
  lift: number,
  colour: THREE.Color
): void => {
  const { track, heightOf } = ramp;
  const left = ramp.left + RAIL_WIDTH;
  const right = ramp.right - RAIL_WIDTH;
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

export const buildDeck = (ramp: Ramp, solid: Sheet): void => {
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
      stripeOf(index, FASCIA)
    );
  }
};

export const buildEdges = (ramp: Ramp, solid: Sheet): void => {
  const { jump, heightOf, underOf, left, right } = ramp;
  const railTop: Lift = (s) => heightOf(s) + RAIL_HEIGHT;
  const stripes = Math.ceil(jump.length / FASCIA_STRIPE);
  for (let index = 0; index < stripes; index += 1) {
    const span = [
      jump.s + (jump.length * index) / stripes,
      jump.s + (jump.length * (index + 1)) / stripes,
    ] as const;
    for (const edge of [
      [left, left + RAIL_WIDTH],
      [right - RAIL_WIDTH, right],
    ] as const) {
      prism(
        ramp,
        solid,
        {
          across: edge,
          bottom: underOf,
          colour: stripeOf(index, FASCIA),
          span,
          top: heightOf,
        },
        false
      );
      prism(
        ramp,
        solid,
        { across: edge, bottom: heightOf, colour: RAIL, span, top: railTop },
        index === 0 || index === stripes - 1
      );
    }
  }
};

export const buildAccents = (ramp: Ramp, glow: Sheet): void => {
  const { track, jump, heightOf, left, right } = ramp;
  const lift: Lift = (s) => heightOf(s) + RAIL_HEIGHT + ACCENT_LIFT;
  for (let row = 0; row < DECK_ROWS; row += 1) {
    const near = jump.s + (jump.length * row) / DECK_ROWS;
    const far = jump.s + (jump.length * (row + 1)) / DECK_ROWS;
    for (const [outer, inner] of [
      [left, left + ACCENT_WIDTH],
      [right, right - ACCENT_WIDTH],
    ] as const) {
      quad(
        track,
        glow,
        [
          [near, outer, lift(near)],
          [near, inner, lift(near)],
          [far, inner, lift(far)],
          [far, outer, lift(far)],
        ],
        ACCENT,
        UP
      );
    }
  }
  const lip = lipOf(jump);
  quad(
    track,
    glow,
    [
      [lip - LIP_LINE, left, heightOf(lip - LIP_LINE) + ACCENT_LIFT],
      [lip - LIP_LINE, right, heightOf(lip - LIP_LINE) + ACCENT_LIFT],
      [lip, right, heightOf(lip) + ACCENT_LIFT],
      [lip, left, heightOf(lip) + ACCENT_LIFT],
    ],
    LIP_ACCENT,
    UP
  );
};
