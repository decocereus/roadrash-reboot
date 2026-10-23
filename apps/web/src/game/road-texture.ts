import type { Random } from "@racer/track/random";
import type { Track } from "@racer/track/track";
import type * as THREE from "three";

import { CYAN, MAGENTA, YELLOW } from "./looks.ts";
import type { Look } from "./looks.ts";
import { FULL_TURN, pick, sheet, textureOf } from "./texture-canvas.ts";
import type { Lit } from "./texture-canvas.ts";

const ROAD_TILE = 1024;
export const ROAD_TILE_METRES = 24;
const ROAD_TEXELS = 512;
const ROAD_TEXELS_WIDE = 1024;
const ROAD_TEXELS_PER_METRE = ROAD_TILE / ROAD_TILE_METRES;
const DASH_METRES = 3;
const DASH_PERIOD_METRES = 8;

export const roadTexture = (random: Random, look: Look, track: Track): Lit => {
  const half = track.roadHalfWidth;
  const { laneWidth, lanesEachWay } = track.plan;
  const width = lanesEachWay > 1 ? ROAD_TEXELS_WIDE : ROAD_TEXELS;
  const density = width / ROAD_TEXELS;
  const { canvas, context } = sheet(width, ROAD_TILE);
  const light = sheet(width, ROAD_TILE);
  const across = (metres: number): number =>
    ((metres + half) / (half * 2)) * width;
  const scale = width / (half * 2);
  context.fillStyle = look.road;
  context.fillRect(0, 0, width, ROAD_TILE);
  for (let speck = 0; speck < 6000 * density; speck += 1) {
    context.fillStyle =
      random() < 0.5 ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.1)";
    context.fillRect(
      random() * width,
      random() * ROAD_TILE,
      1 + random() * 2,
      1 + random() * 3
    );
  }
  for (let patch = 0; patch < 5 * density; patch += 1) {
    context.fillStyle = "rgba(0,0,0,.07)";
    context.fillRect(
      random() * (width - 112),
      random() * 900,
      40 + random() * 70,
      60 + random() * 120
    );
  }
  context.strokeStyle = "rgba(0,0,0,.2)";
  context.lineWidth = 1.2;
  for (let crack = 0; crack < 4 * density; crack += 1) {
    context.beginPath();
    let x = random() * width;
    let y = random() * ROAD_TILE;
    context.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      x += (random() - 0.5) * 50;
      y += 20 + random() * 40;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  const paved = lanesEachWay * laneWidth;
  context.fillStyle = look.line;
  for (const edge of [-paved, paved]) {
    context.fillRect(across(edge) - 0.075 * scale, 0, 0.15 * scale, ROAD_TILE);
  }
  if (lanesEachWay > 1) {
    for (const divider of [-laneWidth, laneWidth]) {
      for (
        let start = 0;
        start < ROAD_TILE_METRES;
        start += DASH_PERIOD_METRES
      ) {
        context.fillRect(
          across(divider) - 0.06 * scale,
          start * ROAD_TEXELS_PER_METRE,
          0.12 * scale,
          DASH_METRES * ROAD_TEXELS_PER_METRE
        );
      }
    }
  }
  context.fillStyle = look.centre;
  for (const offset of [-0.17, 0.17]) {
    context.fillRect(
      across(offset) - 0.065 * scale,
      0,
      0.13 * scale,
      ROAD_TILE
    );
  }
  context.fillStyle = "rgba(0,0,0,.06)";
  for (const centre of [...track.oncomingLanes, ...track.sameWayLanes]) {
    context.fillRect(across(centre) - 0.5 * scale, 0, scale, ROAD_TILE);
  }
  light.context.fillStyle = "#000";
  light.context.fillRect(0, 0, width, ROAD_TILE);
  if (look.wet) {
    const bands = 16;
    for (let streak = 0; streak < 7; streak += 1) {
      const x = random() * width;
      const reach = (24 + random() * 40) * density;
      const phase = random() * FULL_TURN;
      const fade = light.context.createLinearGradient(
        x - reach,
        0,
        x + reach,
        0
      );
      const colour = pick(random, [MAGENTA, CYAN, YELLOW, look.lamp]);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.5, colour);
      fade.addColorStop(1, "rgba(0,0,0,0)");
      light.context.fillStyle = fade;
      for (let band = 0; band < bands; band += 1) {
        light.context.globalAlpha =
          0.16 + 0.14 * Math.sin((band / bands) * FULL_TURN + phase);
        light.context.fillRect(
          x - reach,
          (band / bands) * ROAD_TILE,
          reach * 2,
          ROAD_TILE / bands + 1
        );
      }
    }
    light.context.globalAlpha = 1;
  }
  const map = textureOf(canvas, true);
  map.anisotropy = 16;
  return { glow: textureOf(light.canvas, true), map };
};

export const paveTexture = (look: Look): THREE.CanvasTexture => {
  const { canvas, context } = sheet(128, 128);
  context.fillStyle = look.walk;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "rgba(0,0,0,.3)";
  context.lineWidth = 2;
  for (let line = 0; line <= 128; line += 32) {
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, 128);
    context.moveTo(0, line);
    context.lineTo(128, line);
    context.stroke();
  }
  return textureOf(canvas, true);
};
