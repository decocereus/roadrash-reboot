import {
  crossLightOf,
  isSignalled,
  mainLightOf,
  signalPhaseAt,
} from "@racer/sim/signals";
import type { LightColour, SignalledCrossing } from "@racer/sim/signals";
import {
  ARM_LENGTH,
  armSidesOf,
  crossHalfWidthOf,
  ZEBRA_WIDTH,
  zebrasOf,
} from "@racer/track/crossings";
import type { ArmSide, CrossRoad, TrackCrossing } from "@racer/track/crossings";
import { roadHalfWidthAt } from "@racer/track/districts";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { extentOf } from "./clearance.ts";
import type { Clearance, Extent } from "./clearance.ts";
import { freeze } from "./ground.ts";
import type { Stretch } from "./ground.ts";
import { CYAN } from "./looks.ts";
import { isMesh } from "./meshes.ts";
import { emptySheet, facingAt, geometryOf, quad, UP } from "./road-sheet.ts";
import type { Sheet } from "./road-sheet.ts";
import { uploadSpan } from "./uploads.ts";

const STRIPE = 0.5;
const STRIPE_PITCH = 1;
const STOP_BAR = 0.5;
const DASH = 3;
const DASH_PITCH = 6;
const LINE = 0.15;
const MARK_LIFT = 0.012;
const POLE_OUT = 0.9;
const POLE_WIDTH = 0.18;
const MAST_HEIGHT = 5.6;
const ARM_TOP = 5.55;
const ARM_DEPTH = 0.14;
const HEAD_WIDTH = 0.42;
const HEAD_HEIGHT = 1.15;
const HEAD_DEPTH = 0.32;
const LAMP_SIZE = 0.26;
const CROSS_POLE_HEIGHT = 3.4;
const LED_WIDTH = 0.05;
const LED_FROM = 0.6;
const SHOWN_BEFORE = 420;
const SHOWN_AFTER = 40;

const POLE_COLOUR = new THREE.Color("#2a2f3a");
const HEAD_COLOUR = new THREE.Color("#101318");
const LENS_COLOUR = new THREE.Color("#262a30");
const LED = new THREE.Color(CYAN).multiplyScalar(1.2);
const lampGlow = {
  amber: "#ffb21e",
  green: "#2affb0",
  red: "#ff2a3a",
} as const satisfies Record<LightColour, string>;
const slotOrder: readonly LightColour[] = ["red", "amber", "green"];

interface Slots {
  readonly red: THREE.Vector3;
  readonly amber: THREE.Vector3;
  readonly green: THREE.Vector3;
}

type Span = readonly [from: number, to: number];
type Facing = ReturnType<typeof facingAt>;

interface Lamps {
  readonly red: readonly number[];
  readonly amber: readonly number[];
  readonly green: readonly number[];
}

interface Head {
  readonly crossing: SignalledCrossing;
  readonly reads: "main" | "cross";
  readonly lamps: Lamps;
  readonly from: number;
  readonly positions: THREE.BufferAttribute;
  readonly colours: THREE.BufferAttribute;
  shown: LightColour | null;
}

interface Signal {
  readonly post: Sheet;
  readonly overhead: Sheet;
  readonly glow: Sheet;
  readonly reads: Head["reads"];
  readonly slots: Slots;
  readonly outward: THREE.Vector3;
}

interface Placed {
  readonly signal: Signal;
  readonly solid: Span;
  readonly glow: Span;
  readonly lamp: Span;
}

export interface Junctions {
  readonly group: THREE.Group;
  readonly stretches: readonly Stretch[];
  readonly show: (tick: number) => void;
  readonly dispose: () => void;
}

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

const flat = (
  track: Track,
  sheet: Sheet,
  along: Span,
  across: Span,
  lift: number,
  colour: THREE.Color
): void => {
  const [near, far] = along;
  const [left, right] = across;
  quad(
    track,
    sheet,
    [
      [near, left, lift],
      [near, right, lift],
      [far, right, lift],
      [far, left, lift],
    ],
    colour,
    UP
  );
};

