import { emptySupport, lipOf, supportAt } from "@racer/track/features";
import type { TrackFeature } from "@racer/track/features";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { freeze } from "./ground.ts";
import type { Stretch } from "./ground.ts";
import { CYAN, ORANGE, YELLOW } from "./looks.ts";

const DECK_ROWS = 16;
const PLATE = 0.14;
const RAIL_WIDTH = 0.09;
const RAIL_HEIGHT = 0.13;
const GROUND_RAIL = 0.12;
const POST_HALF = 0.06;
const POST_GAP = 2;
const POST_FROM = 0.22;
const BRACE = 0.07;
const BRACE_PROUD = 0.03;
const RECESS = 0.7;
const GRIP_LIFT = 0.012;
const GRIP_LENGTH = 0.12;
const GRIP_INSET = 0.3;
const HAZARD_BAND = 1.4;
const HAZARD_BARS = 6;
const LIP_STRIPES = 6;
const FASCIA_STRIPE = 1;
const SHADOW_LIFT = 0.02;
const SHADOW_SPREAD = 0.9;
const SHADOW_DARK = 0.55;
const SHADOW_AHEAD = 1.6;
const ACCENT_WIDTH = 0.035;
const ACCENT_LIFT = 0.006;
const ACCENT_GLOW = 0.85;
const LIP_GLOW = 1.4;
const LIP_LINE = 0.07;
const CHEVRON_GAPS = [12, 24, 36, 48, 60, 72] as const;
const CHEVRON_DEPTH = 1.8;
const CHEVRON_BAR = 0.45;
const CHEVRON_FLARE = 0.5;
const CHEVRON_GLOW = 1;
const DECAL_LIFT = 0.03;
const SIGN_BEFORE = 150;
const SIGN_OUT = 1.6;
const SIGN_POLE = 6.6;
const SIGN_POLE_HALF = 0.09;
const SIGN_SINK = 0.4;
const SIGN_RADIUS = 1.9;
const SIGN_BORDER = 0.2;
const SIGN_CENTRE = 5.2;
const SIGN_GLOW = 1.15;
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
const SHOWN_AFTER = 2;
const BEACON_HEIGHT = 2.9;
const BEACON_HALF = 0.09;
const BEACON_OUT = 0.3;
const BEACON_BACK = 0.35;
const BEACON_BAND = 0.4;
const LAMP_HALF = 0.17;
const LAMP_HEIGHT = 0.34;
const LAMP_GLOW = 2.4;
const BEACON_CLEARANCE = 3;
const DECK = new THREE.Color("#3a404c");
const GRIP = new THREE.Color("#717a8a");
const RAIL = new THREE.Color("#c3c9d4");
const FASCIA = new THREE.Color(YELLOW);
const FRAME = new THREE.Color("#7c8494");
const BRACE_COLOUR = new THREE.Color("#a5acba");
const VOID = new THREE.Color("#07080b");
const STRIPE_DARK = new THREE.Color("#15171a");
const POLE = new THREE.Color("#4a505c");
const SIGN_BACK = new THREE.Color("#5a606c");
const ACCENT = new THREE.Color(CYAN).multiplyScalar(ACCENT_GLOW);
const LIP_ACCENT = new THREE.Color(CYAN).multiplyScalar(LIP_GLOW);
const CHEVRON = new THREE.Color(YELLOW).multiplyScalar(CHEVRON_GLOW);
const SIGN_FACE = new THREE.Color(YELLOW).multiplyScalar(SIGN_GLOW);
const SIGN_INK = new THREE.Color("#050505");
const LAMP = new THREE.Color(ORANGE).multiplyScalar(LAMP_GLOW);
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

type Corner = readonly [s: number, x: number, lift: number];
type Face = readonly [Corner, Corner, Corner, Corner];
type Lift = (s: number) => number;

interface Sheet {
  readonly positions: number[];
  readonly colours: number[];
  readonly alphas: boolean;
}

export interface Ramps {
  readonly group: THREE.Group;
  readonly stretches: readonly Stretch[];
  readonly clearView: (eye: THREE.Vector3) => void;
}

