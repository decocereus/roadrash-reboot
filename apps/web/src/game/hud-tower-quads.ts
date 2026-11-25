import { MOST_RACERS } from "@racer/sim/race";

import { windowLength, windowRow } from "../hud-layout.ts";
import type { TowerFrame, TowerRows } from "../hud-layout.ts";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  BUSTED_CELL,
  CELL_FIELDS,
  CELL_H,
  CELL_ORIGIN_X,
  CELL_ORIGIN_Y,
  CELL_W,
  CELL_X,
  CELL_Y,
  CHIP_CELL,
  COLUMNS,
  COLUMN_BAR,
  COLUMN_CHIP_LEFT,
  COLUMN_CHIP_TOP,
  COLUMN_FLAG_LEFT,
  COLUMN_MARK_RIGHT,
  COLUMN_NAME_LEFT,
  COLUMN_PLACE_RIGHT,
  DOT_CELL,
  FLAG_CELL,
  LEAD_CELL,
  MINUS_CELL,
  PLUS_CELL,
  SOLID_CELL,
  WRECKED_CELL,
  columnsInto,
  nameCell,
} from "./hud-tower-atlas.ts";
import type { AtlasPlan } from "./hud-tower-atlas.ts";
import type { TowerRow } from "./hud.ts";

const ROWS = MOST_RACERS;
const TEXT_PER_ROW = 12;
const SOLIDS = 1 + 3 * ROWS;
const TEXTS = TEXT_PER_ROW * ROWS;
export const TOWER_QUADS = SOLIDS + 2 * TEXTS;
export const SLIDE_MS = 220;
const PERCENT = 100;
const OUT_ALPHA = 50;
const WHOLE = 100;
const PANEL_ALPHA = 55;
const CHIP_EDGE_ALPHA = 70;
const BYTE = 255;
const RED = 65_536;
const GREEN = 256;
const EASE_X2 = 0.58;
const EASE_STEPS = 12;
const NOT_DRAWN = -1;
const PANEL = -1;

const TEXT = 0xf2_ee_e6;
const YELLOW = 0xff_c5_31;
const INK = 0x0e_0f_12;

const NOW = COLUMNS;
const LEFT = COLUMNS + 1;
const SCALE_X = COLUMNS + 2;
const SCALE_Y = COLUMNS + 3;
const ROW_PX = COLUMNS + 4;
const ROWS_TOP = COLUMNS + 5;
const SLID = COLUMNS + 6;
const REALS = COLUMNS + 7;

const QUAD = 0;
const TEXT_QUAD = 1;
const TEXT_QUADS = 2;
const SLOT = 3;
const ALPHA = 4;
const COLOUR = 5;
const BASELINE = 6;
const END = 7;
const INTS = 8;

const LAYOUTS = 0;
const SLOTS = 1;
const QUADS = 2;

export interface Placement {
  readonly frame: TowerFrame;
  readonly shown: TowerRows;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly deviceRatio: number;
}

const bezier = (t: number, middle: number): number =>
  3 * (1 - t) * t * t * middle + t * t * t;

