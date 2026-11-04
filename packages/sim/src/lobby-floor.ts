import { hypot2 } from "@racer/track/math";

export interface Spot {
  x: number;
  z: number;
}

interface Solid {
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly round: boolean;
  readonly top: number;
}

export interface Stool {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export interface Plinth {
  readonly height: number;
  readonly radius: number;
  readonly x: number;
  readonly z: number;
}

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

export const PLINTH: Plinth = { height: 0.42, radius: 2.9, x: -0.6, z: 2.9 };
export const GARAGE_PLINTH: Plinth = {
  height: 0.42,
  radius: 2.2,
  x: 7,
  z: -3.75,
};
export const MEZZANINE = {
  backZ: -9,
  frontZ: 1.5,
  leftX: 8.6,
  y: 4.3,
} as const;

export const FURNITURE = {
  booths: [-0.3, 4.4],
  counterZ: -3.9,
  planters: [
    [-11.8, 8.6],
    [-12.25, -3.7],
  ],
  pool: { x: 6.4, z: 6.6 },
  tables: [
    [-5.4, 7.6],
    [-6.9, 2.9],
  ],
  taps: { x: -3.75, z: -3.9 },
} as const;

export const BAR_STOOL_ROW = {
  count: 6,
  firstX: -9.2,
  spacing: 1.55,
  z: FURNITURE.counterZ + 1.25,
} as const;

export const TABLE_STOOLS = [
  [-1, 0.3],
  [0.9, 0.55],
] as const;

const block = (
  x: number,
  z: number,
  wide: number,
  deep: number,
  top: number
): Solid => ({ halfX: wide / 2, halfZ: deep / 2, round: false, top, x, z });

const circle = (x: number, z: number, radius: number, top: number): Solid => ({
  halfX: radius,
  halfZ: radius,
  round: true,
  top,
  x,
  z,
});

const STOOL_RADIUS = 0.28;

const barStools: readonly Stool[] = Array.from(
  { length: BAR_STOOL_ROW.count },
  (_, seat) => ({
    heading: 0,
    x: BAR_STOOL_ROW.firstX + seat * BAR_STOOL_ROW.spacing,
    z: BAR_STOOL_ROW.z,
  })
);

const tableStools: readonly Stool[] = FURNITURE.tables.flatMap(([x, z]) =>
  TABLE_STOOLS.map(([dx, dz]) => ({
    heading: dx < 0 ? -Math.PI / 2 : Math.PI / 2,
    x: x + dx,
    z: z + dz,
  }))
);

export const STOOLS: readonly Stool[] = [...barStools, ...tableStools];

const SOLIDS: readonly Solid[] = [
  block(-5, FURNITURE.counterZ, 11.3, 1.15, 1.2),
  block(0.25, -6.2, 1.15, 4.1, 1.2),
  block(-6.2, -8.63, 11.4, 0.7, 4.8),
  block(ROOM.leftX + 0.5, -8.6, 0.9, 0.8, 10),
  block(0.7, -8.65, 0.9, 0.8, 5),
  block(8.2, -8.65, 0.9, 0.8, 5),
  block(ROOM.rightX - 0.5, 6, 0.9, 0.9, 10),
  block(MEZZANINE.leftX + 0.1, MEZZANINE.frontZ + 0.02, 0.5, 0.5, 4),
  block(ROOM.rightX - 0.4, MEZZANINE.frontZ - 0.3, 0.3, 0.3, 4),
  block(MEZZANINE.leftX + 0.3, MEZZANINE.backZ + 0.55, 0.9, 0.9, 4),
  ...FURNITURE.booths.map((z) => block(ROOM.leftX + 1.3, z, 2, 3.62, 1.5)),
  block(FURNITURE.pool.x, FURNITURE.pool.z, 4.1, 2.4, 1),
  ...FURNITURE.planters.map(([x, z]) => block(x, z, 0.9, 0.9, 1.8)),
  block(12.38, -7.25, 0.86, 1.76, 1.5),
  block(12.5, -5.5, 0.7, 1.7, 2.6),
  block(12.38, -1.1, 1, 3.3, 1.1),
  circle(12.38, 1.05, 0.44, 1.05),
  circle(11.4, 0.95, 0.44, 1.05),
  circle(PLINTH.x, PLINTH.z, PLINTH.radius + 0.2, PLINTH.height),
  circle(
    GARAGE_PLINTH.x,
    GARAGE_PLINTH.z,
    GARAGE_PLINTH.radius + 0.2,
    GARAGE_PLINTH.height
  ),
  ...FURNITURE.tables.map(([x, z]) => circle(x, z, 0.62, 1.2)),
  ...STOOLS.map(({ x, z }) => circle(x, z, STOOL_RADIUS, 0.9)),
];

const FLOOR = {
  maxX: ROOM.rightX - 0.35,
  maxZ: ROOM.frontZ - 0.6,
  minX: ROOM.leftX + 0.35,
  minZ: ROOM.backZ + 0.3,
} as const;

const clearOfCircle = (spot: Spot, solid: Solid, radius: number): void => {
  const dx = spot.x - solid.x;
  const dz = spot.z - solid.z;
  const reach = solid.halfX + radius;
  const away = hypot2(dx, dz);
  if (away < reach) {
    spot.x = solid.x + (away === 0 ? reach : (dx / away) * reach);
    spot.z = solid.z + (away === 0 ? 0 : (dz / away) * reach);
  }
};

const clearOfBlock = (spot: Spot, solid: Solid, radius: number): void => {
  const dx = spot.x - solid.x;
  const dz = spot.z - solid.z;
  const outX = Math.abs(dx) - solid.halfX;
  const outZ = Math.abs(dz) - solid.halfZ;
  if (outX >= radius || outZ >= radius) {
    return;
  }
  if (outX > 0 && outZ > 0) {
    const away = hypot2(outX, outZ);
    if (away < radius) {
      const push = (radius - away) / away;
      spot.x += (dx < 0 ? -outX : outX) * push;
      spot.z += (dz < 0 ? -outZ : outZ) * push;
    }
  } else if (outX > outZ) {
    spot.x = solid.x + (dx < 0 ? -1 : 1) * (solid.halfX + radius);
  } else {
    spot.z = solid.z + (dz < 0 ? -1 : 1) * (solid.halfZ + radius);
  }
};

const clearOfOther = (spot: Spot, other: Spot, reach: number): void => {
  const dx = spot.x - other.x;
  const dz = spot.z - other.z;
  const away = hypot2(dx, dz);
  if (away < reach && away > 0) {
    spot.x = other.x + (dx / away) * reach;
    spot.z = other.z + (dz / away) * reach;
  }
};

const SETTLE_PASSES = 2;

export const settleOnFloor = (
  spot: Spot,
  radius: number,
  others: readonly Spot[],
  otherRadius: number
): void => {
  for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
    for (const solid of SOLIDS) {
      if (solid.round) {
        clearOfCircle(spot, solid, radius);
      } else {
        clearOfBlock(spot, solid, radius);
      }
    }
    for (const other of others) {
      clearOfOther(spot, other, radius + otherRadius);
    }
    spot.x = Math.min(FLOOR.maxX, Math.max(FLOOR.minX, spot.x));
    spot.z = Math.min(FLOOR.maxZ, Math.max(FLOOR.minZ, spot.z));
  }
};

