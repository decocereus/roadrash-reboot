import type { Random } from "@racer/track/random";
import * as THREE from "three";

import type { Look } from "./looks.ts";
import { FULL_TURN, sheet, textureOf } from "./texture-canvas.ts";

const SKY_WIDTH = 4096;
const SKY_HEIGHT = 2048;
const SKY_BAND = 0.5;
const CLOUD_PUFFS = [
  [-150, -10, 50],
  [-90, -48, 62],
  [-20, -86, 82],
  [60, -60, 70],
  [130, -30, 56],
  [190, -8, 38],
] as const;

const drawCloud = (
  context: CanvasRenderingContext2D,
  look: Look,
  place: readonly [number, number, number]
): void => {
  const [x, y, scale] = place;
  context.save();
  context.beginPath();
  context.rect(x - 260 * scale, y - 300 * scale, 520 * scale, 300 * scale);
  context.clip();
  const layers = [
    [look.clouds[2], 0, 0, 1.03],
    [look.clouds[1], 0, 0, 1],
    [look.clouds[0], -10, -16, 0.84],
  ] as const;
  for (const [colour, shiftX, shiftY, size] of layers) {
    context.fillStyle = colour;
    for (const [puffX, puffY, radius] of CLOUD_PUFFS) {
      context.beginPath();
      context.arc(
        x + (puffX + shiftX) * scale,
        y + (puffY + shiftY) * scale,
        radius * scale * size,
        0,
        FULL_TURN
      );
      context.fill();
    }
  }
  context.restore();
};

export const skyTexture = (
  random: Random,
  look: Look,
  sunAt: readonly [number, number]
): THREE.CanvasTexture => {
  const { canvas, context } = sheet(SKY_WIDTH, SKY_HEIGHT);
  const horizon = SKY_HEIGHT / 2;
  const bandTop = horizon * (1 - SKY_BAND);
  const [zenith] = look.sky;
  context.fillStyle = zenith?.[1] ?? "#000";
  context.fillRect(0, 0, SKY_WIDTH, SKY_HEIGHT);
  const fade = context.createLinearGradient(0, bandTop, 0, horizon);
  for (const [stop, colour] of look.sky) {
    fade.addColorStop(stop, colour);
  }
  context.fillStyle = fade;
  context.fillRect(0, bandTop, SKY_WIDTH, horizon - bandTop);
  context.fillStyle = look.fog;
  context.fillRect(0, horizon, SKY_WIDTH, horizon);
  const sunX = sunAt[0] * SKY_WIDTH;
  const sunY = sunAt[1] * SKY_HEIGHT;
  if (look.sun === null) {
    for (let star = 0; star < 1400; star += 1) {
      context.fillStyle = `rgba(255,255,255,${0.2 + random() * 0.7})`;
      context.fillRect(
        random() * SKY_WIDTH,
        random() * horizon * 0.9,
        1 + random() * 2,
        1 + random() * 2
      );
    }
    context.fillStyle = "#eef0ff";
    context.beginPath();
    context.arc(sunX, sunY, 44, 0, FULL_TURN);
    context.fill();
    context.fillStyle = look.sky[3]?.[1] ?? "#000";
    context.beginPath();
    context.arc(sunX + 22, sunY - 10, 40, 0, FULL_TURN);
    context.fill();
  } else {
    for (const shift of [-SKY_WIDTH, 0, SKY_WIDTH]) {
      const halo = context.createRadialGradient(
        sunX + shift,
        sunY,
        60,
        sunX + shift,
        sunY,
        260
      );
      halo.addColorStop(0, "rgba(255,240,150,.55)");
      halo.addColorStop(1, "rgba(255,240,150,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, SKY_WIDTH, horizon);
      context.fillStyle = look.sun;
      context.beginPath();
      context.arc(sunX + shift, sunY, 64, 0, FULL_TURN);
      context.fill();
    }
  }
  for (let cloud = 0; cloud < 16; cloud += 1) {
    drawCloud(context, look, [
      random() * SKY_WIDTH,
      bandTop + 90 + random() * (horizon - bandTop - 120),
      0.35 + random() * 0.7,
    ]);
  }
  for (let streak = 0; streak < 22; streak += 1) {
    const x = random() * SKY_WIDTH;
    const y = bandTop + 60 + random() * (horizon - bandTop - 80);
    const width = 160 + random() * 420;
    const height = 5 + random() * 9;
    context.fillStyle = look.clouds[streak % 2] ?? look.clouds[0];
    context.globalAlpha = 0.85;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width - height * 3, y + height);
    context.lineTo(x - height * 3, y + height);
    context.fill();
    context.globalAlpha = 1;
  }
  const texture = textureOf(canvas, false);
  texture.wrapS = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
};
