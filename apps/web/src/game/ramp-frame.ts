import { lipOf } from "@racer/track/features";
import * as THREE from "three";

import { DECK_ROWS, RAIL_WIDTH } from "./ramp-deck.ts";
import { fadedQuad, prism, quad, UP } from "./ramp-geometry.ts";
import type { Lift, Ramp, Sheet } from "./ramp-geometry.ts";
import {
  BRACE_COLOUR,
  FASCIA,
  FRAME,
  stripeOf,
  VOID,
} from "./ramp-materials.ts";

const GROUND_RAIL = 0.12;
const POST_HALF = 0.06;
const POST_GAP = 2;
const POST_FROM = 0.22;
const BRACE = 0.07;
const BRACE_PROUD = 0.03;
const RECESS = 0.7;
const LIP_STRIPES = 6;
const SHADOW_LIFT = 0.02;
const SHADOW_SPREAD = 0.9;
const SHADOW_DARK = 0.55;
export const SHADOW_AHEAD = 1.6;
const DOWN = new THREE.Vector3(0, -1, 0);
const ground: Lift = () => 0;

export const buildFrame = (ramp: Ramp, solid: Sheet): void => {
  const { track, jump, heightOf, underOf, left, right, facing } = ramp;
  const lip = lipOf(jump);
  for (const edge of [
    [left, left + RAIL_WIDTH],
    [right - RAIL_WIDTH, right],
  ] as const) {
    prism(
      ramp,
      solid,
      {
        across: edge,
        bottom: ground,
        colour: FRAME,
        span: [jump.s, lip],
        top: (s) => Math.min(GROUND_RAIL, underOf(s)),
      },
      false
    );
  }
  const posts: number[] = [];
  for (let s = lip - POST_HALF; s > jump.s; s -= POST_GAP) {
    if (heightOf(s) > POST_FROM) {
      posts.push(s);
    }
  }
  for (const s of posts) {
    for (const x of [left + POST_HALF, right - POST_HALF]) {
      prism(
        ramp,
        solid,
        {
          across: [x - POST_HALF, x + POST_HALF],
          bottom: ground,
          colour: FRAME,
          span: [s - POST_HALF, s + POST_HALF],
          top: underOf,
        },
        true
      );
    }
  }
  for (let index = 1; index < posts.length; index += 1) {
    const far = posts[index - 1] ?? lip;
    const near = posts[index] ?? jump.s;
    for (const [x, outward] of [
      [left - BRACE_PROUD, facing.left],
      [right + BRACE_PROUD, facing.right],
    ] as const) {
      for (const [from, to] of [
        [near, far],
        [far, near],
      ] as const) {
        quad(
          track,
          solid,
          [
            [from, x, GROUND_RAIL],
            [from, x, GROUND_RAIL + BRACE],
            [to, x, underOf(to)],
            [to, x, underOf(to) - BRACE],
          ],
          BRACE_COLOUR,
          outward
        );
      }
    }
  }
};

export const buildVoid = (ramp: Ramp, solid: Sheet): void => {
  const { track, jump, underOf, left, right, facing } = ramp;
  const lip = lipOf(jump);
  const back = lip - RECESS;
  for (let row = 0; row < DECK_ROWS; row += 1) {
    const near = jump.s + (jump.length * row) / DECK_ROWS;
    const far = jump.s + (jump.length * (row + 1)) / DECK_ROWS;
    const wallEnd = Math.min(far, back);
    for (const outward of near < back ? [facing.left, facing.right] : []) {
      quad(
        track,
        solid,
        [
          [near, jump.x, 0],
          [wallEnd, jump.x, 0],
          [wallEnd, jump.x, underOf(wallEnd)],
          [near, jump.x, underOf(near)],
        ],
        VOID,
        outward
      );
    }
    quad(
      track,
      solid,
      [
        [near, left, underOf(near)],
        [near, right, underOf(near)],
        [far, right, underOf(far)],
        [far, left, underOf(far)],
      ],
      VOID,
      DOWN
    );
  }
  quad(
    track,
    solid,
    [
      [back, left, 0],
      [back, right, 0],
      [back, right, underOf(back)],
      [back, left, underOf(back)],
    ],
    VOID,
    facing.ahead
  );
};

export const buildLip = (ramp: Ramp, solid: Sheet): void => {
  const { track, jump, heightOf, underOf, left, right, facing } = ramp;
  const lip = lipOf(jump);
  const top = heightOf(lip);
  const under = underOf(lip);
  const stripe = (right - left) / LIP_STRIPES;
  for (let index = 0; index < LIP_STRIPES; index += 1) {
    const from = left + stripe * index;
    quad(
      track,
      solid,
      [
        [lip, from, under],
        [lip, from + stripe, under],
        [lip, from + stripe, top],
        [lip, from, top],
      ],
      stripeOf(index, FASCIA),
      facing.ahead
    );
  }
  for (const [from, to] of [
    [left + POST_HALF, right - POST_HALF],
    [right - POST_HALF, left + POST_HALF],
  ] as const) {
    quad(
      track,
      solid,
      [
        [lip + BRACE_PROUD, from, GROUND_RAIL],
        [lip + BRACE_PROUD, from, GROUND_RAIL + BRACE],
        [lip + BRACE_PROUD, to, under],
        [lip + BRACE_PROUD, to, under - BRACE],
      ],
      BRACE_COLOUR,
      facing.ahead
    );
  }
};

export const buildShadow = (ramp: Ramp, shadow: Sheet): void => {
  const { track, jump, heightOf, left, right } = ramp;
  const lip = lipOf(jump);
  const darkness = (s: number): number =>
    SHADOW_DARK *
    (0.25 + (0.75 * Math.min(heightOf(s), jump.rise)) / jump.rise);
  const reach = (s: number): number =>
    SHADOW_SPREAD * (0.3 + (0.7 * heightOf(s)) / jump.rise);
  const rows = DECK_ROWS + 1;
  for (let row = 0; row < rows; row += 1) {
    const near = jump.s + ((lip + SHADOW_AHEAD - jump.s) * row) / rows;
    const far = jump.s + ((lip + SHADOW_AHEAD - jump.s) * (row + 1)) / rows;
    const fade = (s: number): number =>
      s <= lip ? darkness(s) : darkness(lip) * (1 - (s - lip) / SHADOW_AHEAD);
    const [dNear, dFar] = [fade(near), fade(far)];
    const [rNear, rFar] = [
      reach(Math.min(near, lip)),
      reach(Math.min(far, lip)),
    ];
    fadedQuad(
      track,
      shadow,
      [
        [near, left, SHADOW_LIFT],
        [near, right, SHADOW_LIFT],
        [far, right, SHADOW_LIFT],
        [far, left, SHADOW_LIFT],
      ],
      [dNear, dNear, dFar, dFar],
      UP
    );
    for (const [edge, side] of [
      [left, -1],
      [right, 1],
    ] as const) {
      fadedQuad(
        track,
        shadow,
        [
          [near, edge, SHADOW_LIFT],
          [near, edge + side * rNear, SHADOW_LIFT],
          [far, edge + side * rFar, SHADOW_LIFT],
          [far, edge, SHADOW_LIFT],
        ],
        [dNear, 0, 0, dFar],
        UP
      );
    }
  }
};
