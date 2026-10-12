import type { Random } from "@racer/track/random";
import * as THREE from "three";

import { CYAN, MAGENTA, ORANGE, RED, YELLOW } from "./looks.ts";
import type { Look } from "./looks.ts";

const FONT = '800 104px "Saira Extra Condensed", Impact, sans-serif';
const SHOP_FONT = '800 44px "Saira Extra Condensed", Impact, sans-serif';
const FULL_TURN = Math.PI * 2;

export const SIGN_WORDS = [
  "VOLT",
  "KIRO",
  "HALDEN",
  "MOTO",
  "RX",
  "ARCADE",
  "HOTEL",
  "SYNTH",
  "NOODLE",
  "24H",
  "DOCK 9",
  "OZU",
  "BAR",
  "TAXI",
] as const;

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

const SIGN_COLOURS = [MAGENTA, CYAN, YELLOW, ORANGE] as const;

interface Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

const sheet = (width: number, height: number): Sheet => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("A texture needs a 2D canvas.");
  }
  return { canvas, context };
};

const textureOf = (
  canvas: HTMLCanvasElement,
  repeat: boolean
): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
};

export const pick = <Item>(random: Random, items: readonly Item[]): Item => {
  const item = items[Math.floor(random() * items.length)] ?? items[0];
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list.");
  }
  return item;
};

export interface Lit {
  readonly map: THREE.CanvasTexture;
  readonly glow: THREE.CanvasTexture;
}

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
  const colour = sheet(1024, 288);
  const light = sheet(1024, 288);
  const paint = colour.context;
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
    map: textureOf(colour.canvas, true),
  };
};

export interface SignFrame {
  readonly u: number;
  readonly v: number;
  readonly wide: number;
  readonly tall: number;
  readonly ratio: number;
  readonly colour: string;
  readonly letters: number;
}

export interface SignAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly upright: readonly SignFrame[];
  readonly flat: readonly SignFrame[];
}

const ATLAS_SIZE = 2048;
const UPRIGHT_WIDTH = 128;
const LETTER_HEIGHT = 104;
const FLAT_HEIGHT = 160;

const drawSign = (
  context: CanvasRenderingContext2D,
  box: readonly [number, number, number, number],
  text: string,
  colour: string,
  upright: boolean
): void => {
  const [left, top, width, height] = box;
  context.save();
  context.translate(left, top);
  context.fillStyle = "#0b0612";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = colour;
  context.lineWidth = 8;
  context.strokeRect(8, 8, width - 16, height - 16);
  context.font = FONT;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const write = () => {
    if (upright) {
      for (const [index, letter] of [...text].entries()) {
        context.fillText(letter, 64, 76 + index * LETTER_HEIGHT);
      }
    } else {
      context.fillText(text, width / 2, 86);
    }
  };
  context.shadowColor = colour;
  context.shadowBlur = 18;
  context.fillStyle = colour;
  write();
  context.shadowBlur = 0;
  context.globalAlpha = 0.55;
  context.fillStyle = "#fff";
  write();
  context.restore();
};

export const signAtlas = (random: Random): SignAtlas => {
  const { canvas, context } = sheet(ATLAS_SIZE, ATLAS_SIZE);
  const upright: SignFrame[] = [];
  const flat: SignFrame[] = [];
  const frameOf = (
    box: readonly [number, number, number, number],
    colour: string,
    letters: number
  ): SignFrame => ({
    colour,
    letters,
    ratio: box[2] / box[3],
    tall: box[3] / ATLAS_SIZE,
    u: box[0] / ATLAS_SIZE,
    v: 1 - (box[1] + box[3]) / ATLAS_SIZE,
    wide: box[2] / ATLAS_SIZE,
  });
  for (const [index, word] of SIGN_WORDS.entries()) {
    const colour = pick(random, SIGN_COLOURS);
    const height = word.length * LETTER_HEIGHT + 40;
    const box = [
      index * (UPRIGHT_WIDTH + 12),
      0,
      UPRIGHT_WIDTH,
      height,
    ] as const;
    drawSign(context, box, word, colour, true);
    upright.push(frameOf(box, colour, word.length));
  }
  let left = 0;
  let top = 700;
  for (const word of SIGN_WORDS) {
    const colour = pick(random, SIGN_COLOURS);
    const width = word.length * 70 + 80;
    if (left + width > ATLAS_SIZE) {
      left = 0;
      top += FLAT_HEIGHT + 12;
    }
    const box = [left, top, width, FLAT_HEIGHT] as const;
    drawSign(context, box, word, colour, false);
    flat.push(frameOf(box, colour, word.length));
    left += width + 12;
  }
  return { flat, texture: textureOf(canvas, false), upright };
};

