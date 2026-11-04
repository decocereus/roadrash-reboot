import { ROOM } from "@racer/sim/lobby-floor";
import * as THREE from "three";

import { MAGENTA, CYAN, ORANGE, RED, YELLOW } from "./looks.ts";
import { FULL_TURN, sheet, textureOf } from "./texture-canvas.ts";

const SIGN_FONT = '"Saira Extra Condensed", Impact, sans-serif';
const ATLAS_SIZE = 2048;
const INK_PLATE = "#14081f";

const signIds = [
  "lowside",
  "garage",
  "bike",
  "tools",
  "tune",
  "hazard",
  "poster-a",
  "poster-b",
  "poster-c",
] as const;

type SignId = (typeof signIds)[number];

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const slots = {
  bike: { h: 256, w: 512, x: 0, y: 256 },
  garage: { h: 256, w: 768, x: 1024, y: 0 },
  hazard: { h: 128, w: 1024, x: 1024, y: 768 },
  lowside: { h: 256, w: 1024, x: 0, y: 0 },
  "poster-a": { h: 512, w: 384, x: 0, y: 1024 },
  "poster-b": { h: 512, w: 384, x: 384, y: 1024 },
  "poster-c": { h: 512, w: 384, x: 768, y: 1024 },
  tools: { h: 256, w: 512, x: 512, y: 256 },
  tune: { h: 256, w: 512, x: 1024, y: 256 },
} as const satisfies Record<SignId, Slot>;

interface SignFace {
  readonly slot: SignId;
  readonly at: readonly [number, number, number];
  readonly size: readonly [number, number];
  readonly yaw: number;
}

const neonText = (
  context: CanvasRenderingContext2D,
  slot: Slot,
  label: string,
  colour: string,
  frame: string
): void => {
  context.save();
  context.beginPath();
  context.rect(slot.x, slot.y, slot.w, slot.h);
  context.clip();
  context.fillStyle = INK_PLATE;
  context.fillRect(slot.x, slot.y, slot.w, slot.h);
  context.shadowColor = frame;
  context.shadowBlur = 26;
  context.strokeStyle = frame;
  context.lineWidth = 12;
  context.strokeRect(slot.x + 22, slot.y + 22, slot.w - 44, slot.h - 44);
  context.shadowColor = colour;
  context.shadowBlur = 30;
  context.fillStyle = colour;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `italic 800 ${slot.h * 0.62}px ${SIGN_FONT}`;
  context.fillText(
    label,
    slot.x + slot.w / 2,
    slot.y + slot.h / 2 + slot.h * 0.03,
    slot.w - 90
  );
  context.restore();
};

const hazardStrip = (
  context: CanvasRenderingContext2D,
  { h, w, x, y }: Slot
): void => {
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  context.fillStyle = "#17121f";
  context.fillRect(x, y, w, h);
  context.fillStyle = "#ffc21a";
  for (let stripe = -1; stripe < 12; stripe += 2) {
    const left = x + stripe * 96;
    context.beginPath();
    context.moveTo(left, y + h);
    context.lineTo(left + h, y);
    context.lineTo(left + h + 96, y);
    context.lineTo(left + 96, y + h);
    context.fill();
  }
  context.restore();
};

const poster = (
  context: CanvasRenderingContext2D,
  { h, w, x, y }: Slot,
  ground: string,
  ink: string,
  line: string,
  top: string
): void => {
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  context.fillStyle = ground;
  context.fillRect(x, y, w, h);
  context.fillStyle = ink;
  context.beginPath();
  context.arc(x + w / 2, y + h * 0.5, w * 0.34, 0, FULL_TURN);
  context.fill();
  context.fillRect(x, y + h * 0.72, w, h * 0.05);
  context.textAlign = "center";
  context.font = `italic 800 ${h * 0.16}px ${SIGN_FONT}`;
  context.fillText(top, x + w / 2, y + h * 0.2, w - 40);
  context.font = `800 ${h * 0.1}px ${SIGN_FONT}`;
  context.fillText(line, x + w / 2, y + h * 0.9, w - 40);
  context.restore();
};

export interface SignAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly uvOf: (id: SignId) => readonly [number, number, number, number];
}

