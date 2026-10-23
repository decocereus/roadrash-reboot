import type { Random } from "@racer/track/random";
import type * as THREE from "three";

import { CYAN, MAGENTA, ORANGE, YELLOW } from "./looks.ts";
import { pick, sheet, textureOf } from "./texture-canvas.ts";

const FONT = '800 104px "Saira Extra Condensed", Impact, sans-serif';

const SIGN_WORDS = [
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

const SIGN_COLOURS = [MAGENTA, CYAN, YELLOW, ORANGE] as const;

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
      let index = 0;
      for (const letter of text) {
        context.fillText(letter, 64, 76 + index * LETTER_HEIGHT);
        index += 1;
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
