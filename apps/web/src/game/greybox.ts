import { createRandom } from "@racer/track/random";
import type {
  GroundCover,
  GroundPoint,
  Scenery,
  SceneryBlock,
  SceneryWater,
  Track,
} from "@racer/track/track";
import * as THREE from "three";

import type { Shading } from "./cel.ts";
import { lifted, rolling, smoothstep } from "./ground.ts";
import type { Look } from "./looks.ts";

const ROAD_STEP = 4;
const GROUND_STEP = 8;
const GROUND_MARGIN = 200;
const FAR_STEPS = [16, 32, 64, 128, 256, 512, 1024];
const ROAD_DROP = 0.3;
const LAKE_BANK = 0.4;
const LAKE_FLOOR = 2;
const BLOCK_SINK = 1;
const TREE_STEP = 14;
const TREE_REACH = 300;
const TREE_CLEARANCE = 4;
const SHORE_CLEARANCE = 3;
const BLOCK_COLOUR = "#8c8c94";
const WATER_COLOUR = "#3d6f8f";

interface RoadNear {
  distance: number;
  y: number;
}

interface WaterNear {
  found: boolean;
  gap: number;
  level: number;
}

export interface CoverPalette {
  readonly near: string;
  readonly far: string;
  readonly patch: string;
}

export const coverPalette = (look: Look, cover: GroundCover): CoverPalette =>
  ({
    grass: {
      far: look.groundFar,
      near: look.groundNear,
      patch: look.groundPatch,
    },
    paving: { far: look.road, near: look.walk, patch: look.kerb },
  })[cover];

const near: RoadNear = { distance: 0, y: 0 };
const wet: WaterNear = { found: false, gap: 0, level: 0 };
const tint = new THREE.Color();
const placer = new THREE.Object3D();

const inside = (
  ring: readonly GroundPoint[],
  x: number,
  z: number
): boolean => {
  let hit = false;
  let previous = ring.at(-1) ?? [0, 0];
  for (const point of ring) {
    const [ax, az] = point;
    const [bx, bz] = previous;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) {
      hit = !hit;
    }
    previous = point;
  }
  return hit;
};

const gapTo = (ring: readonly GroundPoint[], x: number, z: number): number => {
  if (inside(ring, x, z)) {
    return 0;
  }
  let least = Number.POSITIVE_INFINITY;
  let previous = ring.at(-1) ?? [0, 0];
  for (const point of ring) {
    const [ax, az] = previous;
    const dx = point[0] - ax;
    const dz = point[1] - az;
    const along = Math.min(
      1,
      Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))
    );
    least = Math.min(
      least,
      Math.hypot(ax + along * dx - x, az + along * dz - z)
    );
    previous = point;
  }
  return least;
};

const nearestWater = (
  water: readonly SceneryWater[],
  x: number,
  z: number
): WaterNear => {
  wet.found = water.length > 0;
  wet.gap = Number.POSITIVE_INFINITY;
  wet.level = 0;
  for (const body of water) {
    const gap = gapTo(body.ring, x, z);
    if (gap < wet.gap) {
      wet.gap = gap;
      wet.level = body.level;
    }
  }
  return wet;
};

const createGround = (track: Track, scenery: Scenery) => {
  const count = Math.ceil(track.sampleCount / ROAD_STEP);
  const xs = new Float64Array(count);
  const zs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const at = index * ROAD_STEP;
    xs[index] = track.worldX[at] ?? 0;
    zs[index] = track.worldZ[at] ?? 0;
    ys[index] = track.worldY[at] ?? 0;
  }
  const nearestRoad = (x: number, z: number): RoadNear => {
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < count; index += 1) {
      const dx = (xs[index] ?? 0) - x;
      const dz = (zs[index] ?? 0) - z;
      const squared = dx * dx + dz * dz;
      if (squared < best) {
        best = squared;
        near.y = ys[index] ?? 0;
      }
    }
    near.distance = Math.sqrt(best);
    return near;
  };
  const heightAt = (x: number, z: number): number => {
    const water = nearestWater(scenery.water, x, z);
    if (water.gap === 0) {
      return water.level - LAKE_FLOOR;
    }
    const road = nearestRoad(x, z);
    const dry = road.y - ROAD_DROP;
    if (!water.found) {
      return dry;
    }
    const fromRoad = Math.max(0, road.distance - track.vergeHalfWidth);
    const bank = water.level + LAKE_BANK;
    return bank + ((dry - bank) * water.gap) / (water.gap + fromRoad + 1);
  };
  const coverAt = (x: number, z: number): GroundCover =>
    scenery.patches.find((patch) => inside(patch.ring, x, z))?.cover ??
    scenery.cover;
  return { coverAt, heightAt, nearestRoad };
};

type Ground = ReturnType<typeof createGround>;

