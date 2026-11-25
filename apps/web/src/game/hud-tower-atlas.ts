import { MOST_RACERS } from "@racer/sim/race";
import type { RiderId } from "@racer/sim/state";

import type { TowerFrame } from "../hud-layout.ts";

export const ATLAS_WIDTH = 2048;
export const ATLAS_HEIGHT = 1024;

const TRACKING_EM = 0.02;
const OUTLINE_PX = 2;
const SHADOW_Y_PX = 4;
const SHADOW_BLUR_PX = 10;
const SHADOW_ALPHA = 0.45;
const SHADOW_REACH_PX = 20;
const CHIP_EM = 0.6;
const CHIP_OUTLINE_PX = 1;
const FLAG_OUTLINE_PX = 2;

const bufferPixels = (cssPixels: number, scale: number): number =>
  Math.max(1, Math.round(cssPixels * scale));
const FLAG_SQUARES = 4;
const CHIP_SKEW = Math.tan((-12 * Math.PI) / 180);
const SOLID_TEXELS = 4;
const BYTE = 255;
const ELLIPSIS = "…";
const FACE =
  '"Saira Extra Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';

const BAR_EM = 0.2;
const ITEM_GAP_EM = 0.35;
const PLACE_EM = 1.3;
const MARK_EM = 3.6;

const glyphs = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "+",
  ".",
  "-",
] as const;

export const PLUS_CELL = 10;
export const DOT_CELL = 11;
export const MINUS_CELL = 12;
export const LEAD_CELL = 13;
export const WRECKED_CELL = 14;
export const BUSTED_CELL = 15;
export const CHIP_CELL = 16;
export const FLAG_CELL = 17;
export const SOLID_CELL = 18;
export const FIRST_NAME_CELL = 19;
const NO_CELL = -1;

const words = ["LEAD", "WRECKED", "BUSTED"] as const;

export const CELL_FIELDS = 6;
export const CELL_X = 0;
export const CELL_Y = 1;
export const CELL_W = 2;
export const CELL_H = 3;
export const CELL_ORIGIN_X = 4;
export const CELL_ORIGIN_Y = 5;

const MAX_CELLS = FIRST_NAME_CELL + 2 * MOST_RACERS;

export interface GlyphMeasure {
  readonly ascent: number;
  readonly descent: number;
  readonly width: (text: string) => number;
}

export const COLUMN_BAR = 0;
export const COLUMN_PLACE_RIGHT = 1;
export const COLUMN_CHIP_LEFT = 2;
export const COLUMN_CHIP_TOP = 3;
export const COLUMN_NAME_LEFT = 4;
export const COLUMN_FLAG_LEFT = 5;
export const COLUMN_MARK_RIGHT = 6;
export const COLUMNS = 7;

export const columnsInto = (frame: TowerFrame, into: Float64Array): void => {
  const { font, pad, row, width } = frame;
  const inner = width - 2 * pad;
  const placeRight = (BAR_EM + ITEM_GAP_EM + PLACE_EM) * font;
  const chipLeft = placeRight + ITEM_GAP_EM * font;
  const markLeft = inner - MARK_EM * font;
  into[COLUMN_BAR] = BAR_EM * font;
  into[COLUMN_PLACE_RIGHT] = placeRight;
  into[COLUMN_CHIP_LEFT] = chipLeft;
  into[COLUMN_CHIP_TOP] = (row - CHIP_EM * font) / 2;
  into[COLUMN_NAME_LEFT] = chipLeft + (CHIP_EM + ITEM_GAP_EM) * font;
  into[COLUMN_FLAG_LEFT] = markLeft - (ITEM_GAP_EM + CHIP_EM) * font;
  into[COLUMN_MARK_RIGHT] = inner;
};

const nameRoom = (columns: Float64Array, finished: boolean, font: number) =>
  (finished
    ? (columns[COLUMN_FLAG_LEFT] ?? 0) - ITEM_GAP_EM * font
    : (columns[COLUMN_FLAG_LEFT] ?? 0) + CHIP_EM * font) -
  (columns[COLUMN_NAME_LEFT] ?? 0);