const box = (
  track: Track,
  sheet: Sheet,
  facing: Facing,
  along: Span,
  across: Span,
  height: Span,
  colour: THREE.Color
): void => {
  const [near, far] = along;
  const [left, right] = across;
  const [bottom, top] = height;
  flat(track, sheet, along, across, top, colour);
  for (const [x, outward] of [
    [left, facing.left],
    [right, facing.right],
  ] as const) {
    quad(
      track,
      sheet,
      [
        [near, x, bottom],
        [far, x, bottom],
        [far, x, top],
        [near, x, top],
      ],
      colour,
      outward
    );
  }
  for (const [s, outward] of [
    [near, facing.back],
    [far, facing.ahead],
  ] as const) {
    quad(
      track,
      sheet,
      [
        [s, left, bottom],
        [s, right, bottom],
        [s, right, top],
        [s, left, top],
      ],
      colour,
      outward
    );
  }
};

const around = (centre: number, half: number): Span => [
  centre - half,
  centre + half,
];

const markArms = (
  track: Track,
  marks: Sheet,
  crossing: TrackCrossing,
  road: CrossRoad,
  colours: { readonly road: THREE.Color; readonly line: THREE.Color }
): void => {
  const half = roadHalfWidthAt(track, crossing.s);
  const width = crossHalfWidthOf(road);
  for (const side of armSidesOf(road)) {
    const inner = side * half;
    const outer = side * (half + ARM_LENGTH);
    flat(
      track,
      marks,
      around(crossing.s, width),
      [Math.min(inner, outer), Math.max(inner, outer)],
      MARK_LIFT,
      colours.road
    );
    for (let x = half + 2; x + DASH < half + ARM_LENGTH; x += DASH_PITCH) {
      const ends = [side * x, side * (x + DASH)] as const;
      flat(
        track,
        marks,
        around(crossing.s, LINE / 2),
        [Math.min(...ends), Math.max(...ends)],
        MARK_LIFT * 2,
        colours.line
      );
    }
    const stopX = side * (half + 1.2);
    const inbound: Span =
      side > 0
        ? [crossing.s, crossing.s + width - 0.6]
        : [crossing.s - width + 0.6, crossing.s];
    flat(
      track,
      marks,
      inbound,
      around(stopX, STOP_BAR / 2),
      MARK_LIFT * 2,
      colours.line
    );
  }
};

const markRoad = (
  track: Track,
  marks: Sheet,
  crossing: TrackCrossing,
  line: THREE.Color
): void => {
  const half = roadHalfWidthAt(track, crossing.s) - 0.3;
  if (crossing.walk === "zebra") {
    for (const centre of zebrasOf(crossing)) {
      for (let x = -half; x + STRIPE <= half; x += STRIPE_PITCH) {
        flat(
          track,
          marks,
          around(centre, ZEBRA_WIDTH / 2),
          [x, x + STRIPE],
          MARK_LIFT,
          line
        );
      }
    }
  }
  if (crossing.lights) {
    flat(
      track,
      marks,
      around(crossing.s - crossing.stopGap, STOP_BAR / 2),
      [0.1, half],
      MARK_LIFT,
      line
    );
    flat(
      track,
      marks,
      around(crossing.s + crossing.stopGap, STOP_BAR / 2),
      [-half, -0.1],
      MARK_LIFT,
      line
    );
  }
};

const slotsOn = (
  track: Track,
  s: number,
  x: number,
  top: number,
  outward: THREE.Vector3
): Slots => {
  placeOnTrack(track, s, x, point);
  const base = new THREE.Vector3(point.x, point.y, point.z).addScaledVector(
    outward,
    0.01
  );
  const pitch = HEAD_HEIGHT / slotOrder.length;
  const at = (index: number): THREE.Vector3 =>
    base.clone().setY(base.y + top - pitch * (index + 0.5));
  return { amber: at(1), green: at(2), red: at(0) };
};