const axis = (low: number, high: number): number[] => {
  const first = low - GROUND_MARGIN;
  const core: number[] = [];
  for (
    let at = first;
    at < high + GROUND_MARGIN + GROUND_STEP;
    at += GROUND_STEP
  ) {
    core.push(at);
  }
  let before = first;
  let after = core.at(-1) ?? first;
  const outward = FAR_STEPS.map((step) => {
    before -= step;
    after += step;
    return [before, after] as const;
  });
  return [
    ...outward.map(([west]) => west).toReversed(),
    ...core,
    ...outward.map(([, east]) => east),
  ];
};

interface Palette {
  readonly near: THREE.Color;
  readonly far: THREE.Color;
  readonly patch: THREE.Color;
}

const paletteOf = (look: Look, cover: GroundCover): Palette => {
  const colours = coverPalette(look, cover);
  return {
    far: new THREE.Color(colours.far),
    near: new THREE.Color(colours.near),
    patch: new THREE.Color(colours.patch),
  };
};

const coverColoursOf = (look: Look) =>
  ({
    grass: paletteOf(look, "grass"),
    paving: paletteOf(look, "paving"),
  }) satisfies Record<GroundCover, Palette>;

interface Box {
  readonly west: number;
  readonly east: number;
  readonly north: number;
  readonly south: number;
}

const ringBox = (ring: readonly GroundPoint[]): Box => {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.POSITIVE_INFINITY;
  let south = Number.NEGATIVE_INFINITY;
  for (const [x, z] of ring) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    north = Math.min(north, z);
    south = Math.max(south, z);
  }
  return { east, north, south, west };
};

const bounds = (track: Track): Box => {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.POSITIVE_INFINITY;
  let south = Number.NEGATIVE_INFINITY;
  for (let at = 0; at < track.sampleCount; at += 1) {
    const x = track.worldX[at] ?? 0;
    const z = track.worldZ[at] ?? 0;
    west = Math.min(west, x);
    east = Math.max(east, x);
    north = Math.min(north, z);
    south = Math.max(south, z);
  }
  return { east, north, south, west };
};

const buildGround = (
  track: Track,
  ground: Ground,
  shading: Shading
): THREE.Mesh => {
  const { look } = shading;
  const box = bounds(track);
  const columns = axis(box.west, box.east);
  const rows = axis(box.north, box.south);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const palettes = coverColoursOf(look);
  for (const z of rows) {
    for (const x of columns) {
      positions.push(x, ground.heightAt(x, z), z);
      const reach = ground.nearestRoad(x, z).distance;
      const palette = palettes[ground.coverAt(x, z)];
      const color = tint
        .copy(palette.near)
        .lerp(palette.far, smoothstep(reach / 400))
        .lerp(palette.patch, ((rolling(x * 3.1, z * 2.7) + 1.5) / 3) * 0.35);
      colors.push(color.r, color.g, color.b);
    }
  }
  const width = columns.length;
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const corner = row * width + column;
      indices.push(
        corner,
        corner + width,
        corner + 1,
        corner + 1,
        corner + width,
        corner + width + 1
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    shading.cel("#ffffff", { vertexColors: true })
  );
  mesh.receiveShadow = true;
  return mesh;
};

const turn = (a: GroundPoint, b: GroundPoint, c: GroundPoint): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const clockwise = (ring: readonly GroundPoint[]): readonly GroundPoint[] => {
  let area = 0;
  let previous = ring.at(-1) ?? [0, 0];
  for (const point of ring) {
    area += previous[0] * point[1] - point[0] * previous[1];
    previous = point;
  }
  return area < 0 ? ring : ring.toReversed();
};

const isEar = (ring: readonly GroundPoint[], index: number): boolean => {
  const a = ring.at(index - 1) ?? [0, 0];
  const b = ring[index] ?? a;
  const c = ring[(index + 1) % ring.length] ?? a;
  return (
    turn(a, b, c) < 0 &&
    ring.every(
      (point) =>
        point === a ||
        point === b ||
        point === c ||
        turn(a, b, point) > 0 ||
        turn(b, c, point) > 0 ||
        turn(c, a, point) > 0
    )
  );
};

const capOf = (outline: readonly GroundPoint[]): GroundPoint[] => {
  const left = [...outline];
  const corners: GroundPoint[] = [];
  while (left.length > 3) {
    const ear = Math.max(
      0,
      left.findIndex((_, index) => isEar(left, index))
    );
    corners.push(
      left.at(ear - 1) ?? [0, 0],
      left[ear] ?? [0, 0],
      left[(ear + 1) % left.length] ?? [0, 0]
    );
    left.splice(ear, 1);
  }
  corners.push(...left);
  return corners;
};

const flatGeometry = (positions: readonly number[]): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.computeVertexNormals();
  return geometry;
};