export interface AtlasPlan {
  readonly scale: number;
  readonly font: number;
  readonly ascent: number;
  readonly descent: number;
  readonly cells: Int32Array;
  readonly advances: Float32Array;
  readonly texts: readonly string[];
  readonly names: Int16Array;
  readonly sources: readonly (string | undefined)[];
  readonly used: number;
}

export const nameCell = (
  plan: AtlasPlan,
  id: RiderId,
  finished: boolean
): number => plan.names[2 * id + (finished ? 1 : 0)] ?? NO_CELL;

export const fits = (plan: AtlasPlan, id: RiderId, name: string): boolean =>
  id < MOST_RACERS && plan.sources[id] === name;

const truncated = (
  text: string,
  room: number,
  measure: GlyphMeasure
): string => {
  if (measure.width(text) <= room) {
    return text;
  }
  const points = Array.from(
    new Intl.Segmenter().segment(text),
    (part) => part.segment
  );
  for (let keep = points.length - 1; keep > 0; keep -= 1) {
    const cut = `${points.slice(0, keep).join("")}${ELLIPSIS}`;
    if (measure.width(cut) <= room) {
      return cut;
    }
  }
  return ELLIPSIS;
};

interface Packer {
  x: number;
  y: number;
  readonly height: number;
}

export const planAtlas = (
  names: ReadonlyMap<RiderId, string>,
  frame: TowerFrame,
  scale: number,
  measure: GlyphMeasure
): AtlasPlan => {
  const font = frame.font * scale;
  const margin = Math.ceil(SHADOW_REACH_PX * scale) + 1;
  const ascent = Math.ceil(measure.ascent);
  const descent = Math.ceil(measure.descent);
  const packer: Packer = { height: ascent + descent + 2 * margin, x: 0, y: 0 };
  const cells = new Int32Array(MAX_CELLS * CELL_FIELDS);
  const advances = new Float32Array(MAX_CELLS);
  const texts: string[] = [];
  const place = (
    cell: number,
    text: string,
    width: number,
    origin: readonly [number, number],
    advance: number
  ) => {
    if (packer.x + width > ATLAS_WIDTH) {
      packer.x = 0;
      packer.y += packer.height;
    }
    if (packer.y + packer.height > ATLAS_HEIGHT) {
      throw new RangeError(
        `The tower atlas has no room for ${text} at ${font} px.`
      );
    }
    const at = cell * CELL_FIELDS;
    cells[at + CELL_X] = packer.x;
    cells[at + CELL_Y] = packer.y;
    cells[at + CELL_W] = width;
    cells[at + CELL_H] = packer.height;
    const [originX, originY] = origin;
    cells[at + CELL_ORIGIN_X] = originX;
    cells[at + CELL_ORIGIN_Y] = originY;
    advances[cell] = advance;
    texts[cell] = text;
    packer.x += width;
  };
  const text = (cell: number, drawn: string, advance: number) => {
    place(
      cell,
      drawn,
      Math.ceil(measure.width(drawn)) + 2 * margin,
      [margin, margin + ascent],
      advance
    );
  };
  const digitAdvance = Math.round(
    Math.max(...glyphs.slice(0, 10).map((digit) => measure.width(digit)))
  );
  for (let cell = 0; cell < glyphs.length; cell += 1) {
    const glyph = glyphs[cell] ?? "";
    text(
      cell,
      glyph,
      cell < PLUS_CELL ? digitAdvance : Math.round(measure.width(glyph))
    );
  }
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? "";
    text(LEAD_CELL + at, word, measure.width(word));
  }
  const chip = frame.font * CHIP_EM * scale;
  const chipEdge = Math.ceil(
    Math.abs(CHIP_SKEW) * (chip / 2) + bufferPixels(CHIP_OUTLINE_PX, scale)
  );
  place(
    CHIP_CELL,
    "",
    Math.ceil(chip) + 2 * chipEdge + 1,
    [chipEdge, chipEdge],
    0
  );
  const flagEdge = bufferPixels(FLAG_OUTLINE_PX, scale);
  place(
    FLAG_CELL,
    "",
    Math.ceil(chip) + 2 * flagEdge + 1,
    [flagEdge, flagEdge],
    0
  );
  place(SOLID_CELL, "", SOLID_TEXELS, [SOLID_TEXELS / 2, SOLID_TEXELS / 2], 0);
  const columns = new Float64Array(COLUMNS);
  columnsInto(frame, columns);
  const nameCells = new Int16Array(2 * MOST_RACERS).fill(NO_CELL);
  const sources: (string | undefined)[] = [];
  let next = FIRST_NAME_CELL;
  for (const [id, name] of names) {
    if (id >= MOST_RACERS) {
      throw new RangeError(`The tower has no name slot for rider ${id}.`);
    }
    sources[id] = name;
    const upper = name.toUpperCase();
    const open = truncated(
      upper,
      nameRoom(columns, false, frame.font) * scale,
      measure
    );
    const closed = truncated(
      upper,
      nameRoom(columns, true, frame.font) * scale,
      measure
    );
    text(next, open, 0);
    nameCells[2 * id] = next;
    if (closed === open) {
      nameCells[2 * id + 1] = next;
      next += 1;
    } else {
      text(next + 1, closed, 0);
      nameCells[2 * id + 1] = next + 1;
      next += 2;
    }
  }
  return {
    advances,
    ascent: measure.ascent,
    cells,
    descent: measure.descent,
    font,
    names: nameCells,
    scale,
    sources,
    texts,
    used: packer.y + packer.height,
  };
};

