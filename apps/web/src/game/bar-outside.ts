import { ROOM } from "@racer/sim/lobby-floor";
import { createRandom } from "@racer/track/random";
import type { Random } from "@racer/track/random";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { Shading } from "./cel.ts";
import { CYAN, MAGENTA, YELLOW } from "./looks.ts";
import type { Look } from "./looks.ts";
import { isMesh } from "./meshes.ts";
import { sheet, textureOf } from "./texture-canvas.ts";

const PLATE_WIDTH = 2048;
const PLATE_HEIGHT = 768;
const CITY_HEIGHT = 52;
const ROADWAY = "#3a2a52";
const ROAD_NEAR = new THREE.Color("#2c1c48");
const ROAD_FAR = new THREE.Color("#ff7f62");
const NIGHT_ROAD = new THREE.Color(0.34, 0.36, 0.9);
const DASH = "#f4e6cc";
const KERB = "#7a5a8a";
const FAR_LEFT = -170;
const FAR_BACK = -230;
const NEON_FONT = '800 italic 60px "Saira Extra Condensed", Impact, sans-serif';
const DUSK_BLOCKS = ["#5a3a78", "#6a4282", "#4e3270", "#724a88"] as const;
const TALL_SIGNS = [
  ["MOTO", MAGENTA, 0.2],
  ["ARCADE", CYAN, 0.39],
  ["HOTEL", CYAN, 0.62],
  ["NOODLE", YELLOW, 0.83],
] as const;

const paintBlock = (
  context: CanvasRenderingContext2D,
  random: Random,
  left: number,
  width: number,
  height: number,
  ground: number,
  wall: string,
  look: Look,
  litShare: number
): void => {
  const top = ground - height;
  context.fillStyle = wall;
  context.fillRect(left, top, width, height);
  const cell = 9 + Math.floor(random() * 4);
  for (let y = top + 12; y < ground - cell; y += cell + 7) {
    for (let x = left + 8; x < left + width - cell; x += cell + 6) {
      const lit = random() < litShare;
      const colour =
        random() < 0.85
          ? "#ffcf7a"
          : look.litWindows[Math.floor(random() * look.litWindows.length)];
      context.fillStyle = lit && colour !== undefined ? colour : "#2a1840";
      context.fillRect(x, y, cell, cell + 4);
    }
  }
};

const paintSky = (look: Look): THREE.CanvasTexture => {
  const { canvas, context } = sheet(16, 256);
  const sky = context.createLinearGradient(0, 0, 0, 256);
  for (const [stop, colour] of look.sky) {
    sky.addColorStop(stop, colour);
  }
  context.fillStyle = sky;
  context.fillRect(0, 0, 16, 256);
  return textureOf(canvas, false);
};

const paintCity = (
  look: Look,
  shadeWalls: readonly string[]
): THREE.CanvasTexture => {
  const { canvas, context } = sheet(PLATE_WIDTH, PLATE_HEIGHT);
  const ground = PLATE_HEIGHT;
  const random = createRandom(4817);
  let left = -20;
  while (left < PLATE_WIDTH) {
    const width = 70 + random() * 140;
    paintBlock(
      context,
      random,
      left,
      width,
      220 + random() * 280,
      ground,
      look.backdrop,
      look,
      look.litShare * 0.5
    );
    left += width;
  }
  left = -10;
  let wall = 0;
  while (left < PLATE_WIDTH) {
    const width = 130 + random() * 180;
    const colour = shadeWalls[wall % shadeWalls.length] ?? look.dark;
    paintBlock(
      context,
      random,
      left,
      width,
      90 + random() * 200,
      ground,
      colour,
      look,
      look.litShare
    );
    left += width;
    wall += 1;
  }
  for (const [label, colour, along] of TALL_SIGNS) {
    const x = along * PLATE_WIDTH;
    const height = 54 * label.length + 30;
    const y = ground - 40 - height;
    context.fillStyle = "#14081f";
    context.fillRect(x, y, 70, height);
    context.shadowColor = colour;
    context.shadowBlur = 16;
    context.strokeStyle = colour;
    context.lineWidth = 4;
    context.strokeRect(x + 5, y + 5, 60, height - 10);
    context.fillStyle = colour;
    context.font = NEON_FONT;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let letter = 0; letter < label.length; letter += 1) {
      context.fillText(label.charAt(letter), x + 35, y + 42 + letter * 54, 60);
    }
    context.shadowBlur = 0;
  }
  return textureOf(canvas, false);
};

const rainTexture = (): THREE.CanvasTexture => {
  const { canvas, context } = sheet(256, 512);
  const random = createRandom(991);
  context.fillStyle = "#000000";
  context.fillRect(0, 0, 256, 512);
  context.strokeStyle = "#7f94d8";
  context.lineWidth = 1.4;
  for (let drop = 0; drop < 120; drop += 1) {
    const x = random() * 256;
    const y = random() * 512;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 4, y + 18 + random() * 22);
    context.stroke();
  }
  const texture = textureOf(canvas, true);
  texture.repeat.set(7, 2.4);
  return texture;
};