const lenses = (
  track: Track,
  sheet: Sheet,
  facing: Facing,
  face: { readonly s: number; readonly x: number },
  top: number,
  facesAlongRoad: boolean
): void => {
  const pitch = HEAD_HEIGHT / slotOrder.length;
  const thin = 0.02;
  const broad = LAMP_SIZE / 2 + 0.03;
  for (let index = 0; index < slotOrder.length; index += 1) {
    const middle = top - pitch * (index + 0.5);
    box(
      track,
      sheet,
      facing,
      around(face.s, facesAlongRoad ? thin : broad),
      around(face.x, facesAlongRoad ? broad : thin),
      around(middle, broad),
      LENS_COLOUR
    );
  }
};

const signalSheets = (): Pick<Signal, "glow" | "overhead" | "post"> => ({
  glow: emptySheet(),
  overhead: emptySheet(),
  post: emptySheet(),
});

const mainHead = (
  track: Track,
  crossing: SignalledCrossing,
  side: ArmSide
): Signal => {
  const sheets = signalSheets();
  const half = roadHalfWidthAt(track, crossing.s);
  const poleS = crossing.s - side * (crossing.stopGap + 0.3);
  const poleX = side * (half + POLE_OUT);
  const headX = side * half * 0.5;
  const facing = facingAt(track, poleS, poleX);
  const outward = side > 0 ? facing.back : facing.ahead;
  box(
    track,
    sheets.post,
    facing,
    around(poleS, POLE_WIDTH / 2),
    around(poleX, POLE_WIDTH / 2),
    [0, MAST_HEIGHT],
    POLE_COLOUR
  );
  box(
    track,
    sheets.glow,
    facing,
    around(poleS - side * (POLE_WIDTH / 2 + 0.005), LED_WIDTH / 2),
    around(poleX, LED_WIDTH / 2),
    [LED_FROM, MAST_HEIGHT - 0.2],
    LED
  );
  const armSpan = [Math.min(poleX, headX), Math.max(poleX, headX)] as const;
  box(
    track,
    sheets.overhead,
    facing,
    around(poleS, ARM_DEPTH / 2),
    [armSpan[0] - HEAD_WIDTH / 2, armSpan[1] + HEAD_WIDTH / 2],
    [ARM_TOP - ARM_DEPTH, ARM_TOP],
    POLE_COLOUR
  );
  const top = ARM_TOP - ARM_DEPTH;
  box(
    track,
    sheets.overhead,
    facing,
    around(poleS, HEAD_DEPTH / 2),
    around(headX, HEAD_WIDTH / 2),
    [top - HEAD_HEIGHT, top],
    HEAD_COLOUR
  );
  const faceS = poleS - side * (HEAD_DEPTH / 2 + 0.02);
  lenses(track, sheets.overhead, facing, { s: faceS, x: headX }, top, true);
  return {
    ...sheets,
    outward,
    reads: "main",
    slots: slotsOn(track, faceS - side * 0.02, headX, top, outward),
  };
};

const crossHead = (
  track: Track,
  crossing: SignalledCrossing,
  side: ArmSide
): Signal => {
  const sheets = signalSheets();
  const poleS = crossing.s + side * (crossing.boxHalfLength + POLE_OUT);
  const poleX = side * (roadHalfWidthAt(track, crossing.s) + 1.4);
  const facing = facingAt(track, poleS, poleX);
  const outward = side > 0 ? facing.right : facing.left;
  box(
    track,
    sheets.post,
    facing,
    around(poleS, POLE_WIDTH / 2),
    around(poleX, POLE_WIDTH / 2),
    [0, CROSS_POLE_HEIGHT],
    POLE_COLOUR
  );
  const top = CROSS_POLE_HEIGHT + HEAD_HEIGHT;
  box(
    track,
    sheets.post,
    facing,
    around(poleS, HEAD_WIDTH / 2),
    around(poleX, HEAD_DEPTH / 2),
    [CROSS_POLE_HEIGHT, top],
    HEAD_COLOUR
  );
  const faceX = poleX + side * (HEAD_DEPTH / 2 + 0.02);
  lenses(track, sheets.post, facing, { s: poleS, x: faceX }, top, false);
  return {
    ...sheets,
    outward,
    reads: "cross",
    slots: slotsOn(track, poleS, faceX + side * 0.02, top, outward),
  };
};