export const createSignAtlas = (): SignAtlas => {
  const { canvas, context } = sheet(ATLAS_SIZE, ATLAS_SIZE);
  neonText(context, slots.lowside, "THE LOWSIDE", YELLOW, MAGENTA);
  neonText(context, slots.garage, "GARAGE", YELLOW, MAGENTA);
  neonText(context, slots.bike, "BIKE", CYAN, CYAN);
  neonText(context, slots.tools, "TOOLS", MAGENTA, MAGENTA);
  neonText(context, slots.tune, "TUNE", CYAN, CYAN);
  hazardStrip(context, slots.hazard);
  poster(context, slots["poster-a"], ORANGE, "#1a0a22", "BREAKWATER", "RUN");
  poster(context, slots["poster-b"], CYAN, "#14081f", "SLAG ROW", "RACE");
  poster(context, slots["poster-c"], RED, "#1a0a22", "RIDGE ROAD", "LOW");
  const texture = textureOf(canvas, false);
  return {
    texture,
    uvOf: (id) => {
      const { h, w, x, y } = slots[id];
      return [
        x / ATLAS_SIZE,
        1 - (y + h) / ATLAS_SIZE,
        (x + w) / ATLAS_SIZE,
        1 - y / ATLAS_SIZE,
      ];
    },
  };
};

const signFaces: readonly SignFace[] = [
  {
    at: [-0.5, 6.85, ROOM.backZ + 0.08],
    size: [10, 2.5],
    slot: "lowside",
    yaw: 0,
  },
  {
    at: [12.8, 3.12, -1.5],
    size: [2.5, 0.84],
    slot: "garage",
    yaw: -Math.PI / 2,
  },
  {
    at: [12.8, 3.05, 0.42],
    size: [1.1, 0.55],
    slot: "tune",
    yaw: -Math.PI / 2,
  },
  { at: [12.8, 3.1, -5.5], size: [1.3, 0.65], slot: "bike", yaw: -Math.PI / 2 },
  {
    at: [12.8, 2.3, -7.25],
    size: [1.3, 0.65],
    slot: "tools",
    yaw: -Math.PI / 2,
  },
  { at: [12.94, 1.9, 3], size: [1, 1.34], slot: "poster-a", yaw: -Math.PI / 2 },
  {
    at: [12.94, 1.9, 4.4],
    size: [1, 1.34],
    slot: "poster-b",
    yaw: -Math.PI / 2,
  },
  { at: [12.94, 1.9, 8], size: [1, 1.34], slot: "poster-c", yaw: -Math.PI / 2 },
  {
    at: [ROOM.doorCentre, 0.018, -8.6],
    size: [6.4, 0.7],
    slot: "hazard",
    yaw: 0,
  },
];

export const signGeometry = (uvOf: SignAtlas["uvOf"]): THREE.BufferGeometry => {
  const count = signFaces.length * 4;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices: number[] = [];
  const turn = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const up = new THREE.Vector3();
  const corners = [
    [-1, -1, 0, 0],
    [1, -1, 1, 0],
    [1, 1, 1, 1],
    [-1, 1, 0, 1],
  ] as const;
  let offset = 0;
  for (const face of signFaces) {
    const [u0, v0, u1, v1] = uvOf(face.slot);
    const flat = face.slot === "hazard";
    const [halfW, halfH] = [face.size[0] / 2, face.size[1] / 2];
    turn.set(Math.cos(face.yaw), 0, -Math.sin(face.yaw));
    up.set(0, flat ? 0 : 1, flat ? -1 : 0);
    let vertex = 0;
    for (const [sx, sy, u, v] of corners) {
      corner
        .set(...face.at)
        .addScaledVector(turn, sx * halfW)
        .addScaledVector(up, sy * halfH);
      corner.toArray(positions, (offset * 4 + vertex) * 3);
      uvs[(offset * 4 + vertex) * 2] = u === 0 ? u0 : u1;
      uvs[(offset * 4 + vertex) * 2 + 1] = v === 0 ? v0 : v1;
      vertex += 1;
    }
    const at = offset * 4;
    indices.push(at, at + 1, at + 2, at, at + 2, at + 3);
    offset += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export const countdownPlate = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The countdown needs a 2D canvas.");
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let shown = "";
  return {
    show(label: string): void {
      if (label === shown) {
        return;
      }
      shown = label;
      context.clearRect(0, 0, 1024, 512);
      context.fillStyle = "#1a0f2a";
      context.fillRect(0, 0, 1024, 512);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font =
        'italic 800 170px "Saira Extra Condensed", Impact, sans-serif';
      context.shadowColor = "#ff2bd6";
      context.shadowBlur = 26;
      context.fillStyle = "#ff5be0";
      context.fillText("NEXT RACE", 512, 130, 960);
      context.font =
        'italic 800 250px "Saira Extra Condensed", Impact, sans-serif';
      context.shadowColor = "#fff04a";
      context.fillStyle = "#fff04a";
      context.fillText(label, 512, 350);
      context.shadowBlur = 0;
      texture.needsUpdate = true;
    },
    texture,
  };
};
