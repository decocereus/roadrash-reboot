import {
  BAR_STOOL_ROW,
  FURNITURE,
  GARAGE_PLINTH,
  PLINTH,
  ROOM,
  TABLE_STOOLS,
} from "@racer/sim/lobby-floor";
import type { Plinth } from "@racer/sim/lobby-floor";

import type { Kit } from "./bar-kit.ts";
import { CYAN, MAGENTA, ORANGE, RED, YELLOW } from "./looks.ts";

const WOOD = "#5c3142";
const WOOD_DARK = "#3f2234";
const LEATHER = "#b22844";
const LEATHER_DARK = "#7c1b38";
const SHELF = "#2b1a3a";
const STEEL = "#4d3f63";
const METAL = "#8a86a8";
const AMBER = "#ffc66b";
const BOTTLES = [
  YELLOW,
  CYAN,
  MAGENTA,
  ORANGE,
  "#7bff9e",
  RED,
  "#ffe9c7",
] as const;

const pickOf = <Item>(items: readonly Item[], index: number, fallback: Item) =>
  items[index % items.length] ?? fallback;

const bottleShelves = (glow: Kit): void => {
  const z = ROOM.backZ + 0.32;
  let index = 0;
  for (const y of [1.2, 1.95, 2.7, 3.45]) {
    for (let x = -11.4; x < -0.9; x += 0.34) {
      if ((index * 7) % 11 !== 3) {
        const colour = pickOf(BOTTLES, index * 3 + (index % 4), YELLOW);
        glow.pole([x, y + 0.2, z], [0.05, 0.08], 0.36, colour, {
          sides: 6,
          strength: 0.85,
        });
        glow.pole([x, y + 0.45, z], [0.025, 0.03], 0.14, colour, {
          sides: 5,
          strength: 0.85,
        });
      }
      index += 1;
    }
  }
};

const backBar = (kit: Kit, glow: Kit): void => {
  const z = ROOM.backZ + 0.32;
  kit.box([-6.2, 2.4, ROOM.backZ + 0.08], [11.4, 4.8, 0.16], "#1d1029");
  for (const y of [1.2, 1.95, 2.7, 3.45]) {
    kit.box([-6.2, y, z], [11, 0.06, 0.5], SHELF);
    glow.box([-6.2, y - 0.05, z + 0.26], [10.8, 0.03, 0.03], YELLOW, {
      strength: 1.7,
    });
  }
  kit.box([-6.2, 0.45, z + 0.05], [11.4, 0.9, 0.7], WOOD_DARK);
  kit.box([-6.2, 4.75, -8.1], [11.8, 0.7, 2.1], "#2f1c3f");
  glow.box([-6.2, 4.36, -7.06], [11.7, 0.07, 0.05], MAGENTA, { strength: 2.8 });
  glow.box([-6.2, 5.12, -7.06], [11.7, 0.05, 0.05], YELLOW, { strength: 2 });
  bottleShelves(glow);
};

const counter = (kit: Kit, glow: Kit): void => {
  const front = FURNITURE.counterZ;
  kit.box([-5, 0.55, front], [11, 1.1, 0.9], WOOD);
  kit.box([-5, 1.16, front], [11.3, 0.1, 1.15], "#b0623f");
  kit.box([0.25, 0.55, -6.2], [0.9, 1.1, 3.8], WOOD);
  kit.box([0.25, 1.16, -6.2], [1.15, 0.1, 4.1], "#b0623f");
  glow.box([-5, 1.09, front + 0.58], [11.3, 0.05, 0.03], YELLOW, {
    strength: 3,
  });
  glow.box([-5, 0.1, front + 0.47], [11, 0.05, 0.03], ORANGE, {
    strength: 2.2,
  });
  glow.box([0.84, 1.09, -6.2], [0.03, 0.05, 4.1], YELLOW, { strength: 3 });
  for (const x of [
    FURNITURE.taps.x - 0.25,
    FURNITURE.taps.x,
    FURNITURE.taps.x + 0.25,
  ]) {
    kit.pole([x, 1.5, front], [0.03, 0.04], 0.6, METAL);
    glow.pole([x, 1.86, front], [0.05, 0.03], 0.14, AMBER, { strength: 1.3 });
  }
  kit.box([FURNITURE.taps.x, 1.3, front], [0.9, 0.14, 0.2], METAL);
  const { count, firstX, spacing, z } = BAR_STOOL_ROW;
  for (let seat = 0; seat < count; seat += 1) {
    const x = firstX + seat * spacing;
    kit.pole([x, 0.4, z], [0.05, 0.06], 0.8, STEEL, { sides: 6 });
    kit.pole([x, 0.84, z], [0.25, 0.23], 0.13, "#d81f5f", {
      sides: 14,
    });
    kit.pole([x, 0.03, z], [0.2, 0.22], 0.06, STEEL, { sides: 10 });
  }
};

const booth = (kit: Kit, glow: Kit, z: number): void => {
  const x = ROOM.leftX + 1.3;
  for (const offset of [-1.25, 1.25]) {
    kit.box([x, 0.25, z + offset], [2, 0.5, 0.8], LEATHER_DARK);
    kit.box([x, 0.55, z + offset], [2, 0.14, 0.82], LEATHER);
    kit.box(
      [x, 0.95, z + offset + (offset > 0 ? 0.42 : -0.42)],
      [2, 1.1, 0.28],
      LEATHER
    );
  }
  kit.box([x, 0.76, z], [1.5, 0.08, 1.1], "#3a2838");
  kit.pole([x, 0.38, z], [0.08, 0.1], 0.72, WOOD_DARK);
  glow.box([x, 0.92, z], [0.2, 0.24, 0.2], AMBER, { strength: 2 });
};

