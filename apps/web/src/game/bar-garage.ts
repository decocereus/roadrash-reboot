import { MEZZANINE, ROOM } from "@racer/sim/lobby-floor";

import type { Kit } from "./bar-kit.ts";
import { GARAGE_LAMPS } from "./bar-room.ts";
import { CYAN, MAGENTA, YELLOW } from "./looks.ts";

type Vec = readonly [number, number, number];

const CEILING = MEZZANINE.y - 0.3;
const FLAT_TO_WALL = { tilt: Math.PI / 2, yaw: Math.PI / 2 } as const;
const ALONG_WALL = { tilt: Math.PI / 2 } as const;

const PANEL = "#6e5670";
const PANEL_ALT = "#68506a";
const DADO = "#463450";
const BACK_PANEL = "#5a4462";
const BEAM = "#3a2a48";
const DUCT = "#6a5a78";
const DUCT_BAND = "#4a3c58";
const LAMP_HOUSE = "#2a1a38";
const LAMP = "#ffb066";
const BOARD = "#3a2d4c";
const HOLE = "#1a1426";
const STEEL = "#c8c4dc";
const STEEL_DARK = "#7a7690";
const RACK = "#4a3c5a";
const CHEST = "#d62444";
const CHEST_DRAWER = "#a81a38";
const HANDLE = "#f0ecf8";
const TOP = "#b0703e";
const DRAWER = "#ffd23a";
const CUPBOARD = "#46345a";
const GRIP_YELLOW = "#f2c63a";
const GRIP_RED = "#e04050";
const TOTE_GREY = "#8a84a0";
const TOTE_BLUE = "#3aa6c8";
const TOTE_PINK = "#d8407a";
const BARREL = "#ffb820";
const BARREL_BAND = "#6a4a10";
const HAZARD = "#ffc21a";
const HAZARD_DARK = "#17121f";
const DOOR = "#5a4468";
const DOOR_FRAME = "#33264a";
const CRATE = "#5c4050";
const TYRE = "#1d1826";

const spot = (along: number, y: number, out: number): Vec => [
  ROOM.rightX - out,
  y,
  along,
];
const size = (wide: number, tall: number, deep: number): Vec => [
  deep,
  tall,
  wide,
];

const panels = (kit: Kit): void => {
  const { backZ, frontZ, leftX } = MEZZANINE;
  const { rightX } = ROOM;
  const width = 2.1;
  let index = 0;
  for (let z = backZ; z < frontZ; z += width) {
    kit.box(
      spot(z + width / 2, CEILING / 2, 0.05),
      size(width - 0.04, CEILING, 0.1),
      index % 2 === 0 ? PANEL : PANEL_ALT
    );
    index += 1;
  }
  kit.box(
    spot((backZ + frontZ) / 2, 0.42, 0.11),
    size(frontZ - backZ, 0.84, 0.06),
    DADO
  );
  kit.box(
    [(leftX + rightX) / 2, CEILING / 2, backZ + 0.05],
    [rightX - leftX, CEILING, 0.1],
    BACK_PANEL
  );
};

const ceilingWork = (kit: Kit, glow: Kit): void => {
  const { backZ, frontZ, leftX } = MEZZANINE;
  const { rightX } = ROOM;
  const span = frontZ - backZ;
  const middle = (frontZ + backZ) / 2;
  for (let z = backZ + 1.4; z < frontZ; z += 2.6) {
    kit.box(
      [(leftX + rightX) / 2, CEILING - 0.17, z],
      [rightX - leftX, 0.34, 0.26],
      BEAM
    );
  }
  kit.box(spot(middle, CEILING - 0.2, 2.1), size(span, 0.34, 0.8), DUCT);
  for (let z = backZ + 0.8; z < frontZ; z += 1.5) {
    kit.box(spot(z, CEILING - 0.2, 2.1), size(0.08, 0.38, 0.86), DUCT_BAND);
  }
  kit.pole(spot(middle, CEILING - 0.2, 0.28), [0.07, 0.07], span, STEEL_DARK, {
    ...ALONG_WALL,
    sides: 8,
  });
  for (const [x, z] of GARAGE_LAMPS) {
    kit.box([x, CEILING - 0.42, z], [0.72, 0.2, 3.3], LAMP_HOUSE);
    kit.box([x, CEILING - 0.16, z - 1.3], [0.05, 0.32, 0.05], STEEL_DARK);
    kit.box([x, CEILING - 0.16, z + 1.3], [0.05, 0.32, 0.05], STEEL_DARK);
    glow.box([x, CEILING - 0.53, z], [0.56, 0.04, 3.1], LAMP, {
      strength: 3.2,
    });
  }
};