const CELL = 0.25;
const ROUTE_CLEARANCE = 0.3;
const COLUMNS = Math.ceil((FLOOR.maxX - FLOOR.minX) / CELL) + 1;
const ROWS = Math.ceil((FLOOR.maxZ - FLOOR.minZ) / CELL) + 1;

const cellX = (cell: number): number => FLOOR.minX + (cell % COLUMNS) * CELL;
const cellZ = (cell: number): number =>
  FLOOR.minZ + Math.floor(cell / COLUMNS) * CELL;

const clearOfSolid = (cell: number, solid: Solid): boolean => {
  const dx = cellX(cell) - solid.x;
  const dz = cellZ(cell) - solid.z;
  return solid.round
    ? hypot2(dx, dz) >= solid.halfX + ROUTE_CLEARANCE
    : Math.abs(dx) >= solid.halfX + ROUTE_CLEARANCE ||
        Math.abs(dz) >= solid.halfZ + ROUTE_CLEARANCE;
};

const OPEN_CELLS: readonly boolean[] = Array.from(
  { length: COLUMNS * ROWS },
  (_, cell) => SOLIDS.every((solid) => clearOfSolid(cell, solid))
);

const openAt = ({ x, z }: Spot): boolean => {
  const column = Math.round((x - FLOOR.minX) / CELL);
  const row = Math.round((z - FLOOR.minZ) / CELL);
  return (
    column >= 0 &&
    column < COLUMNS &&
    row >= 0 &&
    row < ROWS &&
    OPEN_CELLS[row * COLUMNS + column] === true
  );
};