export const easeOut = (share: number): number => {
  if (share <= 0) {
    return 0;
  }
  if (share >= 1) {
    return 1;
  }
  let low = 0;
  let high = 1;
  for (let step = 0; step < EASE_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (bezier(middle, EASE_X2) < share) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return bezier((low + high) / 2, 1);
};

const digitsOf = (value: number): number => {
  let digits = 1;
  for (let rest = value; rest >= 10; rest = Math.floor(rest / 10)) {
    digits += 1;
  }
  return digits;
};

const markQuads = (row: TowerRow): number => {
  switch (row.mark) {
    case "lead":
    case "wrecked":
    case "busted": {
      return 1;
    }
    case "blank": {
      return 0;
    }
    case "gap": {
      return (
        (row.tenths < 0 ? 4 : 3) +
        digitsOf(Math.floor(Math.abs(row.tenths) / 10))
      );
    }
    default: {
      return row.mark satisfies never;
    }
  }
};

const wordCell = (row: TowerRow): number => {
  switch (row.mark) {
    case "lead": {
      return LEAD_CELL;
    }
    case "wrecked": {
      return WRECKED_CELL;
    }
    case "busted": {
      return BUSTED_CELL;
    }
    case "blank":
    case "gap": {
      return -1;
    }
    default: {
      return row.mark satisfies never;
    }
  }
};

const out = (row: TowerRow): boolean =>
  row.mark === "wrecked" || row.mark === "busted";

const colourInto = (
  into: Float32Array,
  quad: number,
  colour: number,
  alpha: number
) => {
  for (let corner = 0; corner < 4; corner += 1) {
    const at = (quad * 4 + corner) * 4;
    into[at] = (Math.floor(colour / RED) % GREEN) / BYTE;
    into[at + 1] = (Math.floor(colour / GREEN) % GREEN) / BYTE;
    into[at + 2] = (colour % GREEN) / BYTE;
    into[at + 3] = alpha / PERCENT;
  }
};

export const createTowerQuads = () => {
  const positions = new Float32Array(TOWER_QUADS * 8);
  const uvs = new Float32Array(TOWER_QUADS * 8);
  const fills = new Float32Array(TOWER_QUADS * 16);
  const edges = new Float32Array(TOWER_QUADS * 16);
  const cellOf = new Int16Array(TOWER_QUADS);
  const slotOf = new Int8Array(TOWER_QUADS);
  const boxes = new Int32Array(TOWER_QUADS * 4);
  const slotRider = new Int16Array(ROWS);
  const from = new Float64Array(ROWS);
  const to = new Float64Array(ROWS);
  const started = new Float64Array(ROWS);
  const drawnIn = new Int32Array(ROWS).fill(NOT_DRAWN);
  const reals = new Float64Array(REALS);
  const ints = new Int32Array(INTS);
  const counts = new Int32Array(3);

  const snap = (column: number): number => {
    ints[END] = Math.round(
      ((reals[LEFT] ?? 0) + (reals[column] ?? 0)) * (reals[SCALE_X] ?? 1)
    );
    return ints[END] ?? 0;
  };

  const snapLeft = (): number => {
    ints[END] = Math.round((reals[LEFT] ?? 0) * (reals[SCALE_X] ?? 1));
    return ints[END] ?? 0;
  };

  const quadAt = (
    quad: number,
    plan: AtlasPlan,
    cell: number,
    x: number,
    y: number
  ) => {
    const at = cell * CELL_FIELDS;
    const width = plan.cells[at + CELL_W] ?? 0;
    const height = plan.cells[at + CELL_H] ?? 0;
    const left = plan.cells[at + CELL_X] ?? 0;
    const top = plan.cells[at + CELL_Y] ?? 0;
    cellOf[quad] = cell;
    slotOf[quad] = ints[SLOT] ?? PANEL;
    boxes[quad * 4] = x - (plan.cells[at + CELL_ORIGIN_X] ?? 0);
    boxes[quad * 4 + 1] = y - (plan.cells[at + CELL_ORIGIN_Y] ?? 0);
    boxes[quad * 4 + 2] = width;
    boxes[quad * 4 + 3] = height;
    const inset = cell === SOLID_CELL ? 2 : 0;
    const uv = quad * 8;
    uvs[uv] = (left + inset) / ATLAS_WIDTH;
    uvs[uv + 1] = (top + inset) / ATLAS_HEIGHT;
    uvs[uv + 2] = (inset > 0 ? left + inset : left + width) / ATLAS_WIDTH;
    uvs[uv + 3] = uvs[uv + 1] ?? 0;
    uvs[uv + 4] = uvs[uv + 2] ?? 0;
    uvs[uv + 5] = (inset > 0 ? top + inset : top + height) / ATLAS_HEIGHT;
    uvs[uv + 6] = uvs[uv] ?? 0;
    uvs[uv + 7] = uvs[uv + 5] ?? 0;
  };

  const solid = (
    plan: AtlasPlan,
    x: number,
    y: number,
    width: number,
    height: number,
    colour: number,
    alpha: number
  ) => {
    const quad = ints[QUAD] ?? 0;
    quadAt(quad, plan, SOLID_CELL, x, y);
    boxes[quad * 4] = x;
    boxes[quad * 4 + 1] = y;
    boxes[quad * 4 + 2] = width;
    boxes[quad * 4 + 3] = height;
    colourInto(fills, quad, colour, alpha);
    colourInto(edges, quad, INK, 0);
    ints[QUAD] = quad + 1;
  };

  const box = (
    plan: AtlasPlan,
    cell: number,
    x: number,
    y: number,
    fill: number,
    edge: number,
    edgeAlpha: number
  ) => {
    const quad = ints[QUAD] ?? 0;
    const alpha = ints[ALPHA] ?? WHOLE;
    quadAt(quad, plan, cell, x, y);
    colourInto(fills, quad, fill, alpha);
    colourInto(edges, quad, edge, Math.round((edgeAlpha * alpha) / PERCENT));
    ints[QUAD] = quad + 1;
  };

  const glyph = (plan: AtlasPlan, cell: number, x: number) => {
    const under = ints[TEXT_QUAD] ?? 0;
    const over = under + (ints[TEXT_QUADS] ?? 0);
    const alpha = ints[ALPHA] ?? WHOLE;
    const colour = ints[COLOUR] ?? TEXT;
    const baseline = ints[BASELINE] ?? 0;
    quadAt(under, plan, cell, x, baseline);
    quadAt(over, plan, cell, x, baseline);
    colourInto(fills, under, colour, 0);
    colourInto(edges, under, INK, alpha);
    colourInto(fills, over, colour, alpha);
    colourInto(edges, over, INK, 0);
    ints[TEXT_QUAD] = under + 1;
  };

  const number = (plan: AtlasPlan, value: number, x: number) => {
    ints[END] = x;
    for (
      let unit = 10 ** (digitsOf(value) - 1);
      unit >= 1;
      unit = Math.floor(unit / 10)
    ) {
      glyph(plan, Math.floor(value / unit) % 10, ints[END] ?? 0);
      ints[END] = (ints[END] ?? 0) + (plan.advances[0] ?? 0);
    }
  };

  const gap = (plan: AtlasPlan, row: TowerRow, right: number) => {
    const tenths = Math.abs(row.tenths);
    const whole = Math.floor(tenths / 10);
    const negative = row.tenths < 0;
    ints[END] =
      right -
      (plan.advances[PLUS_CELL] ?? 0) -
      (negative ? (plan.advances[MINUS_CELL] ?? 0) : 0) -
      (digitsOf(whole) + 1) * (plan.advances[0] ?? 0) -
      (plan.advances[DOT_CELL] ?? 0);
    glyph(plan, PLUS_CELL, ints[END] ?? 0);
    ints[END] = (ints[END] ?? 0) + (plan.advances[PLUS_CELL] ?? 0);
    if (negative) {
      glyph(plan, MINUS_CELL, ints[END] ?? 0);
      ints[END] = (ints[END] ?? 0) + (plan.advances[MINUS_CELL] ?? 0);
    }
    number(plan, whole, ints[END] ?? 0);
    glyph(plan, DOT_CELL, ints[END] ?? 0);
    number(
      plan,
      tenths % 10,
      (ints[END] ?? 0) + (plan.advances[DOT_CELL] ?? 0)
    );
  };

  const mark = (plan: AtlasPlan, row: TowerRow, right: number) => {
    const word = wordCell(row);
    if (word >= 0) {
      ints[END] = Math.round(right - (plan.advances[word] ?? 0));
      glyph(plan, word, ints[END] ?? 0);
    } else if (row.mark === "gap") {
      gap(plan, row, right);
    }
  };

  const baselineInto = (plan: AtlasPlan, placement: Placement) => {
    const { deviceRatio, frame } = placement;
    const ascent =
      Math.round((plan.ascent / plan.scale) * deviceRatio) / deviceRatio;
    const descent =
      Math.round((plan.descent / plan.scale) * deviceRatio) / deviceRatio;
    ints[BASELINE] = Math.round(
      ((frame.row - frame.font) / 2 +
        (frame.font - ascent - descent) / 2 +
        ascent) *
        placement.scaleY
    );
  };

  const row = (plan: AtlasPlan, drawn: TowerRow) => {
    ints[ALPHA] = out(drawn) ? OUT_ALPHA : WHOLE;
    ints[COLOUR] = drawn.you ? YELLOW : TEXT;
    if (drawn.you) {
      solid(
        plan,
        snapLeft(),
        0,
        snap(COLUMN_BAR) - snapLeft(),
        Math.round((reals[ROW_PX] ?? 0) * (reals[SCALE_Y] ?? 1)),
        YELLOW,
        ints[ALPHA] ?? WHOLE
      );
    }
    ints[END] = Math.round(
      (reals[COLUMN_CHIP_TOP] ?? 0) * (reals[SCALE_Y] ?? 1)
    );
    const chipTop = ints[END] ?? 0;
    box(
      plan,
      CHIP_CELL,
      snap(COLUMN_CHIP_LEFT),
      chipTop,
      drawn.chip,
      TEXT,
      CHIP_EDGE_ALPHA
    );
    if (drawn.finished) {
      box(plan, FLAG_CELL, snap(COLUMN_FLAG_LEFT), chipTop, TEXT, INK, WHOLE);
    }
    ints[END] =
      snap(COLUMN_PLACE_RIGHT) -
      digitsOf(drawn.place) * (plan.advances[0] ?? 0);
    number(plan, drawn.place, ints[END] ?? 0);
    glyph(
      plan,
      nameCell(plan, drawn.id, drawn.finished),
      snap(COLUMN_NAME_LEFT)
    );
    mark(plan, drawn, snap(COLUMN_MARK_RIGHT));
  };

  const slideAt = (id: number) => {
    const target = to[id] ?? 0;
    const start = from[id] ?? target;
    reals[SLID] =
      start +
      (target - start) *
        easeOut(((reals[NOW] ?? 0) - (started[id] ?? 0)) / SLIDE_MS);
  };

  const slideTo = (slot: number, id: number, reduced: boolean) => {
    const now = reals[NOW] ?? 0;
    const layouts = counts[LAYOUTS] ?? 0;
    if (drawnIn[id] === layouts - 1 && !reduced) {
      if (to[id] !== slot) {
        slideAt(id);
        from[id] = reals[SLID] ?? slot;
        to[id] = slot;
        started[id] = now;
      }
    } else {
      from[id] = slot;
      to[id] = slot;
      started[id] = now;
    }
    drawnIn[id] = layouts;
    slotRider[slot] = id;
  };

  const layout = (
    rows: readonly TowerRow[],
    plan: AtlasPlan,
    placement: Placement,
    now: number,
    reduced: boolean
  ): void => {
    const { frame, shown } = placement;
    reals[NOW] = now;
    counts[LAYOUTS] = (counts[LAYOUTS] ?? 0) + 1;
    const slots = Math.min(ROWS, windowLength(rows.length, shown));
    counts[SLOTS] = slots;
    let solids = 1;
    let texts = 0;
    for (let slot = 0; slot < slots; slot += 1) {
      const drawn = windowRow(rows, shown, slot);
      if (drawn) {
        slideTo(slot, drawn.id, reduced);
        solids += (drawn.you ? 2 : 1) + (drawn.finished ? 1 : 0);
        texts += digitsOf(drawn.place) + 1 + markQuads(drawn);
      }
    }
    if (slots === 0) {
      counts[QUADS] = 0;
      return;
    }
    columnsInto(frame, reals);
    reals[LEFT] = frame.left + frame.pad;
    reals[SCALE_X] = placement.scaleX;
    reals[SCALE_Y] = placement.scaleY;
    reals[ROW_PX] = frame.row;
    reals[ROWS_TOP] = frame.top + frame.pad;
    baselineInto(plan, placement);
    ints[QUAD] = 0;
    ints[SLOT] = PANEL;
    ints[TEXT_QUAD] = solids;
    ints[TEXT_QUADS] = texts;
    const panelLeft = Math.round(frame.left * placement.scaleX);
    const panelTop = Math.round(frame.top * placement.scaleY);
    solid(
      plan,
      panelLeft,
      panelTop,
      Math.round((frame.left + frame.width) * placement.scaleX) - panelLeft,
      Math.round(
        (frame.top + 2 * frame.pad + slots * frame.row) * placement.scaleY
      ) - panelTop,
      INK,
      PANEL_ALPHA
    );
    for (let slot = 0; slot < slots; slot += 1) {
      const drawn = windowRow(rows, shown, slot);
      if (drawn) {
        ints[SLOT] = slot;
        row(plan, drawn);
      }
    }
    counts[QUADS] = solids + 2 * texts;
  };

  const corners = (quad: number) => {
    const x0 = boxes[quad * 4] ?? 0;
    const y0 = (ints[END] ?? 0) + (boxes[quad * 4 + 1] ?? 0);
    const x1 = x0 + (boxes[quad * 4 + 2] ?? 0);
    const y1 = y0 + (boxes[quad * 4 + 3] ?? 0);
    const at = quad * 8;
    positions[at] = x0;
    positions[at + 1] = y0;
    positions[at + 2] = x1;
    positions[at + 3] = y0;
    positions[at + 4] = x1;
    positions[at + 5] = y1;
    positions[at + 6] = x0;
    positions[at + 7] = y1;
  };

  const place = (now: number): boolean => {
    reals[NOW] = now;
    const quads = counts[QUADS] ?? 0;
    for (let quad = 0; quad < quads; quad += 1) {
      const slot = slotOf[quad] ?? PANEL;
      ints[END] = 0;
      if (slot !== PANEL) {
        slideAt(slotRider[slot] ?? 0);
        ints[END] = Math.round(
          ((reals[ROWS_TOP] ?? 0) + (reals[SLID] ?? 0) * (reals[ROW_PX] ?? 0)) *
            (reals[SCALE_Y] ?? 1)
        );
      }
      corners(quad);
    }
    let moving = false;
    const slots = counts[SLOTS] ?? 0;
    for (let slot = 0; slot < slots; slot += 1) {
      const id = slotRider[slot] ?? 0;
      moving ||= from[id] !== to[id] && now - (started[id] ?? now) < SLIDE_MS;
    }
    return moving;
  };

  return {
    cellOf,
    edges,
    fills,
    layout,
    place,
    positions,
    quadCount: () => counts[QUADS] ?? 0,
    slotOf,
    uvs,
  };
};

export type TowerQuads = ReturnType<typeof createTowerQuads>;