const hazardColumn = (kit: Kit): void => {
  const x = MEZZANINE.leftX + 0.3;
  const z = MEZZANINE.backZ + 0.55;
  kit.box([x, CEILING / 2, z], [0.86, CEILING, 0.86], "#4a3858");
  for (let band = 0; band < 6; band += 1) {
    kit.box(
      [x, 0.2 + band * 0.36, z],
      [0.9, 0.35, 0.9],
      band % 2 === 0 ? HAZARD : HAZARD_DARK
    );
  }
};

const chest = (kit: Kit, along: number): void => {
  const out = 0.62;
  kit.box(spot(along, 0.82, out), size(1.7, 1.2, 0.8), CHEST);
  for (let row = 0; row < 5; row += 1) {
    const y = 0.36 + row * 0.235;
    kit.box(spot(along, y, out + 0.41), size(1.54, 0.18, 0.02), CHEST_DRAWER);
    kit.box(spot(along, y, out + 0.43), size(0.8, 0.035, 0.03), HANDLE);
  }
  kit.box(spot(along, 1.46, out), size(1.76, 0.08, 0.86), LAMP_HOUSE);
  for (const dz of [-0.68, 0.68]) {
    kit.pole(spot(along + dz, 0.11, out + 0.2), [0.11, 0.11], 0.08, TYRE, {
      sides: 10,
      tilt: Math.PI / 2,
    });
  }
};

const shelfUnit = (
  kit: Kit,
  along: number,
  totes: readonly (readonly [number, string, number])[]
): void => {
  const out = 0.5;
  const wide = 1.7;
  for (const dz of [-wide / 2, wide / 2]) {
    kit.box(spot(along + dz, 1.3, out), size(0.07, 2.6, 0.7), RACK);
  }
  const shelves = [0.5, 1.2, 1.9, 2.56];
  for (const y of shelves) {
    kit.box(spot(along, y, out), size(wide, 0.06, 0.7), RACK);
  }
  for (const [dz, colour, y] of totes) {
    kit.box(
      spot(along + dz, y + 0.19, out + 0.06),
      size(0.56, 0.32, 0.5),
      colour
    );
    kit.box(
      spot(along + dz, y + 0.34, out + 0.06),
      size(0.6, 0.04, 0.54),
      "#20182c"
    );
  }
};

const backDoor = (kit: Kit, glow: Kit, along: number): void => {
  kit.box(spot(along, 1.32, 0.12), size(1.74, 2.64, 0.08), DOOR_FRAME);
  kit.box(spot(along, 1.28, 0.17), size(1.5, 2.54, 0.06), DOOR);
  kit.box(spot(along - 0.52, 1.25, 0.23), size(0.1, 0.1, 0.08), STEEL);
  glow.box(spot(along, 1.95, 0.2), size(0.74, 0.46, 0.02), "#ffbf73", {
    strength: 1.1,
  });
};