const fontOf = (px: number): string => `700 ${px}px ${FACE}`;

export const canvasMeasure = (
  context: CanvasRenderingContext2D,
  font: number
): GlyphMeasure => {
  context.font = fontOf(font);
  context.letterSpacing = `${TRACKING_EM * font}px`;
  const metrics = context.measureText("0");
  return {
    ascent: metrics.fontBoundingBoxAscent,
    descent: metrics.fontBoundingBoxDescent,
    width: (text) => context.measureText(text).width,
  };
};

interface Layers {
  readonly fill: CanvasRenderingContext2D;
  readonly edge: CanvasRenderingContext2D;
  readonly shadow: CanvasRenderingContext2D;
}

const SHADOW_SHIFT = ATLAS_WIDTH * 2;

const paintText = (
  { edge, fill, shadow }: Layers,
  drawn: string,
  x: number,
  y: number,
  scale: number
) => {
  const outline = bufferPixels(OUTLINE_PX, scale);
  fill.fillText(drawn, x, y);
  edge.fillText(drawn, x - outline, y);
  edge.fillText(drawn, x + outline, y);
  edge.fillText(drawn, x, y - outline);
  edge.fillText(drawn, x, y + outline);
  shadow.fillText(drawn, x - SHADOW_SHIFT, y);
};

const skewed = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  draw: () => void
) => {
  context.save();
  context.setTransform(1, 0, CHIP_SKEW, 1, x + size / 2, y + size / 2);
  draw();
  context.restore();
};

const paintChip = (
  layers: Layers,
  x: number,
  y: number,
  size: number,
  scale: number
) => {
  const line = bufferPixels(CHIP_OUTLINE_PX, scale);
  skewed(layers.fill, x, y, size, () => {
    layers.fill.fillRect(-size / 2, -size / 2, size, size);
  });
  skewed(layers.edge, x, y, size, () => {
    layers.edge.lineWidth = line;
    layers.edge.strokeRect(
      -size / 2 - line / 2,
      -size / 2 - line / 2,
      size + line,
      size + line
    );
  });
};

