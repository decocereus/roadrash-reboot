import type { Random } from "@racer/track/random";

import type { Look } from "./looks.ts";
import { pick, sheet, textureOf } from "./texture-canvas.ts";
import type { Lit } from "./texture-canvas.ts";

const SHADE = "rgba(40,10,60,";

const litWindow = (
  paint: CanvasRenderingContext2D,
  glow: CanvasRenderingContext2D,
  random: Random,
  look: Look,
  frame: readonly [number, number, number, number]
): void => {
  const [x, y, width, height] = frame;
  const colour = pick(random, look.litWindows);
  const kind = random();
  paint.fillStyle = colour;
  paint.fillRect(x, y, width, height);
  glow.fillStyle = colour;
  glow.fillRect(x, y, width, height);
  const dim = (
    left: number,
    top: number,
    wide: number,
    tall: number,
    alpha: number
  ) => {
    paint.fillStyle = `${SHADE}${alpha})`;
    paint.fillRect(left, top, wide, tall);
    glow.fillStyle = `rgba(0,0,0,${alpha + 0.15})`;
    glow.fillRect(left, top, wide, tall);
  };
  if (kind < 0.35) {
    dim(x, y, width, 6 + random() * 14, 0.4);
  } else if (kind < 0.6) {
    dim(x + (random() < 0.5 ? 0 : width * 0.55), y, width * 0.45, height, 0.35);
  } else if (kind < 0.8) {
    const person = x + 3 + random() * (width - 10);
    dim(person, y + height - 13, 6, 13, 0.6);
    dim(person + 0.5, y + height - 18, 5, 5, 0.6);
  }
};

const darkWindow = (
  paint: CanvasRenderingContext2D,
  look: Look,
  frame: readonly [number, number, number, number]
): void => {
  const [x, y, width, height] = frame;
  paint.fillStyle = look.dark;
  paint.fillRect(x, y, width, height);
  paint.fillStyle = look.glassTop;
  paint.globalAlpha = 0.34;
  paint.beginPath();
  paint.moveTo(x, y);
  paint.lineTo(x + width, y);
  paint.lineTo(x + width, y + height * 0.25);
  paint.lineTo(x, y + height * 0.7);
  paint.fill();
  paint.globalAlpha = 1;
};

export const facadeTexture = (
  random: Random,
  look: Look,
  wall: string,
  ribbon: boolean
): Lit => {
  const colour = sheet(512, 1024);
  const light = sheet(512, 1024);
  const paint = colour.context;
  const glow = light.context;
  paint.scale(2, 2);
  glow.scale(2, 2);
  paint.fillStyle = wall;
  paint.fillRect(0, 0, 256, 512);
  glow.fillStyle = "#000";
  glow.fillRect(0, 0, 256, 512);
  for (let patch = 0; patch < 26; patch += 1) {
    paint.fillStyle = random() < 0.5 ? `${SHADE}.06)` : "rgba(255,255,255,.05)";
    paint.fillRect(
      random() * 256,
      random() * 512,
      20 + random() * 80,
      3 + random() * 30
    );
  }
  for (let drip = 0; drip < 16; drip += 1) {
    const x = random() * 256;
    const y = random() * 512;
    const length = 30 + random() * 60;
    const fade = paint.createLinearGradient(0, y, 0, y + length);
    fade.addColorStop(0, `${SHADE}.2)`);
    fade.addColorStop(1, `${SHADE}0)`);
    paint.fillStyle = fade;
    paint.fillRect(x, y, 2 + random() * 5, length);
  }
  for (let floor = 0; floor < 10; floor += 1) {
    const top = floor * 51.2;
    paint.fillStyle = `${SHADE}.26)`;
    paint.fillRect(0, top + 48.6, 256, 2.6);
    paint.fillStyle = "rgba(255,255,255,.12)";
    paint.fillRect(0, top + 47.2, 256, 1.4);
    for (let bay = 0; bay < 8; bay += 1) {
      const x = ribbon ? bay * 32 + 1 : bay * 32 + 6;
      const width = ribbon ? 30 : 20;
      const y = top + 11;
      const height = ribbon ? 26 : 30;
      paint.fillStyle = `${SHADE}.55)`;
      paint.fillRect(x - 1.5, y - 1.5, width + 3, height + 3.5);
      if (random() < look.litShare) {
        litWindow(paint, glow, random, look, [x, y, width, height]);
      } else {
        darkWindow(paint, look, [x, y, width, height]);
      }
      paint.fillStyle = "rgba(30,8,46,.75)";
      glow.fillStyle = "#000";
      if (ribbon) {
        paint.fillRect(x + width - 1.2, y, 1.2, height);
        glow.fillRect(x + width - 1.2, y, 1.2, height);
      } else {
        paint.fillRect(x + width / 2 - 0.8, y, 1.6, height);
        glow.fillRect(x + width / 2 - 0.8, y, 1.6, height);
        paint.fillRect(x, y + height * 0.38, width, 1.2);
        glow.fillRect(x, y + height * 0.38, width, 1.2);
      }
      paint.fillStyle = "rgba(255,255,255,.2)";
      paint.fillRect(x - 2.5, y + height + 1.2, width + 5, 1.8);
    }
  }
  return {
    glow: textureOf(light.canvas, true),
    map: textureOf(colour.canvas, true),
  };
};