const nearestCell = (spot: Spot, candidates: Iterable<number>): number => {
  let best = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const cell of candidates) {
    const away = hypot2(cellX(cell) - spot.x, cellZ(cell) - spot.z);
    if (away < nearest) {
      nearest = away;
      best = cell;
    }
  }
  return best;
};

const sideCells = (cell: number): readonly number[] => {
  const column = cell % COLUMNS;
  return [
    column > 0 ? cell - 1 : -1,
    column < COLUMNS - 1 ? cell + 1 : -1,
    cell - COLUMNS,
    cell + COLUMNS,
  ];
};

const reachableFrom = (start: number): Map<number, number> => {
  const cameFrom = new Map([[start, start]]);
  for (const cell of cameFrom.keys()) {
    for (const side of sideCells(cell)) {
      if (OPEN_CELLS[side] === true && !cameFrom.has(side)) {
        cameFrom.set(side, cell);
      }
    }
  }
  return cameFrom;
};

const inSight = (from: Spot, to: Spot): boolean => {
  const steps = Math.ceil(hypot2(to.x - from.x, to.z - from.z) / (CELL / 2));
  for (let step = 1; step <= steps; step += 1) {
    const share = step / steps;
    const x = from.x + (to.x - from.x) * share;
    const z = from.z + (to.z - from.z) * share;
    if (!openAt({ x, z })) {
      return false;
    }
  }
  return true;
};

export const routeAcrossFloor = (from: Spot, to: Spot): Spot[] => {
  const openCells = OPEN_CELLS.flatMap((isOpen, cell) =>
    isOpen ? [cell] : []
  );
  const cameFrom = reachableFrom(nearestCell(from, openCells));
  const walked: Spot[] = [];
  let cell = nearestCell(to, cameFrom.keys());
  let parent = cameFrom.get(cell);
  while (parent !== undefined && parent !== cell) {
    walked.push({ x: cellX(cell), z: cellZ(cell) });
    cell = parent;
    parent = cameFrom.get(cell);
  }
  walked.reverse();
  if (openAt(to)) {
    walked.push({ x: to.x, z: to.z });
  }
  const route: Spot[] = [];
  let anchor: Spot = { x: cellX(cell), z: cellZ(cell) };
  for (let index = 0; index < walked.length; index += 1) {
    const here = walked[index];
    const next = walked[index + 1];
    if (here && (!next || !inSight(anchor, next))) {
      route.push(here);
      anchor = here;
    }
  }
  return route;
};

export const heightOfSolidsAt = (x: number, z: number): number => {
  let top = 0;
  for (const solid of SOLIDS) {
    const dx = x - solid.x;
    const dz = z - solid.z;
    const inside = solid.round
      ? hypot2(dx, dz) < solid.halfX
      : Math.abs(dx) < solid.halfX && Math.abs(dz) < solid.halfZ;
    if (inside) {
      top = Math.max(top, solid.top);
    }
  }
  return top;
};
