import type { Kit } from "./bar-kit.ts";
import { CYAN, MAGENTA, ORANGE, YELLOW } from "./looks.ts";

export const ROOM = {
  backZ: -9,
  ceiling: 10,
  doorCentre: 4.6,
  doorHeight: 4.7,
  doorLeft: 1.4,
  doorRight: 7.8,
  frontZ: 11,
  leftX: -13,
  rightX: 13,
  skyBottom: 5.3,
  skyLeft: -13,
  skyRight: -6.2,
  skyTop: 9,
  windowBottom: 0.5,
  windowTop: 8,
} as const;

export const PLINTH = { height: 0.42, radius: 2.9, x: -0.6, z: 2.9 } as const;
export const MEZZANINE = {
  backZ: -9,
  frontZ: 1.5,
  leftX: 8.6,
  y: 4.3,
} as const;

const WALL = "#57307a";
const WALL_LOW = "#44245e";
const STEEL = "#33204a";
const STEEL_LIGHT = "#59456f";
const LAMP_HOUSE = "#2a1a38";
const LAMP = "#ffd27a";
const TILES = ["#70457a", "#684070", "#784c80", "#6c4274", "#624068"] as const;

const hash = (x: number, z: number): number =>
  Math.floor(Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43_758.5453) * 1000);

const tileOf = (x: number, z: number): string =>
  TILES[hash(x, z) % TILES.length] ?? TILES[0];

export const buildFloor = (kit: Kit): void => {
  const tile = 1.6;
  for (let x = ROOM.leftX; x < ROOM.rightX; x += tile) {
    for (let z = ROOM.backZ; z < ROOM.frontZ; z += tile) {
      kit.box(
        [x + tile / 2, -0.05, z + tile / 2],
        [tile, 0.1, tile],
        tileOf(x, z)
      );
    }
  }
};

const buildBackWall = (kit: Kit): void => {
  const { backZ, ceiling, doorHeight, doorLeft, doorRight, leftX, rightX } =
    ROOM;
  const z = backZ - 0.2;
  const { skyLeft, skyRight, skyTop, skyBottom } = ROOM;
  kit.box(
    [(leftX + doorLeft) / 2, skyBottom / 2, z],
    [doorLeft - leftX, skyBottom, 0.4],
    WALL
  );
  kit.box(
    [(skyRight + doorLeft) / 2, (skyBottom + ceiling) / 2, z],
    [doorLeft - skyRight, ceiling - skyBottom, 0.4],
    WALL
  );
  kit.box(
    [(leftX + skyRight) / 2, (skyTop + ceiling) / 2, z],
    [skyRight - leftX, ceiling - skyTop, 0.4],
    WALL
  );
  kit.box(
    [(leftX + skyLeft) / 2, (skyBottom + skyTop) / 2, z],
    [skyLeft - leftX, skyTop - skyBottom, 0.4],
    WALL
  );
  kit.box(
    [(doorRight + rightX) / 2, ceiling / 2, z],
    [rightX - doorRight, ceiling, 0.4],
    WALL
  );
  kit.box(
    [(doorLeft + doorRight) / 2, (doorHeight + ceiling) / 2, z],
    [doorRight - doorLeft, ceiling - doorHeight, 0.4],
    WALL
  );
};

const buildLeftWall = (kit: Kit): void => {
  const { backZ, ceiling, frontZ, leftX, windowBottom, windowTop } = ROOM;
  const span = frontZ - backZ;
  const middle = (frontZ + backZ) / 2;
  kit.box(
    [leftX - 0.2, windowBottom / 2, middle],
    [0.4, windowBottom, span],
    WALL_LOW
  );
  kit.box(
    [leftX - 0.2, (windowTop + ceiling) / 2, middle],
    [0.4, ceiling - windowTop, span],
    WALL
  );
};

export const buildShell = (kit: Kit): void => {
  buildBackWall(kit);
  buildLeftWall(kit);
  const { backZ, ceiling, frontZ, leftX, rightX } = ROOM;
  kit.box(
    [rightX + 0.2, ceiling / 2, (frontZ + backZ) / 2],
    [0.4, ceiling, frontZ - backZ],
    WALL
  );
  kit.box(
    [0, ceiling + 0.2, (frontZ + backZ) / 2],
    [rightX - leftX + 0.8, 0.4, frontZ - backZ],
    "#26163a"
  );
};