const wrench = (kit: Kit, along: number, top: number, long: number): void => {
  const out = 0.2;
  kit.box(spot(along, top - long / 2, out), size(0.06, long, 0.025), STEEL);
  kit.pole(spot(along, top, out), [0.095, 0.095], 0.025, STEEL, {
    ...FLAT_TO_WALL,
    sides: 10,
  });
  kit.pole(spot(along, top, out + 0.02), [0.045, 0.045], 0.02, HOLE, {
    ...FLAT_TO_WALL,
    sides: 8,
  });
};

const driver = (kit: Kit, along: number, top: number, colour: string): void => {
  const out = 0.2;
  kit.box(spot(along, top - 0.12, out), size(0.08, 0.25, 0.05), colour);
  kit.box(spot(along, top - 0.38, out), size(0.025, 0.3, 0.025), STEEL);
};

const pliers = (kit: Kit, along: number, top: number): void => {
  const out = 0.2;
  for (const lean of [-0.2, 0.2]) {
    kit.box(
      [ROOM.rightX - out, top - 0.2, along + lean * 0.42],
      [0.03, 0.42, 0.045],
      GRIP_RED,
      { tilt: lean }
    );
  }
  kit.box(spot(along, top + 0.08, out), size(0.08, 0.16, 0.03), STEEL);
};

const drill = (kit: Kit, along: number, top: number): void => {
  const out = 0.22;
  kit.box(spot(along, top, out), size(0.4, 0.17, 0.08), GRIP_YELLOW);
  kit.box(spot(along - 0.26, top, out), size(0.14, 0.06, 0.05), STEEL);
  kit.box(spot(along + 0.1, top - 0.2, out), size(0.1, 0.28, 0.07), "#2a2436");
};

const pegboard = (kit: Kit, centre: number, wide: number): void => {
  const low = 1.14;
  const tall = 1.72;
  kit.box(spot(centre, low + tall / 2, 0.15), size(wide, tall, 0.04), BOARD);
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 18; column += 1) {
      kit.box(
        spot(
          centre - wide / 2 + 0.1 + (column * (wide - 0.2)) / 17,
          low + 0.12 + row * 0.25,
          0.175
        ),
        size(0.024, 0.024, 0.008),
        HOLE
      );
    }
  }
  const left = centre - wide / 2 + 0.25;
  for (let tool = 0; tool < 7; tool += 1) {
    wrench(kit, left + tool * 0.26, 2.66, 0.46 + tool * 0.055);
  }
  for (let tool = 0; tool < 5; tool += 1) {
    driver(
      kit,
      left + 1.9 + tool * 0.16,
      2.68,
      tool % 2 === 0 ? GRIP_YELLOW : GRIP_RED
    );
  }
  drill(kit, left + 2.72, 2.46);
  pliers(kit, left + 0.3, 1.58);
  pliers(kit, left + 0.62, 1.58);
  for (const tool of [0, 1, 2]) {
    driver(kit, left + 1 + tool * 0.22, 1.76, GRIP_YELLOW);
  }
};

const bench = (kit: Kit, centre: number, wide: number): void => {
  const out = 0.62;
  kit.box(spot(centre, 0.98, out), size(wide, 0.08, 1), TOP);
  const bay = wide / 3;
  for (const slot of [-1, 0, 1]) {
    const along = centre + slot * bay;
    kit.box(
      spot(along, 0.47, out),
      size(bay - 0.05, 0.94, 0.9),
      slot === 0 ? DRAWER : CUPBOARD
    );
    for (const y of slot === 0 ? [0.18, 0.46, 0.74] : [0.48]) {
      kit.box(spot(along, y, out + 0.46), size(0.46, 0.035, 0.02), HAZARD_DARK);
      if (slot === 0 && y < 0.7) {
        kit.box(
          spot(along, y + 0.14, out + 0.46),
          size(bay - 0.12, 0.012, 0.012),
          "#a07a10"
        );
      }
    }
  }
  kit.box(spot(centre - 0.8, 1.12, out), size(0.56, 0.2, 0.36), GRIP_RED);
  kit.box(spot(centre - 0.8, 1.24, out), size(0.2, 0.04, 0.08), HAZARD_DARK);
  kit.pole(spot(centre + 0.55, 1.22, 0.42), [0.08, 0.1], 0.36, CYAN, {
    sides: 8,
  });
  kit.pole(spot(centre + 0.55, 1.44, 0.42), [0.03, 0.05], 0.09, HANDLE, {
    sides: 6,
  });
  kit.pole(spot(centre + 0.85, 1.22, 0.42), [0.08, 0.1], 0.36, GRIP_RED, {
    sides: 8,
  });
  kit.pole(spot(centre + 0.85, 1.44, 0.42), [0.03, 0.05], 0.09, HANDLE, {
    sides: 6,
  });
  kit.box(spot(centre + 1.35, 1.15, out), size(0.52, 0.26, 0.42), "#d8862a");
};