const signalsOf = (
  track: Track,
  crossing: SignalledCrossing
): readonly Signal[] => [
  ...([1, -1] as const).map((side) => mainHead(track, crossing, side)),
  ...(crossing.road
    ? armSidesOf(crossing.road).map((side) => crossHead(track, crossing, side))
    : []),
];

const nothing = (): void => undefined;

const IDENTITY = new THREE.Matrix4();
const LAMP_STRENGTH = 2.2;
const LAMP_CORNERS = [
  [-1, 1],
  [-1, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [1, 1],
] as const;
const LAMP_VERTICES = LAMP_CORNERS.length;
const lampColours = {
  amber: new THREE.Color(lampGlow.amber).multiplyScalar(LAMP_STRENGTH),
  green: new THREE.Color(lampGlow.green).multiplyScalar(LAMP_STRENGTH),
  red: new THREE.Color(lampGlow.red).multiplyScalar(LAMP_STRENGTH),
} as const satisfies Record<LightColour, THREE.Color>;
const placer = new THREE.Object3D();
const corner = new THREE.Vector3();

const colourFor = (head: Head, tick: number): LightColour => {
  const phase = signalPhaseAt(head.crossing, tick);
  return head.reads === "main" ? mainLightOf(phase) : crossLightOf(phase);
};

const vertexCount = (sheet: Sheet): number => sheet.positions.length / 3;

const append = (into: Sheet, from: Sheet): Span => {
  const start = vertexCount(into);
  into.positions.push(...from.positions);
  into.colours.push(...from.colours);
  return [start, vertexCount(into)];
};

const lampCorners = (at: THREE.Vector3, outward: THREE.Vector3): number[] => {
  placer.position.copy(at);
  placer.lookAt(corner.copy(at).add(outward));
  placer.updateMatrix();
  return LAMP_CORNERS.flatMap(([across, up]) => {
    corner
      .set((across * LAMP_SIZE) / 2, (up * LAMP_SIZE) / 2, 0)
      .applyMatrix4(placer.matrix);
    return [corner.x, corner.y, corner.z];
  });
};

const lampsOf = (signal: Signal): Lamps => ({
  amber: lampCorners(signal.slots.amber, signal.outward),
  green: lampCorners(signal.slots.green, signal.outward),
  red: lampCorners(signal.slots.red, signal.outward),
});

const extentOfPositions = (positions: readonly number[]): Extent => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  const extent = extentOf(geometry, IDENTITY);
  geometry.dispose();
  return extent;
};

const meshOf = (sheet: Sheet, material: THREE.Material): THREE.Mesh => {
  const geometry = geometryOf(sheet);
  geometry.setIndex(Array.from({ length: vertexCount(sheet) }, (_, at) => at));
  return new THREE.Mesh(geometry, material);
};

const indexOf = (mesh: THREE.Mesh): THREE.BufferAttribute => {
  const index = mesh.geometry.getIndex();
  if (!index) {
    throw new Error("A merged signal mesh has no index.");
  }
  return index;
};

const attributeOf = (
  mesh: THREE.Mesh,
  name: "position" | "color"
): THREE.BufferAttribute => {
  const attribute = mesh.geometry.getAttribute(name);
  if (!(attribute instanceof THREE.BufferAttribute)) {
    throw new TypeError(`A merged signal mesh has no plain ${name} buffer.`);
  }
  return attribute;
};

const light = (head: Head, colour: LightColour): void => {
  const lit = lampColours[colour];
  head.positions.array.set(head.lamps[colour], head.from * 3);
  for (let vertex = 0; vertex < LAMP_VERTICES; vertex += 1) {
    head.colours.setXYZ(head.from + vertex, lit.r, lit.g, lit.b);
  }
  uploadSpan(head.positions, head.from, head.from + LAMP_VERTICES);
  uploadSpan(head.colours, head.from, head.from + LAMP_VERTICES);
};

