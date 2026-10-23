import type { Random } from "@racer/track/random";

import { CYAN, MAGENTA, ORANGE, RED, YELLOW } from "./looks.ts";
import type { Look } from "./looks.ts";
import { FULL_TURN, pick, sheet, textureOf } from "./texture-canvas.ts";
import type { Lit } from "./texture-canvas.ts";

export const SHOP_FONT = '800 44px "Saira Extra Condensed", Impact, sans-serif';

const SHOP_NAMES = [
  "RAMEN",
  "MOTO",
  "24H",
  "BAR",
  "PARTS",
  "NOODLE",
  "TEA",
  "PAWN",
  "ARCADE",
  "TATTOO",
  "CLINIC",
  "SYNTH",
  "KIOSK",
  "VINYL",
] as const;

const SHOP_TOP = 72;
const SHOP_BOTTOM = 262;
const SHOP_FRAME = "#150b20";

type Both = (
  draw: (context: CanvasRenderingContext2D, glowing: boolean) => void
) => void;

const silhouette = (glowing: boolean): string =>
  glowing ? "rgba(0,0,0,.72)" : "rgba(64,22,50,.78)";

const shelves = (
  both: Both,
  paint: CanvasRenderingContext2D,
  glow: CanvasRenderingContext2D,
  random: Random,
  frame: readonly [number, number]
): void => {
  const [left, width] = frame;
  for (let row = 0; row < 3; row += 1) {
    const y = SHOP_TOP + 50 + row * 44;
    both((context, glowing) => {
      context.fillStyle = silhouette(glowing);
      context.fillRect(left + 6, y, width - 12, 4);
    });
    for (let item = 0; item < 7; item += 1) {
      const wide = 8 + random() * 12;
      const tall = 10 + random() * 24;
      const x = left + 10 + item * 20 + random() * 4;
      paint.fillStyle =
        random() < 0.3
          ? pick(random, [MAGENTA, CYAN, RED, "#4a1a4a"])
          : "rgba(70,24,50,.65)";
      paint.fillRect(x, y - tall, wide, tall);
      glow.fillStyle = "rgba(0,0,0,.5)";
      glow.fillRect(x, y - tall, wide, tall);
    }
  }
};

const counter = (
  both: Both,
  random: Random,
  frame: readonly [number, number, number]
): void => {
  const [left, width, height] = frame;
  const seats = [0, 1, 2]
    .map((seat) => left + 28 + seat * 48 + random() * 10)
    .filter(() => random() < 0.8);
  both((context, glowing) => {
    context.fillStyle = silhouette(glowing);
    context.fillRect(left + 5, SHOP_TOP + 110, width - 10, height - 112);
    for (const seat of seats) {
      context.beginPath();
      context.arc(seat, SHOP_TOP + 68, 10, 0, FULL_TURN);
      context.fill();
      context.fillRect(seat - 13, SHOP_TOP + 80, 26, 32);
    }
    for (let lamp = 0; lamp < 3; lamp += 1) {
      context.fillRect(left + 39 + lamp * 40, SHOP_TOP, 2, 22);
    }
  });
  both((context) => {
    context.fillStyle = "#fff8dc";
    for (let lamp = 0; lamp < 3; lamp += 1) {
      context.beginPath();
      context.arc(left + 40 + lamp * 40, SHOP_TOP + 27, 8, 0, FULL_TURN);
      context.fill();
    }
  });
};

const posters = (both: Both, random: Random, left: number): void => {
  for (let poster = 0; poster < 3; poster += 1) {
    const colour = pick(random, [MAGENTA, CYAN, RED, YELLOW, ORANGE]);
    const x = left + 10 + poster * 49;
    const tall = 96 + random() * 50;
    both((context, glowing) => {
      context.fillStyle = colour;
      context.globalAlpha = glowing ? 0.7 : 1;
      context.fillRect(x, SHOP_TOP + 16, 42, tall);
      context.globalAlpha = 1;
      context.fillStyle = silhouette(glowing);
      context.fillRect(x + 6, SHOP_TOP + 16 + tall * 0.58, 30, 5);
      context.fillRect(x + 6, SHOP_TOP + 16 + tall * 0.72, 20, 5);
      context.beginPath();
      context.arc(x + 21, SHOP_TOP + 16 + tall * 0.28, 11, 0, FULL_TURN);
      context.fill();
    });
  }
};

const shutter = (
  paint: CanvasRenderingContext2D,
  random: Random,
  left: number
): void => {
  paint.fillStyle = "#54486a";
  paint.fillRect(left + 14, SHOP_TOP, 228, SHOP_BOTTOM - SHOP_TOP);
  paint.fillStyle = "rgba(0,0,0,.32)";
  for (let y = SHOP_TOP; y < SHOP_BOTTOM; y += 9) {
    paint.fillRect(left + 14, y, 228, 3);
  }
  paint.strokeStyle = pick(random, [MAGENTA, CYAN, YELLOW]);
  paint.globalAlpha = 0.55;
  paint.lineWidth = 5;
  paint.lineJoin = "round";
  paint.beginPath();
  let x = left + 40 + random() * 50;
  let y = SHOP_TOP + 70 + random() * 50;
  paint.moveTo(x, y);
  for (let stroke = 0; stroke < 6; stroke += 1) {
    x += 12 + random() * 18;
    y += (random() - 0.5) * 80;
    paint.lineTo(x, Math.max(SHOP_TOP + 12, Math.min(SHOP_BOTTOM - 12, y)));
  }
  paint.stroke();
  paint.globalAlpha = 1;
};