const barrels = (kit: Kit): void => {
  for (const [along, out] of [
    [1.05, 0.62],
    [0.95, 1.6],
  ] as const) {
    const [x, , z] = spot(along, 0, out);
    kit.pole([x, 0.52, z], [0.42, 0.42], 1.04, BARREL, { sides: 16 });
    for (const y of [0.04, 0.52, 1.02]) {
      kit.pole([x, y, z], [0.44, 0.44], 0.05, BARREL_BAND, { sides: 16 });
    }
  }
};

const drain = (kit: Kit, glow: Kit): void => {
  const z = -0.65;
  kit.box([7.6, 0.006, z], [9, 0.02, 0.42], "#191320");
  for (let x = 3.3; x < 12; x += 0.3) {
    kit.box([x, 0.014, z], [0.08, 0.02, 0.36], "#4a3d58");
  }
  for (let x = 3.4; x < 12; x += 1.1) {
    glow.box([x, 0.012, z + 0.42], [0.62, 0.012, 0.13], HAZARD, {
      strength: 0.9,
    });
  }
};

const loft = (kit: Kit): void => {
  const { y } = MEZZANINE;
  for (const [x, z, wide] of [
    [11.4, -7.4, 1.5],
    [12, -5.8, 1.1],
    [11.3, -0.6, 1.3],
  ] as const) {
    kit.box([x, y + wide / 3, z], [wide, (wide * 2) / 3, wide], CRATE);
  }
  for (const [x, z, stack] of [
    [10.4, -3.4, 3],
    [11.5, -2.6, 2],
  ] as const) {
    for (let tyre = 0; tyre < stack; tyre += 1) {
      kit.pole([x, y + 0.15 + tyre * 0.26, z], [0.42, 0.42], 0.24, TYRE, {
        sides: 14,
      });
    }
  }
};

const helmetRack = (kit: Kit, along: number): void => {
  kit.box(spot(along, 2.98, 0.26), size(1.5, 0.05, 0.42), RACK);
  for (const [dz, colour] of [
    [-0.48, MAGENTA],
    [0, CYAN],
    [0.48, YELLOW],
  ] as const) {
    kit.ball(spot(along + dz, 3.16, 0.3), 0.16, colour);
    kit.box(spot(along + dz, 3.14, 0.44), size(0.2, 0.08, 0.04), HAZARD_DARK);
  }
};

export const buildGarage = (kit: Kit, glow: Kit): void => {
  panels(kit);
  ceilingWork(kit, glow);
  hazardColumn(kit);
  chest(kit, -7.25);
  shelfUnit(kit, -5.5, [
    [-0.45, DRAWER, 0.5],
    [0.3, TOTE_GREY, 1.2],
    [-0.4, TOTE_PINK, 1.9],
    [0.3, TOTE_BLUE, 0.5],
    [-0.1, TOTE_GREY, 1.2],
  ]);
  helmetRack(kit, -3.75);
  backDoor(kit, glow, -3.75);
  pegboard(kit, -1.1, 3.3);
  bench(kit, -1.1, 3.3);
  barrels(kit);
  drain(kit, glow);
  loft(kit);
};