const roundTable = (kit: Kit, glow: Kit, x: number, z: number): void => {
  kit.pole([x, 0.55, z], [0.05, 0.06], 1.1, STEEL, { sides: 8 });
  kit.pole([x, 1.12, z], [0.62, 0.62], 0.06, "#3a2838", { sides: 18 });
  kit.pole([x, 0.03, z], [0.3, 0.32], 0.06, STEEL);
  glow.box([x, 1.3, z], [0.2, 0.3, 0.2], AMBER, { strength: 2 });
  for (const [dx, dz] of TABLE_STOOLS) {
    kit.pole([x + dx, 0.38, z + dz], [0.04, 0.05], 0.76, STEEL, { sides: 6 });
    kit.pole([x + dx, 0.8, z + dz], [0.23, 0.21], 0.12, "#d81f5f", {
      sides: 12,
    });
  }
};

const poolTable = (kit: Kit, glow: Kit): void => {
  const { x, z } = FURNITURE.pool;
  kit.box([x, 0.02, z], [6.2, 0.04, 4.8], "#8c2a54");
  kit.box([x, 0.62, z], [4.1, 0.34, 2.4], "#3c2230");
  kit.box([x, 0.82, z], [3.7, 0.04, 2], "#1aa59a");
  for (const [dx, dz, w, d] of [
    [0, -1.1, 4, 0.2],
    [0, 1.1, 4, 0.2],
    [-1.95, 0, 0.2, 2.4],
    [1.95, 0, 0.2, 2.4],
  ] as const) {
    kit.box([x + dx, 0.88, z + dz], [w, 0.14, d], "#5c3142");
  }
  for (const [dx, dz] of [
    [-1.7, -0.9],
    [1.7, -0.9],
    [-1.7, 0.9],
    [1.7, 0.9],
  ] as const) {
    kit.box([x + dx, 0.24, z + dz], [0.34, 0.5, 0.34], "#2d1824");
  }
  for (const [dx, dz, colour] of [
    [0.4, 0.2, MAGENTA],
    [0.9, -0.3, YELLOW],
    [-0.9, 0.1, "#ffffff"],
    [1.05, 0.25, ORANGE],
  ] as const) {
    kit.ball([x + dx, 0.91, z + dz], 0.07, colour);
  }
  kit.box([x - 0.2, 0.92, z + 0.5], [1.5, 0.03, 0.03], "#e0c090", {
    yaw: 0.25,
  });
  glow.box([x, 0.47, z + 1.22], [4, 0.04, 0.03], YELLOW, { strength: 2.4 });
  glow.box([x, 0.47, z - 1.22], [4, 0.04, 0.03], YELLOW, { strength: 2.4 });
};

const plinth = (
  kit: Kit,
  glow: Kit,
  { height, radius, x, z }: Plinth
): void => {
  kit.pole(
    [x, height * 0.22, z],
    [radius + 0.18, radius + 0.2],
    height * 0.44,
    "#2a1a38",
    {
      sides: 40,
    }
  );
  glow.pole(
    [x, height * 0.56, z],
    [radius + 0.03, radius + 0.03],
    height * 0.24,
    CYAN,
    {
      sides: 40,
      strength: 2.5,
    }
  );
  kit.pole(
    [x, height * 0.85, z],
    [radius - 0.05, radius],
    height * 0.3,
    "#c4813f",
    {
      sides: 40,
    }
  );
};

const railing = (kit: Kit, glow: Kit): void => {
  for (let x = -6.5; x < 0; x += 1.4) {
    kit.box([x, 0.55, 10.6], [0.07, 1.1, 0.07], "#1f132c");
  }
  kit.box([-3.2, 1.12, 10.6], [6.6, 0.09, 0.09], "#1f132c");
  glow.box([-3.2, 1.2, 10.6], [6.6, 0.04, 0.04], YELLOW, { strength: 2.2 });
};

const planter = (kit: Kit, x: number, z: number): void => {
  kit.box([x, 0.4, z], [0.9, 0.8, 0.9], "#34204a");
  for (let leaf = 0; leaf < 7; leaf += 1) {
    const yaw = leaf * 0.9;
    kit.box(
      [x + Math.sin(yaw) * 0.32, 1.25, z + Math.cos(yaw) * 0.32],
      [0.14, 1.1, 0.03],
      leaf % 2 === 0 ? "#2f6a5a" : "#3f8a6a",
      { tilt: 0.35, yaw }
    );
  }
};

export const buildProps = (kit: Kit, glow: Kit): void => {
  backBar(kit, glow);
  counter(kit, glow);
  for (const z of FURNITURE.booths) {
    booth(kit, glow, z);
  }
  for (const [x, z] of FURNITURE.tables) {
    roundTable(kit, glow, x, z);
  }
  poolTable(kit, glow);
  plinth(kit, glow, PLINTH);
  plinth(kit, glow, GARAGE_PLINTH);
  railing(kit, glow);
  for (const [x, z] of FURNITURE.planters) {
    planter(kit, x, z);
  }
};