const buildWindowFrames = (kit: Kit): void => {
  const { backZ, frontZ, leftX, windowBottom, windowTop } = ROOM;
  const height = windowTop - windowBottom;
  const centre = (windowTop + windowBottom) / 2;
  for (let z = backZ; z <= frontZ; z += 4) {
    kit.box([leftX, centre, z], [0.26, height, 0.3], STEEL);
  }
  kit.box(
    [leftX, 2.8, (frontZ + backZ) / 2],
    [0.16, 0.12, frontZ - backZ],
    STEEL
  );
  kit.box(
    [leftX, 5.4, (frontZ + backZ) / 2],
    [0.16, 0.12, frontZ - backZ],
    STEEL
  );
};

const buildSkyFrames = (kit: Kit): void => {
  const { backZ, skyBottom, skyRight, skyTop } = ROOM;
  const z = backZ - 0.1;
  const height = skyTop - skyBottom;
  for (let x = -12; x <= skyRight; x += 2.27) {
    kit.box([x, skyBottom + height / 2, z], [0.2, height, 0.3], STEEL);
  }
  kit.box([-9.6, 7.2, z], [6.8, 0.12, 0.16], STEEL);
};

const buildTrusses = (kit: Kit): void => {
  const { ceiling, leftX, rightX } = ROOM;
  for (const z of [-5, -1, 3, 7]) {
    kit.box([0, ceiling - 0.5, z], [rightX - leftX, 0.5, 0.4], STEEL);
    kit.box([0, ceiling - 1.5, z], [rightX - leftX, 0.14, 0.2], STEEL_LIGHT);
    for (let x = leftX + 1; x < rightX; x += 2.4) {
      kit.box([x, ceiling - 1, z], [0.12, 1, 0.12], STEEL_LIGHT, {
        tilt: 0,
        yaw: 0,
      });
    }
  }
  kit.box([-5, ceiling - 0.8, 2], [0.9, 0.8, 22], "#2c1d42");
  kit.box([7, ceiling - 0.8, 2], [0.5, 0.5, 22], "#4a3560");
};

export const LAMP_SPOTS = [
  [-6.5, -1.2],
  [1.2, -2.6],
  [-0.6, 3.4],
  [7, 6.2],
  [-7.5, 5.6],
] as const;

const buildLamps = (kit: Kit, glow: Kit): void => {
  for (const [x, z] of LAMP_SPOTS) {
    kit.box([x, 8.1, z], [4.4, 0.34, 0.9], LAMP_HOUSE);
    kit.box([x - 1.6, 8.9, z], [0.05, 1.3, 0.05], STEEL_LIGHT);
    kit.box([x + 1.6, 8.9, z], [0.05, 1.3, 0.05], STEEL_LIGHT);
    glow.box([x, 7.91, z], [4.1, 0.06, 0.66], LAMP, { strength: 3.1 });
  }
};

const buildColumns = (kit: Kit): void => {
  kit.box([ROOM.leftX + 0.5, 5, -8.6], [0.9, 10, 0.8], STEEL);
  kit.box([ROOM.rightX - 0.5, 5, 6], [0.9, 10, 0.9], STEEL);
  kit.box([0.7, 2.5, -8.65], [0.9, 5, 0.8], STEEL);
  kit.box([8.2, 2.5, -8.65], [0.9, 5, 0.8], STEEL);
  for (let band = 0; band < 8; band += 1) {
    kit.box(
      [MEZZANINE.leftX + 0.1, 0.13 + band * 0.26, MEZZANINE.frontZ + 0.02],
      [0.48, 0.25, 0.48],
      band % 2 === 0 ? "#ffc21a" : "#17121f"
    );
  }
};