export interface BarOutside {
  readonly group: THREE.Group;
  readonly setTime: (time: number) => void;
  readonly tick: (seconds: number) => void;
  readonly dispose: () => void;
}

const plateAt = (
  material: THREE.MeshBasicMaterial,
  position: THREE.Vector3Tuple,
  yaw: number,
  width: number,
  height: number
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(...position);
  mesh.rotation.y = yaw;
  return mesh;
};

const ground = (
  material: THREE.Material,
  x: number,
  z: number,
  width: number,
  depth: number,
  y: number
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.position.set(x, y, z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
};

const wetRoadMesh = (mesh: THREE.Mesh): THREE.Mesh => {
  const y = mesh.geometry.getAttribute("position");
  const colours = new Float32Array(y.count * 3);
  for (let vertex = 0; vertex < y.count; vertex += 1) {
    (y.getY(vertex) > 0 ? ROAD_FAR : ROAD_NEAR).toArray(colours, vertex * 3);
  }
  mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return mesh;
};

export const createOutside = (
  shading: Shading,
  dusk: Look,
  night: Look
): BarOutside => {
  const group = new THREE.Group();
  const duskPlate = paintCity(dusk, DUSK_BLOCKS);
  const nightPlate = paintCity(night, night.walls);
  const rain = rainTexture();
  const duskSky = paintSky(dusk);
  const nightSky = paintSky(night);
  const duskFace = new THREE.MeshBasicMaterial({
    alphaTest: 0.5,
    map: duskPlate,
  });
  const nightFace = new THREE.MeshBasicMaterial({
    alphaTest: 0.5,
    map: nightPlate,
    opacity: 0,
    transparent: true,
  });
  const duskAir = new THREE.MeshBasicMaterial({ map: duskSky });
  const nightAir = new THREE.MeshBasicMaterial({
    map: nightSky,
    opacity: 0,
    transparent: true,
  });
  const rainFace = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: rain,
    opacity: 0,
    transparent: true,
  });
  const street = shading.cel(ROADWAY);
  const walk = shading.cel(KERB);
  const dash = shading.cel(DASH);
  const wetRoad = new THREE.MeshBasicMaterial({ vertexColors: true });
  duskPlate.wrapS = THREE.RepeatWrapping;
  nightPlate.wrapS = THREE.RepeatWrapping;
  duskPlate.repeat.x = 3;
  nightPlate.repeat.x = 3;
  const skyYaw = Math.PI / 4;
  group.add(
    plateAt(duskAir, [-240, 100, -240], skyYaw, 2400, 240),
    plateAt(nightAir, [-240, 100, -240], skyYaw, 2400, 240),
    plateAt(
      duskFace,
      [FAR_LEFT, CITY_HEIGHT / 2, -120],
      Math.PI / 2,
      760,
      CITY_HEIGHT
    ),
    plateAt(
      nightFace,
      [FAR_LEFT, CITY_HEIGHT / 2, -120],
      Math.PI / 2,
      760,
      CITY_HEIGHT
    ),
    plateAt(duskFace, [100, CITY_HEIGHT / 2, FAR_BACK], 0, 760, CITY_HEIGHT),
    plateAt(nightFace, [100, CITY_HEIGHT / 2, FAR_BACK], 0, 760, CITY_HEIGHT)
  );
  group.add(
    ground(walk, ROOM.leftX - 2.5, -120, 5, 760, -0.12),
    ground(street, -130, -120, 230, 760, -0.2),
    wetRoadMesh(ground(wetRoad, 60, -130, 150, 240, -0.2))
  );
  const dashes: THREE.BufferGeometry[] = [];
  for (let z = -240; z < 60; z += 9) {
    for (const [x, along] of [
      [ROOM.leftX - 12, z],
      [ROOM.doorCentre, z - 14],
    ] as const) {
      dashes.push(
        new THREE.PlaneGeometry(0.3, 4)
          .rotateX(-Math.PI / 2)
          .translate(x, -0.18, along)
      );
    }
  }
  const merged = mergeGeometries(dashes);
  for (const part of dashes) {
    part.dispose();
  }
  group.add(new THREE.Mesh(merged, dash));
  const curtain = plateAt(
    rainFace,
    [ROOM.leftX - 0.3, 4.25, 1],
    Math.PI / 2,
    20,
    7.5
  );
  curtain.renderOrder = 2;
  group.add(curtain);
  return {
    dispose() {
      for (const item of [
        duskAir,
        duskFace,
        nightAir,
        nightFace,
        dash,
        rainFace,
        street,
        walk,
        wetRoad,
      ]) {
        item.dispose();
      }
      for (const item of [duskPlate, duskSky, nightPlate, nightSky, rain]) {
        item.dispose();
      }
      group.traverse((node) => {
        if (isMesh(node)) {
          node.geometry.dispose();
        }
      });
    },
    group,
    setTime(time) {
      nightFace.opacity = time;
      nightAir.opacity = time;
      rainFace.opacity = time * 0.55;
      wetRoad.color.setRGB(1, 1, 1).lerp(NIGHT_ROAD, time);
    },
    tick(seconds) {
      rain.offset.y += seconds * 1.6;
      rain.offset.y %= 1;
    },
  };
};