const ROAD_TILE = 1024;
export const ROAD_TILE_METRES = 24;

export const roadTexture = (
  random: Random,
  look: Look,
  lane: number,
  half: number
): Lit => {
  const { canvas, context } = sheet(512, ROAD_TILE);
  const light = sheet(512, ROAD_TILE);
  const across = (metres: number): number =>
    ((metres + half) / (half * 2)) * 512;
  const scale = 512 / (half * 2);
  context.fillStyle = look.road;
  context.fillRect(0, 0, 512, ROAD_TILE);
  for (let speck = 0; speck < 6000; speck += 1) {
    context.fillStyle =
      random() < 0.5 ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.1)";
    context.fillRect(
      random() * 512,
      random() * ROAD_TILE,
      1 + random() * 2,
      1 + random() * 3
    );
  }
  for (let patch = 0; patch < 5; patch += 1) {
    context.fillStyle = "rgba(0,0,0,.07)";
    context.fillRect(
      random() * 400,
      random() * 900,
      40 + random() * 70,
      60 + random() * 120
    );
  }
  context.strokeStyle = "rgba(0,0,0,.2)";
  context.lineWidth = 1.2;
  for (let crack = 0; crack < 4; crack += 1) {
    context.beginPath();
    let x = random() * 512;
    let y = random() * ROAD_TILE;
    context.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      x += (random() - 0.5) * 50;
      y += 20 + random() * 40;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  context.fillStyle = look.line;
  for (const edge of [-lane, lane]) {
    context.fillRect(across(edge) - 0.075 * scale, 0, 0.15 * scale, ROAD_TILE);
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
  for (const wheel of [-lane * 0.5, lane * 0.5]) {
    context.fillRect(across(wheel) - 0.5 * scale, 0, scale, ROAD_TILE);
  }
  light.context.fillStyle = "#000";
  light.context.fillRect(0, 0, 512, ROAD_TILE);
  if (look.wet) {
    const bands = 16;
    for (let streak = 0; streak < 7; streak += 1) {
      const x = random() * 512;
      const width = 24 + random() * 40;
      const phase = random() * FULL_TURN;
      const fade = light.context.createLinearGradient(
        x - width,
        0,
        x + width,
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
          x - width,
          (band / bands) * ROAD_TILE,
          width * 2,
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
  if (look.sun) {
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
  } else {
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

export const chevronTexture = (): THREE.CanvasTexture => {
  const { canvas, context } = sheet(128, 96);
  context.fillStyle = YELLOW;
  context.fillRect(0, 0, 128, 96);
  context.fillStyle = "#15171a";
  context.beginPath();
  context.moveTo(34, 10);
  context.lineTo(66, 10);
  context.lineTo(100, 48);
  context.lineTo(66, 86);
  context.lineTo(34, 86);
  context.lineTo(68, 48);
  context.closePath();
  context.fill();
  return textureOf(canvas, false);
};

export const bannerTexture = (label: string): THREE.CanvasTexture => {
  const { canvas, context } = sheet(1024, 128);
  context.fillStyle = "#0b0612";
  context.fillRect(0, 0, 1024, 128);
  context.strokeStyle = CYAN;
  context.lineWidth = 8;
  context.strokeRect(6, 6, 1012, 116);
  context.fillStyle = YELLOW;
  context.font = SHOP_FONT.replace("44px", "96px");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = YELLOW;
  context.shadowBlur = 16;
  context.fillText(label, 512, 70);
  return textureOf(canvas, false);
};