const buildMezzanine = (kit: Kit, glow: Kit): void => {
  const { backZ, frontZ, leftX, y } = MEZZANINE;
  const { rightX } = ROOM;
  const across = (leftX + rightX) / 2;
  const along = (frontZ + backZ) / 2;
  kit.box(
    [across, y - 0.15, along],
    [rightX - leftX, 0.3, frontZ - backZ],
    STEEL
  );
  kit.box(
    [leftX + 0.1, y / 2 - 0.15, frontZ + 0.02],
    [0.42, y - 0.3, 0.42],
    STEEL
  );
  kit.box([rightX - 0.4, y / 2, frontZ - 0.3], [0.3, y, 0.3], STEEL_LIGHT);
  kit.box([leftX, y + 0.95, along], [0.08, 0.08, frontZ - backZ], STEEL_LIGHT);
  kit.box(
    [across, y + 0.95, frontZ],
    [rightX - leftX, 0.08, 0.08],
    STEEL_LIGHT
  );
  for (let z = backZ + 1; z < frontZ; z += 1.2) {
    kit.box([leftX, y + 0.45, z], [0.05, 0.95, 0.05], STEEL_LIGHT);
  }
  glow.box(
    [leftX - 0.05, y - 0.32, along],
    [0.06, 0.08, frontZ - backZ],
    MAGENTA,
    { strength: 2.6 }
  );
  glow.box(
    [across, y - 0.32, frontZ + 0.05],
    [rightX - leftX, 0.08, 0.06],
    MAGENTA,
    { strength: 2.6 }
  );
};

export interface DoorParts {
  readonly slats: Kit;
  readonly slatGlow: Kit;
}

export const buildDoor = ({ slats, slatGlow }: DoorParts): void => {
  const { doorHeight, doorLeft, doorRight } = ROOM;
  const width = doorRight - doorLeft;
  const centre = ROOM.doorCentre;
  const count = 12;
  const slat = doorHeight / count;
  for (let row = 0; row < count; row += 1) {
    slats.box(
      [centre, slat * (row + 0.5), 0],
      [width, slat * 0.86, 0.14],
      row % 2 === 0 ? "#3e3460" : "#332a54"
    );
  }
  for (const [row, colour] of [
    [1, CYAN],
    [2, MAGENTA],
    [10, MAGENTA],
    [11, CYAN],
  ] as const) {
    slatGlow.box(
      [centre, slat * row, 0.09],
      [width * 0.74, 0.07, 0.03],
      colour,
      { strength: 2.8 }
    );
  }
};

const buildDoorFrame = (kit: Kit, glow: Kit): void => {
  const { backZ, doorHeight, doorLeft, doorRight } = ROOM;
  const z = backZ + 0.05;
  kit.box([doorLeft - 0.1, doorHeight / 2, z], [0.22, doorHeight, 0.4], STEEL);
  kit.box([doorRight + 0.1, doorHeight / 2, z], [0.22, doorHeight, 0.4], STEEL);
  kit.box(
    [(doorLeft + doorRight) / 2, doorHeight + 0.14, z],
    [doorRight - doorLeft + 0.4, 0.3, 0.45],
    STEEL
  );
  for (const x of [doorLeft - 0.9, doorRight + 0.9]) {
    glow.box([x, 2.5, backZ + 0.02], [0.1, 1.5, 0.05], YELLOW, {
      strength: 2.2,
    });
  }
};

const buildWallNeon = (glow: Kit): void => {
  const { backZ } = ROOM;
  const z = backZ + 0.03;
  for (const [x, y, w, colour] of [
    [7.6, 8, 5.2, MAGENTA],
    [7.6, 7.5, 5.2, CYAN],
  ] as const) {
    glow.box([x, y, z], [w, 0.09, 0.05], colour, { strength: 2.8 });
  }
  glow.box([ROOM.rightX - 0.03, 8.1, -3.8], [0.05, 0.09, 8.5], ORANGE, {
    strength: 2.4,
  });
};

export const buildCeiling = (kit: Kit, glow: Kit): void => {
  buildWindowFrames(kit);
  buildSkyFrames(kit);
  buildTrusses(kit);
  buildLamps(kit, glow);
};

export const buildFixtures = (kit: Kit, glow: Kit): void => {
  buildColumns(kit);
  buildMezzanine(kit, glow);
  buildDoorFrame(kit, glow);
  buildWallNeon(glow);
};