const glazedBay = (
  both: Both,
  paint: CanvasRenderingContext2D,
  glow: CanvasRenderingContext2D,
  random: Random,
  look: Look,
  bay: readonly [number, boolean, string]
): void => {
  const [left, lit, warm] = bay;
  const doorRight = random() < 0.5;
  const door = left + (doorRight ? 176 : 14);
  const pane = left + (doorRight ? 14 : 84);
  const width = 158;
  const height = SHOP_BOTTOM - SHOP_TOP - 24;
  const base = lit ? warm : look.dark;
  paint.fillStyle = base;
  paint.fillRect(pane, SHOP_TOP, width, height);
  paint.fillRect(door, SHOP_TOP, 66, SHOP_BOTTOM - SHOP_TOP);
  if (lit) {
    glow.globalAlpha = 0.5;
    glow.fillStyle = base;
    glow.fillRect(pane, SHOP_TOP, width, height);
    glow.fillRect(door, SHOP_TOP, 66, SHOP_BOTTOM - SHOP_TOP);
    glow.globalAlpha = 1;
    const kind = random();
    if (kind < 0.42) {
      shelves(both, paint, glow, random, [pane, width]);
    } else if (kind < 0.74) {
      counter(both, random, [pane, width, height]);
    } else {
      posters(both, random, pane);
    }
    if (random() < 0.55) {
      const person = door + 24 + random() * 14;
      both((context, glowing) => {
        context.fillStyle = silhouette(glowing);
        context.beginPath();
        context.arc(person, SHOP_TOP + 62, 11, 0, FULL_TURN);
        context.fill();
        context.fillRect(person - 15, SHOP_TOP + 74, 30, 120);
      });
    }
  } else {
    paint.fillStyle = look.glassTop;
    paint.globalAlpha = 0.3;
    paint.beginPath();
    paint.moveTo(pane, SHOP_TOP);
    paint.lineTo(pane + width, SHOP_TOP);
    paint.lineTo(pane + width, SHOP_TOP + height * 0.2);
    paint.lineTo(pane, SHOP_TOP + height * 0.75);
    paint.fill();
    paint.globalAlpha = 1;
  }
  both((context, glowing) => {
    context.strokeStyle = glowing ? "#000" : SHOP_FRAME;
    context.fillStyle = glowing ? "#000" : SHOP_FRAME;
    context.lineWidth = 5;
    context.strokeRect(
      door + 2.5,
      SHOP_TOP + 2.5,
      61,
      SHOP_BOTTOM - SHOP_TOP - 5
    );
    context.strokeRect(pane + 2.5, SHOP_TOP + 2.5, width - 5, height - 5);
    context.fillRect(pane + width / 2 - 2, SHOP_TOP, 4, height);
    context.fillRect(door + 49, SHOP_TOP + 92, 5, 30);
    context.fillRect(door, SHOP_TOP + 34, 66, 4);
  });
  paint.fillStyle = "#3a2c4c";
  paint.fillRect(pane, SHOP_TOP + height, width, 24);
};

export const shopTexture = (random: Random, look: Look): Lit => {
  const colourSheet = sheet(1024, 288);
  const light = sheet(1024, 288);
  const paint = colourSheet.context;
  const glow = light.context;
  paint.fillStyle = look.dark;
  paint.fillRect(0, 0, 1024, 288);
  glow.fillStyle = "#000";
  glow.fillRect(0, 0, 1024, 288);
  const both: Both = (draw) => {
    draw(paint, false);
    draw(glow, true);
  };
  for (let bay = 0; bay < 4; bay += 1) {
    const left = bay * 256;
    const lit = random() < 0.5;
    const colour = pick(random, [MAGENTA, CYAN, YELLOW, ORANGE, "#ffe6b0"]);
    const warm = pick(random, ["#ffc45a", "#ffd88a", "#ffb44a", colour]);
    const name = pick(random, SHOP_NAMES);
    paint.fillStyle = "rgba(0,0,0,.35)";
    paint.fillRect(left, 0, 10, 288);
    paint.fillRect(left + 246, 0, 10, 288);
    paint.fillStyle = SHOP_FRAME;
    paint.fillRect(left + 10, 8, 236, 54);
    both((context, glowing) => {
      context.font = SHOP_FONT;
      context.textAlign = "center";
      context.textBaseline = "middle";
      if (lit) {
        context.fillStyle = colour;
        context.strokeStyle = colour;
        context.lineWidth = 3;
        context.fillText(name, left + 128, 37);
        context.strokeRect(left + 15, 13, 226, 44);
      } else if (!glowing) {
        context.fillStyle = "rgba(255,255,255,.22)";
        context.fillText(name, left + 128, 37);
      }
    });
    if (!lit && random() < 0.55) {
      shutter(paint, random, left);
    } else {
      glazedBay(both, paint, glow, random, look, [left, lit, warm]);
    }
  }
  paint.fillStyle = "rgba(0,0,0,.38)";
  paint.fillRect(0, SHOP_BOTTOM, 1024, 288 - SHOP_BOTTOM);
  return {
    glow: textureOf(light.canvas, true),
    map: textureOf(colourSheet.canvas, true),
  };
};