export const buildJunctions = (
  track: Track,
  shading: Shading,
  clearance: Clearance
): Junctions => {
  const group = new THREE.Group();
  const stretches: Stretch[] = [];
  const heads: Head[] = [];
  if (track.crossings.length === 0) {
    return { dispose: nothing, group, show: nothing, stretches };
  }
  const { look } = shading;
  const solidMaterial = shading.cel("#ffffff", { rim: 0, vertexColors: true });
  const glowMaterial = shading.glowPaint();
  const markMaterial = shading.cel("#ffffff", { rim: 0, vertexColors: true });
  markMaterial.polygonOffset = true;
  markMaterial.polygonOffsetFactor = -2;
  markMaterial.polygonOffsetUnits = -2;
  const colours = {
    line: new THREE.Color(look.line),
    road: new THREE.Color(look.road),
  };

  const placeSignals = (
    crossing: SignalledCrossing,
    assembly: THREE.Group
  ): void => {
    const solid = emptySheet();
    const glow = emptySheet();
    const placed: Placed[] = signalsOf(track, crossing).map((signal) => {
      const post = append(solid, signal.post);
      const overhead = append(solid, signal.overhead);
      const led = append(glow, signal.glow);
      const { red } = lampColours;
      const lamp = append(glow, {
        alphas: false,
        colours: LAMP_CORNERS.flatMap(() => [red.r, red.g, red.b]),
        positions: [...lampsOf(signal).red],
      });
      return {
        glow: [led[0], lamp[1]],
        lamp,
        signal,
        solid: [post[0], overhead[1]],
      };
    });
    const solidMesh = meshOf(solid, solidMaterial);
    solidMesh.castShadow = true;
    solidMesh.receiveShadow = true;
    const glowMesh = onFxLayer(meshOf(glow, glowMaterial));
    assembly.add(solidMesh, glowMesh);
    const positions = attributeOf(glowMesh, "position");
    const lit = attributeOf(glowMesh, "color");
    for (const { glow: glowSpan, lamp, signal, solid: solidSpan } of placed) {
      const lamps = lampsOf(signal);
      heads.push({
        colours: lit,
        crossing,
        from: lamp[0],
        lamps,
        positions,
        reads: signal.reads,
        shown: null,
      });
      clearance.addSpans(
        [
          { from: solidSpan[0], index: indexOf(solidMesh), to: solidSpan[1] },
          { from: glowSpan[0], index: indexOf(glowMesh), to: glowSpan[1] },
        ],
        [
          ...[signal.post, signal.overhead, signal.glow]
            .filter((sheet) => sheet.positions.length > 0)
            .map((sheet) => extentOfPositions(sheet.positions)),
          extentOfPositions(lamps.red),
        ]
      );
    }
  };

  for (const crossing of track.crossings) {
    const sheet = emptySheet();
    if (crossing.road) {
      markArms(track, sheet, crossing, crossing.road, colours);
    }
    markRoad(track, sheet, crossing, colours.line);
    const marks = new THREE.Mesh(geometryOf(sheet), markMaterial);
    marks.receiveShadow = true;
    const assembly = new THREE.Group().add(marks);
    if (isSignalled(crossing)) {
      placeSignals(crossing, assembly);
    }
    group.add(freeze(assembly));
    stretches.push({
      from: crossing.fromS - SHOWN_BEFORE,
      object: assembly,
      to: crossing.toS + SHOWN_AFTER,
    });
  }

  const owned: readonly THREE.Material[] = [
    solidMaterial,
    glowMaterial,
    markMaterial,
  ];

  return {
    dispose() {
      group.removeFromParent();
      group.traverse((node) => {
        if (isMesh(node)) {
          node.geometry.dispose();
        }
      });
      for (const material of owned) {
        material.dispose();
      }
    },
    group,
    show(tick) {
      for (const head of heads) {
        const colour = colourFor(head, tick);
        if (colour !== head.shown) {
          head.shown = colour;
          light(head, colour);
        }
      }
    },
    stretches,
  };
};
