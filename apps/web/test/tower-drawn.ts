import type { RiderId } from "@racer/sim/state";

import {
  CELL_FIELDS,
  CELL_ORIGIN_X,
  CHIP_CELL,
  FIRST_NAME_CELL,
  FLAG_CELL,
  SOLID_CELL,
  planAtlas,
} from "../src/game/hud-tower-atlas.ts";
import type { AtlasPlan, GlyphMeasure } from "../src/game/hud-tower-atlas.ts";
import type { Placement, TowerQuads } from "../src/game/hud-tower-quads.ts";
import { towerFrame } from "../src/hud-layout.ts";
import type { TowerRows, Viewport } from "../src/hud-layout.ts";

const CHARACTER_EM = 0.5;
const ASCENT_EM = 0.9;
const DESCENT_EM = 0.3;
const BYTE = 255;

export const wideView: Viewport = { height: 992, width: 1919 };

const measureAt = (font: number): GlyphMeasure => ({
  ascent: ASCENT_EM * font,
  descent: DESCENT_EM * font,
  width: (text) => text.length * CHARACTER_EM * font,
});

export const placementFor = (
  view: Viewport,
  shown: TowerRows,
  scale = 1
): Placement => ({
  deviceRatio: 1,
  frame: towerFrame(view, shown),
  scaleX: scale,
  scaleY: scale,
  shown,
});

export const planFor = (
  names: ReadonlyMap<RiderId, string>,
  placement: Placement
): AtlasPlan =>
  planAtlas(
    names,
    placement.frame,
    placement.scaleX,
    measureAt(placement.frame.font * placement.scaleX)
  );

export interface DrawnRow {
  readonly slot: number;
  readonly text: string;
  readonly colour: number;
  readonly alpha: number;
  readonly chip: number;
  readonly bar: boolean;
  readonly flag: boolean;
  readonly top: number;
}

const colourAt = (colours: Float32Array, quad: number): number => {
  const at = quad * 16;
  return (
    Math.round((colours[at] ?? 0) * BYTE) * 65_536 +
    Math.round((colours[at + 1] ?? 0) * BYTE) * 256 +
    Math.round((colours[at + 2] ?? 0) * BYTE)
  );
};

const isGlyph = (cell: number): boolean =>
  cell !== CHIP_CELL && cell !== FLAG_CELL && cell !== SOLID_CELL;

interface Token {
  readonly pen: number;
  readonly text: string;
  readonly name: boolean;
}

export const drawnRows = (
  quads: TowerQuads,
  plan: AtlasPlan
): readonly DrawnRow[] => {
  const slots = new Map<
    number,
    {
      tokens: Token[];
      colour: number;
      alpha: number;
      chip: number;
      bar: boolean;
      flag: boolean;
      top: number;
    }
  >();
  for (let quad = 0; quad < quads.quadCount(); quad += 1) {
    const slot = quads.slotOf[quad] ?? -1;
    const cell = quads.cellOf[quad] ?? -1;
    const fillAlpha = quads.fills[quad * 16 + 3] ?? 0;
    if (slot >= 0 && !(isGlyph(cell) && fillAlpha === 0)) {
      const row = slots.get(slot) ?? {
        alpha: 1,
        bar: false,
        chip: -1,
        colour: -1,
        flag: false,
        tokens: [],
        top: Number.POSITIVE_INFINITY,
      };
      slots.set(slot, row);
      if (cell === SOLID_CELL) {
        row.bar = true;
      } else if (cell === CHIP_CELL) {
        row.chip = colourAt(quads.fills, quad);
        row.alpha = fillAlpha;
        row.top = Math.min(row.top, quads.positions[quad * 8 + 1] ?? 0);
      } else if (cell === FLAG_CELL) {
        row.flag = true;
      } else {
        row.colour = colourAt(quads.fills, quad);
        row.tokens.push({
          name: cell >= FIRST_NAME_CELL,
          pen:
            (quads.positions[quad * 8] ?? 0) +
            (plan.cells[cell * CELL_FIELDS + CELL_ORIGIN_X] ?? 0),
          text: plan.texts[cell] ?? "?",
        });
      }
    }
  }
  return [...slots]
    .toSorted(([left], [right]) => left - right)
    .map(([slot, row]) => {
      const tokens = row.tokens.toSorted((left, right) => left.pen - right.pen);
      const name = tokens.findIndex((token) => token.name);
      const words = [
        tokens
          .slice(0, name)
          .map((token) => token.text)
          .join(""),
        tokens[name]?.text ?? "",
        tokens
          .slice(name + 1)
          .map((token) => token.text)
          .join(""),
      ];
      return {
        alpha: row.alpha,
        bar: row.bar,
        chip: row.chip,
        colour: row.colour,
        flag: row.flag,
        slot,
        text: words.filter((word) => word !== "").join(" "),
        top: row.top,
      };
    });
};
