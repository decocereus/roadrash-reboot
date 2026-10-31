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
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import type { Clearance } from "./clearance.ts";
import { freeze } from "./ground.ts";
import type { Stretch } from "./ground.ts";
import { CYAN } from "./looks.ts";
import { isMesh } from "./meshes.ts";
import { emptySheet, facingAt, geometryOf, quad, UP } from "./ramp-geometry.ts";
import type { Sheet } from "./ramp-geometry.ts";

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

interface Lamps {
  readonly red: THREE.MeshBasicMaterial;
  readonly amber: THREE.MeshBasicMaterial;
  readonly green: THREE.MeshBasicMaterial;
}

type Span = readonly [from: number, to: number];
type Facing = ReturnType<typeof facingAt>;

interface Head {
  readonly crossing: SignalledCrossing;
  readonly reads: "main" | "cross";
  readonly lamp: THREE.Mesh;
  readonly parent: THREE.Object3D;
  readonly slots: Slots;
  shown: LightColour | null;
}

export interface Junctions {
  readonly group: THREE.Group;
  readonly stretches: readonly Stretch[];
  readonly show: (tick: number) => void;
  readonly dispose: () => void;
}

interface Sheets {
  readonly solid: Sheet;
  readonly glow: Sheet;
  readonly marks: Sheet;
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
  const half = track.roadHalfWidth;
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
  const half = track.roadHalfWidth - 0.3;
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

const lampFor = (
  slots: Slots,
  outward: THREE.Vector3,
  geometry: THREE.BufferGeometry,
  material: THREE.Material
): THREE.Mesh => {
  const lamp = onFxLayer(new THREE.Mesh(geometry, material));
  lamp.position.copy(slots.red);
  lamp.lookAt(slots.red.clone().add(outward));
  return lamp;
};

const lenses = (
  track: Track,
  sheets: Sheets,
  facing: Facing,
  faceS: number,
  faceX: number,
  top: number,
  along: boolean
): void => {
  const pitch = HEAD_HEIGHT / slotOrder.length;
  for (let index = 0; index < slotOrder.length; index += 1) {
    const middle = top - pitch * (index + 0.5);
    const height = around(middle, LAMP_SIZE / 2 + 0.03);
    box(
      track,
      sheets.solid,
      facing,
      along ? around(faceS, 0.02) : around(faceS, LAMP_SIZE / 2 + 0.03),
      along ? around(faceX, LAMP_SIZE / 2 + 0.03) : around(faceX, 0.02),
      height,
      LENS_COLOUR
    );
  }
};

const mainHead = (
  track: Track,
  sheets: Sheets,
  crossing: SignalledCrossing,
  side: ArmSide,
  build: (
    head: Omit<Head, "lamp" | "parent" | "shown">,
    outward: THREE.Vector3
  ) => void
): void => {
  const half = track.roadHalfWidth;
  const poleS = crossing.s - side * (crossing.stopGap + 0.3);
  const poleX = side * (half + POLE_OUT);
  const headX = side * half * 0.5;
  const facing = facingAt(track, poleS, poleX);
  const outward = side > 0 ? facing.back : facing.ahead;
  box(
    track,
    sheets.solid,
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
    sheets.solid,
    facing,
    around(poleS, ARM_DEPTH / 2),
    [armSpan[0] - HEAD_WIDTH / 2, armSpan[1] + HEAD_WIDTH / 2],
    [ARM_TOP - ARM_DEPTH, ARM_TOP],
    POLE_COLOUR
  );
  const top = ARM_TOP - ARM_DEPTH;
  box(
    track,
    sheets.solid,
    facing,
    around(poleS, HEAD_DEPTH / 2),
    around(headX, HEAD_WIDTH / 2),
    [top - HEAD_HEIGHT, top],
    HEAD_COLOUR
  );
  const faceS = poleS - side * (HEAD_DEPTH / 2 + 0.02);
  lenses(track, sheets, facing, faceS, headX, top, false);
  build(
    {
      crossing,
      reads: "main",
      slots: slotsOn(track, faceS - side * 0.02, headX, top, outward),
    },
    outward
  );
};

const crossHead = (
  track: Track,
  sheets: Sheets,
  crossing: SignalledCrossing,
  side: ArmSide,
  build: (
    head: Omit<Head, "lamp" | "parent" | "shown">,
    outward: THREE.Vector3
  ) => void
): void => {
  const poleS = crossing.s + side * (crossing.boxHalfLength + POLE_OUT);
  const poleX = side * (track.roadHalfWidth + 1.4);
  const facing = facingAt(track, poleS, poleX);
  const outward = side > 0 ? facing.right : facing.left;
  box(
    track,
    sheets.solid,
    facing,
    around(poleS, POLE_WIDTH / 2),
    around(poleX, POLE_WIDTH / 2),
    [0, CROSS_POLE_HEIGHT],
    POLE_COLOUR
  );
  const top = CROSS_POLE_HEIGHT + HEAD_HEIGHT;
  box(
    track,
    sheets.solid,
    facing,
    around(poleS, HEAD_WIDTH / 2),
    around(poleX, HEAD_DEPTH / 2),
    [CROSS_POLE_HEIGHT, top],
    HEAD_COLOUR
  );
  const faceX = poleX + side * (HEAD_DEPTH / 2 + 0.02);
  lenses(track, sheets, facing, poleS, faceX, top, true);
  build(
    {
      crossing,
      reads: "cross",
      slots: slotsOn(track, poleS, faceX + side * 0.02, top, outward),
    },
    outward
  );
};

const nothing = (): void => undefined;

const colourFor = (head: Head, tick: number): LightColour => {
  const phase = signalPhaseAt(head.crossing, tick);
  return head.reads === "main" ? mainLightOf(phase) : crossLightOf(phase);
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
  const lampGeometry = new THREE.PlaneGeometry(LAMP_SIZE, LAMP_SIZE);
  const lamps: Lamps = {
    amber: shading.glow(lampGlow.amber, 2.2),
    green: shading.glow(lampGlow.green, 2.2),
    red: shading.glow(lampGlow.red, 2.2),
  };
  const colours = {
    line: new THREE.Color(look.line),
    road: new THREE.Color(look.road),
  };

  for (const crossing of track.crossings) {
    const sheets: Sheets = {
      glow: emptySheet(),
      marks: emptySheet(),
      solid: emptySheet(),
    };
    const assembly = new THREE.Group();
    const build = (
      head: Omit<Head, "lamp" | "parent" | "shown">,
      outward: THREE.Vector3
    ): void => {
      const lamp = lampFor(head.slots, outward, lampGeometry, lamps.red);
      assembly.add(lamp);
      heads.push({ ...head, lamp, parent: assembly, shown: null });
    };
    if (crossing.road) {
      markArms(track, sheets.marks, crossing, crossing.road, colours);
    }
    markRoad(track, sheets.marks, crossing, colours.line);
    if (isSignalled(crossing)) {
      for (const side of [1, -1] as const) {
        mainHead(track, sheets, crossing, side, build);
      }
      if (crossing.road) {
        for (const side of armSidesOf(crossing.road)) {
          crossHead(track, sheets, crossing, side, build);
        }
      }
    }
    const marks = new THREE.Mesh(geometryOf(sheets.marks), markMaterial);
    marks.receiveShadow = true;
    assembly.add(marks);
    if (sheets.solid.positions.length > 0) {
      const solid = new THREE.Mesh(geometryOf(sheets.solid), solidMaterial);
      solid.castShadow = true;
      solid.receiveShadow = true;
      const glow = onFxLayer(
        new THREE.Mesh(geometryOf(sheets.glow), glowMaterial)
      );
      assembly.add(solid, glow);
      clearance.addObject(solid);
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
    ...slotOrder.map((colour) => lamps[colour]),
  ];

  return {
    dispose() {
      group.removeFromParent();
      group.traverse((node) => {
        if (isMesh(node) && node.geometry !== lampGeometry) {
          node.geometry.dispose();
        }
      });
      lampGeometry.dispose();
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
          head.lamp.material = lamps[colour];
          head.lamp.position.copy(head.slots[colour]);
          head.lamp.updateMatrix();
          head.lamp.matrixWorld.multiplyMatrices(
            head.parent.matrixWorld,
            head.lamp.matrix
          );
        }
      }
    },
    stretches,
  };
};