interface Beacon {
  readonly object: THREE.Object3D;
  readonly foot: THREE.Vector3;
}

interface BuiltRamp {
  readonly body: THREE.Group;
  readonly beacons: readonly Beacon[];
}

interface Facing {
  readonly left: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly back: THREE.Vector3;
  readonly ahead: THREE.Vector3;
}

interface Ramp {
  readonly track: Track;
  readonly jump: TrackFeature;
  readonly heightOf: Lift;
  readonly underOf: Lift;
  readonly left: number;
  readonly right: number;
  readonly facing: Facing;
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
const ground: Lift = () => 0;

const emptySheet = (alphas = false): Sheet => ({
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
      paint(index);
    }
  }
};

const quad = (
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

const fadedQuad = (
  track: Track,
  sheet: Sheet,
  face: Face,
  alphas: readonly [number, number, number, number],
  outward: THREE.Vector3
): void => {
  shade(track, sheet, face, outward, (index) => {
    sheet.colours.push(0, 0, 0, alphas[index] ?? 0);
  });
};

const geometryOf = (sheet: Sheet): THREE.BufferGeometry => {
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

const facingAt = (track: Track, s: number, x: number): Facing => {
  const left = directionOf(track, [s, x + 1, 0], [s, x, 0]);
  const ahead = directionOf(track, [s, x, 0], [s + 1, x, 0]);
  return {
    ahead,
    back: ahead.clone().negate(),
    left,
    right: left.clone().negate(),
  };
};

const stripeOf = (index: number, light: THREE.Color): THREE.Color =>
  index % 2 === 0 ? light : STRIPE_DARK;

interface Prism {
  readonly span: readonly [near: number, far: number];
  readonly across: readonly [left: number, right: number];
  readonly bottom: Lift;
  readonly top: Lift;
  readonly colour: THREE.Color;
}

const prism = (ramp: Ramp, sheet: Sheet, beam: Prism, ends: boolean): void => {
  const { track, facing } = ramp;
  const [near, far] = beam.span;
  const [left, right] = beam.across;
  const { bottom, top, colour } = beam;
  quad(
    track,
    sheet,
    [
      [near, left, top(near)],
      [near, right, top(near)],
      [far, right, top(far)],
      [far, left, top(far)],
    ],
    colour,
    UP
  );
  for (const [x, outward] of [
    [left, facing.left],
    [right, facing.right],
  ] as const) {
    quad(
      track,
      sheet,
      [
        [near, x, bottom(near)],
        [far, x, bottom(far)],
        [far, x, top(far)],
        [near, x, top(near)],
      ],
      colour,
      outward
    );
  }
  if (!ends) {
    return;
  }
  for (const [s, outward] of [
    [near, facing.back],
    [far, facing.ahead],
  ] as const) {
    quad(
      track,
      sheet,
      [
        [s, left, bottom(s)],
        [s, right, bottom(s)],
        [s, right, top(s)],
        [s, left, top(s)],
      ],
      colour,
      outward
    );
  }
};

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
      stripeOf(index, FASCIA)
    );
  }
};