const buildBlocks = (
  blocks: readonly SceneryBlock[],
  ground: Ground,
  shading: Shading
): THREE.Mesh => {
  const positions: number[] = [];
  for (const block of blocks) {
    const heights = block.ring.map(([x, z]) => ground.heightAt(x, z));
    const base = Math.min(...heights) + block.lift - BLOCK_SINK;
    const top = Math.max(...heights) + block.lift + block.height;
    const outline = clockwise(block.ring);
    let [fromX, fromZ] = outline.at(-1) ?? [0, 0];
    for (const [x, z] of outline) {
      positions.push(
        fromX,
        base,
        fromZ,
        x,
        base,
        z,
        x,
        top,
        z,
        fromX,
        base,
        fromZ,
        x,
        top,
        z,
        fromX,
        top,
        fromZ
      );
      fromX = x;
      fromZ = z;
    }
    for (const [x, z] of capOf(outline)) {
      positions.push(x, top, z);
    }
  }
  const mesh = new THREE.Mesh(
    flatGeometry(positions),
    shading.cel(BLOCK_COLOUR)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const buildWater = (
  water: readonly SceneryWater[],
  shading: Shading
): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    flatGeometry(
      water.flatMap((body) =>
        capOf(clockwise(body.ring)).flatMap(([x, z]) => [x, body.level, z])
      )
    ),
    shading.cel(WATER_COLOUR)
  );
  mesh.receiveShadow = true;
  return mesh;
};

const inBlock = (
  blocks: readonly SceneryBlock[],
  x: number,
  z: number
): boolean => blocks.some((block) => inside(block.ring, x, z));

const grassBoxes = (track: Track, scenery: Scenery): Box[] => {
  const boxes: Box[] = [];
  if (scenery.cover === "grass") {
    const box = bounds(track);
    boxes.push({
      east: box.east + TREE_REACH,
      north: box.north - TREE_REACH,
      south: box.south + TREE_REACH,
      west: box.west - TREE_REACH,
    });
  }
  for (const patch of scenery.patches) {
    if (patch.cover === "grass") {
      boxes.push(ringBox(patch.ring));
    }
  }
  return boxes;
};

const buildTrees = (
  track: Track,
  scenery: Scenery,
  ground: Ground,
  shading: Shading
): THREE.Group => {
  const { look } = shading;
  const random = createRandom(track.plan.seed + 7);
  const spots: (readonly [x: number, z: number, scale: number])[] = [];
  for (const box of grassBoxes(track, scenery)) {
    for (let z = box.north; z < box.south; z += TREE_STEP) {
      for (let x = box.west; x < box.east; x += TREE_STEP) {
        const treeX = x + (random() - 0.5) * TREE_STEP * 0.8;
        const treeZ = z + (random() - 0.5) * TREE_STEP * 0.8;
        const scale = 0.8 + random() * 0.6;
        const { distance } = ground.nearestRoad(treeX, treeZ);
        if (
          distance > track.vergeHalfWidth + TREE_CLEARANCE &&
          distance < TREE_REACH &&
          ground.coverAt(treeX, treeZ) === "grass" &&
          scenery.water.every(
            (body) => gapTo(body.ring, treeX, treeZ) > SHORE_CLEARANCE
          ) &&
          !inBlock(scenery.blocks, treeX, treeZ)
        ) {
          spots.push([treeX, treeZ, scale]);
        }
      }
    }
  }
  const trunks = new THREE.InstancedMesh(
    lifted(new THREE.CylinderGeometry(0.18, 0.26, 3, 5, 1, true), [0, 1.5, 0]),
    shading.cel(look.trunk),
    spots.length
  );
  const crowns = new THREE.InstancedMesh(
    lifted(new THREE.IcosahedronGeometry(2.2, 0), [0, 4.4, 0]),
    shading.cel("#ffffff"),
    spots.length
  );
  const leaves = look.foliage.map((colour) => new THREE.Color(colour));
  for (let index = 0; index < spots.length; index += 1) {
    const [x, z, scale] = spots[index] ?? [0, 0, 1];
    placer.position.set(x, ground.heightAt(x, z), z);
    placer.rotation.set(0, random() * Math.PI * 2, 0);
    placer.scale.setScalar(scale);
    placer.updateMatrix();
    trunks.setMatrixAt(index, placer.matrix);
    crowns.setMatrixAt(index, placer.matrix);
    crowns.setColorAt(index, leaves[index % leaves.length] ?? tint);
  }
  const trees = new THREE.Group();
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    trees.add(mesh);
  }
  return trees;
};

export const buildGreybox = (
  track: Track,
  scenery: Scenery,
  shading: Shading
): THREE.Group => {
  const ground = createGround(track, scenery);
  const greybox = new THREE.Group();
  greybox.add(
    buildGround(track, ground, shading),
    buildBlocks(scenery.blocks, ground, shading),
    buildTrees(track, scenery, ground, shading)
  );
  if (scenery.water.length > 0) {
    greybox.add(buildWater(scenery.water, shading));
  }
  return greybox;
};