const paintFlag = (
  layers: Layers,
  x: number,
  y: number,
  size: number,
  scale: number
) => {
  const line = bufferPixels(FLAG_OUTLINE_PX, scale);
  const square = size / FLAG_SQUARES;
  for (let row = 0; row < FLAG_SQUARES; row += 1) {
    for (let column = 0; column < FLAG_SQUARES; column += 1) {
      const light = (row + column) % 2 === 1;
      (light ? layers.fill : layers.edge).fillRect(
        x + column * square,
        y + row * square,
        square,
        square
      );
    }
  }
  layers.edge.lineWidth = line;
  layers.edge.strokeRect(x - line / 2, y - line / 2, size + line, size + line);
};

const layerOf = (height: number, font: number): CanvasRenderingContext2D => {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("The browser gave the tower atlas no 2D canvas.");
  }
  context.font = fontOf(font);
  context.letterSpacing = `${TRACKING_EM * font}px`;
  context.textBaseline = "alphabetic";
  context.fillStyle = "#fff";
  context.strokeStyle = "#fff";
  return context;
};

const releaseLayer = (context: CanvasRenderingContext2D) => {
  context.canvas.width = 0;
  context.canvas.height = 0;
};

export const paintAtlas = (
  plan: AtlasPlan,
  frame: TowerFrame,
  into: Uint8Array
): void => {
  const { cells, font, scale, texts, used } = plan;
  const layers: Layers = {
    edge: layerOf(used, font),
    fill: layerOf(used, font),
    shadow: layerOf(used, font),
  };
  layers.shadow.shadowColor = `rgba(0, 0, 0, ${SHADOW_ALPHA})`;
  layers.shadow.shadowBlur = SHADOW_BLUR_PX * scale;
  layers.shadow.shadowOffsetX = SHADOW_SHIFT;
  layers.shadow.shadowOffsetY = SHADOW_Y_PX * scale;
  try {
    const chip = frame.font * CHIP_EM * scale;
    for (let cell = 0; cell < texts.length; cell += 1) {
      const at = cell * CELL_FIELDS;
      const x = (cells[at + CELL_X] ?? 0) + (cells[at + CELL_ORIGIN_X] ?? 0);
      const y = (cells[at + CELL_Y] ?? 0) + (cells[at + CELL_ORIGIN_Y] ?? 0);
      const drawn = texts[cell] ?? "";
      if (cell === CHIP_CELL) {
        paintChip(layers, x, y, chip, scale);
      } else if (cell === FLAG_CELL) {
        paintFlag(layers, x, y, chip, scale);
      } else if (cell === SOLID_CELL) {
        layers.fill.fillRect(
          cells[at + CELL_X] ?? 0,
          cells[at + CELL_Y] ?? 0,
          SOLID_TEXELS,
          SOLID_TEXELS
        );
      } else if (drawn !== "") {
        paintText(layers, drawn, x, y, scale);
      }
    }
    const fill = layers.fill.getImageData(0, 0, ATLAS_WIDTH, used).data;
    const edge = layers.edge.getImageData(0, 0, ATLAS_WIDTH, used).data;
    const shadow = layers.shadow.getImageData(0, 0, ATLAS_WIDTH, used).data;
    into.fill(0);
    for (let texel = 3; texel < fill.length; texel += 4) {
      const covered = (fill[texel] ?? 0) / BYTE;
      const inked = ((edge[texel] ?? 0) / BYTE) * (1 - covered);
      const shaded = ((shadow[texel] ?? 0) / BYTE) * (1 - covered - inked);
      into[texel - 3] = Math.round(covered * BYTE);
      into[texel - 2] = Math.round(inked * BYTE);
      into[texel - 1] = Math.round(Math.max(0, shaded) * BYTE);
      into[texel] = BYTE;
    }
  } finally {
    releaseLayer(layers.fill);
    releaseLayer(layers.edge);
    releaseLayer(layers.shadow);
  }
};