const buildEdges = (ramp: Ramp, solid: Sheet): void => {
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

const buildFrame = (ramp: Ramp, solid: Sheet): void => {
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

const buildVoid = (ramp: Ramp, solid: Sheet): void => {
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

const buildLip = (ramp: Ramp, solid: Sheet): void => {
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

const buildShadow = (ramp: Ramp, shadow: Sheet): void => {
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

const buildAccents = (ramp: Ramp, glow: Sheet): void => {
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

const buildChevrons = (ramp: Ramp, glow: Sheet): void => {
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

interface Materials {
  readonly cel: THREE.Material;
  readonly light: THREE.Material;
  readonly shade: THREE.Material;
}

const meshesOf = (
  solid: Sheet,
  glow: Sheet,
  materials: Materials
): THREE.Group => {
  const body = new THREE.Mesh(geometryOf(solid), materials.cel);
  body.castShadow = true;
  body.receiveShadow = true;
  const group = new THREE.Group();
  group.add(body, onFxLayer(new THREE.Mesh(geometryOf(glow), materials.light)));
  return group;
};

const rampOf = (track: Track, jump: TrackFeature, index: number): Ramp => {
  const heightOf: Lift = (s) => {
    supportAt(track, s, jump.x, support);
    return support.feature === index ? support.height : 0;
  };
  return {
    facing: facingAt(track, jump.s, jump.x),
    heightOf,
    jump,
    left: jump.x - jump.width / 2,
    right: jump.x + jump.width / 2,
    track,
    underOf: (s) => Math.max(0, heightOf(Math.min(s, lipOf(jump))) - PLATE),
  };
};

const buildBeacon = (ramp: Ramp, x: number, materials: Materials): Beacon => {
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
  const foot = new THREE.Vector3();
  place(ramp.track, [s, x, 0], foot);
  return { foot, object: meshesOf(solid, glow, materials) };
};

const buildRamp = (ramp: Ramp, materials: Materials): BuiltRamp => {
  const solid = emptySheet();
  const glow = emptySheet();
  const shadow = emptySheet(true);
  buildDeck(ramp, solid);
  buildEdges(ramp, solid);
  buildFrame(ramp, solid);
  buildVoid(ramp, solid);
  buildLip(ramp, solid);
  buildAccents(ramp, glow);
  buildChevrons(ramp, glow);
  buildShadow(ramp, shadow);
  const body = meshesOf(solid, glow, materials);
  body.add(onFxLayer(new THREE.Mesh(geometryOf(shadow), materials.shade)));
  const beacons = [ramp.left - BEACON_OUT, ramp.right + BEACON_OUT].map((x) =>
    buildBeacon(ramp, x, materials)
  );
  body.add(...beacons.map((beacon) => beacon.object));
  return { beacons, body: freeze(body) };
};

const buildWarning = (ramp: Ramp, materials: Materials): THREE.Group => {
  const solid = emptySheet();
  const glow = emptySheet();
  const { track, jump } = ramp;
  const side = Math.sign(jump.x) || 1;
  const s = jump.s - SIGN_BEFORE;
  const sign = { ...ramp, facing: facingAt(track, s, jump.x) };
  buildSign(sign, solid, glow, [s, side * (track.roadHalfWidth + SIGN_OUT)]);
  return freeze(meshesOf(solid, glow, materials));
};

const shadowMaterial = (): THREE.MeshBasicMaterial => {
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    transparent: true,
    vertexColors: true,
  });
  return material;
};

export function buildRamps(track: Track, shading: Shading): Ramps {
  const group = new THREE.Group();
  const stretches: Stretch[] = [];
  const beacons: Beacon[] = [];
  const clearView = (eye: THREE.Vector3): void => {
    for (const { object, foot } of beacons) {
      object.visible =
        Math.hypot(eye.x - foot.x, eye.z - foot.z) > BEACON_CLEARANCE;
    }
  };
  if (track.features.length === 0) {
    return { clearView, group, stretches };
  }
  const materials: Materials = {
    cel: shading.cel("#ffffff", { rim: 0, vertexColors: true }),
    light: shading.glowPaint(),
    shade: shadowMaterial(),
  };
  const firstChevron = Math.max(...CHEVRON_GAPS) + CHEVRON_DEPTH + CHEVRON_BAR;
  for (const [index, jump] of track.features.entries()) {
    const ramp = rampOf(track, jump, index);
    const { body, beacons: lit } = buildRamp(ramp, materials);
    beacons.push(...lit);
    const warning = buildWarning(ramp, materials);
    group.add(body, warning);
    stretches.push(
      {
        from: jump.s - firstChevron,
        object: body,
        to: lipOf(jump) + SHADOW_AHEAD + SHOWN_AFTER,
      },
      {
        from: jump.s - SIGN_BEFORE - 1,
        object: warning,
        to: jump.s - SIGN_BEFORE + 1,
      }
    );
  }
  return { clearView, group, stretches };
}
