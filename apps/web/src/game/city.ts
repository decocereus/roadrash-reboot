import { createRandom } from "@racer/track/random";
import type { Random } from "@racer/track/random";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { CYAN, MAGENTA, ORANGE, RED, YELLOW } from "./looks.ts";
import { facadeTexture, pick, shopTexture, signAtlas } from "./textures.ts";
import type { SignFrame } from "./textures.ts";

export const CITY_CHUNK = 200;
export const FRONT_GAP = 1.2;
export const KERB_HEIGHT = 0.14;

const PODIUM = 4.5;
const FACADE_COUNT = 7;
const SHOP_COUNT = 8;
const SHOP_TILE = 16;
const FACADE_TILE_WIDE = 16;
const FACADE_TILE_TALL = 32;
const SKIRT = 18;
const SIGN_GLOW = 1.5;
const AWNINGS = [MAGENTA, CYAN, YELLOW, ORANGE, RED] as const;
const SCREENS = [CYAN, "#ffffff", MAGENTA] as const;

interface Block {
  readonly side: number;
  readonly s: number;
  readonly length: number;
  readonly seed: number;
}

type Batch = Map<string, THREE.BufferGeometry[]>;

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const tint = new THREE.Color();
const blockMatrix = new THREE.Matrix4();
const localMatrix = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const euler = new THREE.Euler();
const offset = new THREE.Vector3();
const unit = new THREE.Vector3(1, 1, 1);

const coloured = (
  geometry: THREE.BufferGeometry,
  colour: THREE.ColorRepresentation,
  strength = 1
): THREE.BufferGeometry => {
  tint.set(colour).multiplyScalar(strength);
  const { count } = geometry.getAttribute("position");
  const colours = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex += 1) {
    colours[vertex * 3] = tint.r;
    colours[vertex * 3 + 1] = tint.g;
    colours[vertex * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.deleteAttribute("uv");
  return geometry;
};

const solid = (
  size: readonly [number, number, number],
  colour: THREE.ColorRepresentation,
  strength = 1
): THREE.BufferGeometry =>
  coloured(new THREE.BoxGeometry(...size), colour, strength);

const walls = (
  size: readonly [number, number, number],
  tile: readonly [number, number]
): THREE.BufferGeometry => {
  const [wide, tall, deep] = size;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const faces = [
    [1, 0, deep, wide],
    [-1, 0, deep, wide],
    [0, 1, wide, deep],
    [0, -1, wide, deep],
  ] as const;
  for (const [normalX, normalZ, span, reach] of faces) {
    const base = positions.length / 3;
    const alongX = normalZ;
    const alongZ = normalX;
    for (const [across, up] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ] as const) {
      positions.push(
        (normalX * reach) / 2 + alongX * across * span,
        up * tall,
        (normalZ * reach) / 2 - alongZ * across * span
      );
      normals.push(normalX, 0, normalZ);
      uvs.push(
        ((across + 0.5) * span) / tile[0],
        ((up + 0.5) * tall) / tile[1]
      );
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
};

const framed = (
  wide: number,
  tall: number,
  frame: SignFrame
): THREE.BufferGeometry => {
  const geometry = new THREE.PlaneGeometry(wide, tall);
  const uv = geometry.getAttribute("uv");
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    uv.setXY(
      vertex,
      frame.u + uv.getX(vertex) * frame.wide,
      frame.v + uv.getY(vertex) * frame.tall
    );
  }
  return geometry;
};

const put = (
  batch: Batch,
  key: string,
  geometry: THREE.BufferGeometry,
  at: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0]
): void => {
  euler.set(...rotation);
  turn.setFromEuler(euler);
  offset.set(...at);
  localMatrix.compose(offset, turn, unit).premultiply(blockMatrix);
  geometry.applyMatrix4(localMatrix);
  const list = batch.get(key);
  if (list) {
    list.push(geometry);
  } else {
    batch.set(key, [geometry]);
  }
};

const meshFor = (
  key: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  if (key === "cable") {
    onFxLayer(mesh);
  } else {
    const lit = key !== "glow" && key !== "sign";
    mesh.castShadow = lit;
    mesh.receiveShadow = lit;
  }
  return mesh;
};

const layBlocks = (track: Track, front: number): Block[] => {
  const blocks: Block[] = [];
  const random = createRandom(track.plan.seed + 77);
  for (const side of [-1, 1]) {
    let s = track.startS;
    while (s < track.endS) {
      const length = 14 + random() * 20;
      blocks.push({
        length,
        s,
        seed: Math.floor(random() * 1_000_000),
        side,
      });
      const bend = track.curvature[Math.round(s - track.startS)] ?? 0;
      const stretch = 1 + Math.max(0, -side * bend) * (front + 12);
      s += (length + (random() < 0.2 ? 6 : 0.3)) / stretch;
    }
  }
  return blocks;
};

export interface City {
  readonly group: THREE.Group;
  readonly facades: readonly THREE.Material[];
  follow: (s: number, reach: number) => void;
  samples: () => THREE.Group;
  dispose: () => void;
}

export const createCity = (track: Track, shading: Shading): City => {
  const { look } = shading;
  const front = track.vergeHalfWidth + FRONT_GAP;
  const paint = createRandom(track.plan.seed + 11);
  const textures: THREE.Texture[] = [];
  const materials = new Map<string, THREE.Material>();
  const facades: THREE.Material[] = [];

  for (let index = 0; index < FACADE_COUNT; index += 1) {
    const lit = facadeTexture(
      paint,
      look,
      look.walls[index % look.walls.length] ?? look.dark,
      index > 4
    );
    textures.push(lit.map, lit.glow);
    const material = shading.cel("#ffffff", {
      emissiveIntensity: 1.7,
      emissiveMap: lit.glow,
      map: lit.map,
    });
    material.emissive.set("#ffffff");
    materials.set(`facade${index}`, material);
    facades.push(material);
  }
  for (let index = 0; index < SHOP_COUNT; index += 1) {
    const lit = shopTexture(paint, look);
    textures.push(lit.map, lit.glow);
    const material = shading.cel("#ffffff", {
      emissiveIntensity: 1,
      emissiveMap: lit.glow,
      map: lit.map,
    });
    material.emissive.set("#ffffff");
    materials.set(`shop${index}`, material);
  }
  const atlas = signAtlas(paint);
  textures.push(atlas.texture);
  materials.set("solid", shading.cel("#ffffff", { vertexColors: true }));
  materials.set("glow", shading.glowPaint());
  materials.set(
    "sign",
    new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffffff").multiplyScalar(SIGN_GLOW),
      map: atlas.texture,
    })
  );
  materials.set("cable", new THREE.MeshBasicMaterial({ color: look.ink }));

  const blocks = layBlocks(track, front);
  const chunkCount = Math.ceil((track.endS - track.startS) / CITY_CHUNK);
  const chunks: (THREE.Group | null)[] = Array.from(
    { length: chunkCount },
    () => null
  );
  const group = new THREE.Group();
  const trim = look.walls[4] ?? look.dark;
  const pole = "#221a30";
  const frameColour = "#120a1c";

  const hangSign = (
    batch: Batch,
    random: Random,
    block: readonly [number, number, number]
  ): void => {
    const [side, height, length] = block;
    const frame = pick(random, atlas.upright);
    const tall = Math.min(height - 1, 4.5 + frame.letters * 1.25);
    const wide = tall * frame.ratio;
    const z = length * (random() * 0.6 - 0.3);
    const y = 5.5 + tall / 2 + random() * Math.max(0, height - tall - 4) * 0.4;
    const x = side * (front - 0.3 - wide / 2);
    put(batch, "sign", framed(wide, tall, frame), [x, y, z + 0.16]);
    put(
      batch,
      "sign",
      framed(wide, tall, frame),
      [x, y, z - 0.16],
      [0, Math.PI, 0]
    );
    put(batch, "solid", solid([wide, tall, 0.3], frameColour), [x, y, z]);
    for (const bracket of [y + tall * 0.35, y - tall * 0.35]) {
      put(batch, "solid", solid([0.5, 0.08, 0.08], pole), [
        side * (front - 0.2),
        bracket,
        z,
      ]);
    }
  };

  const dress = (
    batch: Batch,
    random: Random,
    block: readonly [number, number, number]
  ): void => {
    const [side, height, length] = block;
    for (let y = PODIUM + 6.4; y < PODIUM + height - 1; y += 6.4) {
      put(batch, "solid", solid([0.5, 0.28, length - 0.2], trim), [
        side * (front + 0.05),
        y,
        0,
      ]);
    }
    for (const end of [length / 2 - 0.35, -length / 2 + 0.35]) {
      put(batch, "solid", solid([0.7, height, 0.7], trim), [
        side * (front + 0.1),
        PODIUM + height / 2,
        end,
      ]);
    }
    const bays = Math.floor(length / 4);
    for (let bay = 0; bay < bays; bay += 1) {
      if (random() < 0.55) {
        put(
          batch,
          "solid",
          solid([1.5, 0.08, 3.4], pick(random, AWNINGS)),
          [side * (front - 0.75), 3.6, length / 2 - 2.2 - bay * 4],
          [0, 0, side * 0.32]
        );
      }
    }
    for (let box = 0; box < 5; box += 1) {
      const floor = Math.floor(random() * Math.min(8, height / 3.2 - 1));
      put(batch, "solid", solid([0.5, 0.6, 0.9], trim), [
        side * (front - 0.25),
        6.3 + floor * 3.2,
        length / 2 - 1.5 - random() * (length - 3),
      ]);
    }
    if (random() < 0.45) {
      const wide = Math.min(6, length * 0.3);
      const z = length * 0.2;
      for (
        let y = PODIUM + 3.2;
        y < PODIUM + Math.min(height, 26) - 2;
        y += 3.2
      ) {
        put(batch, "solid", solid([1, 0.14, wide], trim), [
          side * (front - 0.5),
          y,
          z,
        ]);
        put(batch, "solid", solid([0.06, 0.9, wide], pole), [
          side * (front - 1),
          y + 0.5,
          z,
        ]);
      }
    }
    if (random() < 0.5) {
      put(batch, "solid", solid([0.16, height + 2, 0.16], pole), [
        side * (front - 0.12),
        PODIUM + height / 2,
        -length * 0.25,
      ]);
    }
    if (random() < 0.4) {
      const frame = pick(random, atlas.flat);
      const wide = Math.min(length * 0.5, 7);
      const tall = wide / frame.ratio;
      put(
        batch,
        "sign",
        framed(wide, tall, frame),
        [side * (front - 0.32), 5.6 + tall / 2, 0],
        [0, (-side * Math.PI) / 2, 0]
      );
      put(batch, "solid", solid([0.25, tall + 0.3, wide + 0.3], frameColour), [
        side * (front - 0.15),
        5.6 + tall / 2,
        0,
      ]);
    }
    if (random() < 0.5) {
      const z = length * (random() * 0.5 - 0.25);
      put(batch, "solid", solid([0.9, 1.9, 0.7], "#2a2038"), [
        side * (front - 0.5),
        1.1 + KERB_HEIGHT,
        z,
      ]);
      put(batch, "glow", solid([0.04, 1.5, 0.55], pick(random, SCREENS), 1.5), [
        side * (front - 0.97),
        1.15 + KERB_HEIGHT,
        z,
      ]);
    }
  };

  const raise = (batch: Batch, block: Block): void => {
    const random = createRandom(block.seed);
    const { side } = block;
    const middle = block.s + block.length / 2;
    const depth = 16 + random() * 10;
    const length = block.length + 0.3;
    const tallness = random();
    const height = side < 0 ? 8 + tallness * 16 : 16 + tallness * tallness * 72;
    const x = side * (front + depth / 2);
    const facade = `facade${Math.floor(random() * FACADE_COUNT)}`;
    placeOnTrack(track, middle, 0, point);
    euler.set(0, -point.heading, 0);
    turn.setFromEuler(euler);
    offset.set(point.x, point.y, point.z);
    blockMatrix.compose(offset, turn, unit);

    put(
      batch,
      `shop${Math.floor(random() * SHOP_COUNT)}`,
      walls([depth, PODIUM, length], [SHOP_TILE, PODIUM]),
      [x, PODIUM / 2 + KERB_HEIGHT, 0]
    );
    put(batch, "solid", solid([depth, SKIRT, length], look.dark), [
      x,
      KERB_HEIGHT - SKIRT / 2,
      0,
    ]);
    put(
      batch,
      facade,
      walls(
        [depth - 0.5, height, length - 0.4],
        [FACADE_TILE_WIDE, FACADE_TILE_TALL]
      ),
      [x, PODIUM + height / 2, 0]
    );
    put(batch, "solid", solid([depth + 0.5, 0.4, length + 0.2], trim), [
      x,
      PODIUM + 0.15,
      0,
    ]);
    put(batch, "solid", solid([depth + 0.1, 0.7, length + 0.1], look.dark), [
      x,
      PODIUM + height + 0.35,
      0,
    ]);
    if (height > 44) {
      put(
        batch,
        facade,
        walls(
          [depth * 0.7, height * 0.3, length * 0.6],
          [FACADE_TILE_WIDE, FACADE_TILE_TALL]
        ),
        [x + side * depth * 0.1, PODIUM + height * 1.15, 0]
      );
      put(
        batch,
        "solid",
        solid([depth * 0.72, 0.6, length * 0.62], look.dark),
        [x + side * depth * 0.1, PODIUM + height * 1.3 + 0.3, 0]
      );
    }
    for (let box = 0; box < 3; box += 1) {
      put(
        batch,
        "solid",
        solid(
          [2 + random() * 3, 1.2 + random() * 1.8, 2 + random() * 3],
          look.dark
        ),
        [
          x - side * depth * 0.25 + (random() - 0.5) * 3,
          PODIUM + height + 1.4,
          (random() - 0.5) * length * 0.6,
        ]
      );
    }
    if (random() < 0.55) {
      put(batch, "solid", solid([0.14, 9, 0.14], look.dark), [
        x - side * depth * 0.3,
        PODIUM + height + 4.5,
        0,
      ]);
      put(batch, "glow", solid([0.36, 0.36, 0.36], RED, 2.5), [
        x - side * depth * 0.3,
        PODIUM + height + 9.1,
        0,
      ]);
    }
    dress(batch, random, [side, height, length]);
    if (random() < 0.85) {
      hangSign(batch, random, [side, height, length]);
    }
    if (random() < 0.3 && height < 34) {
      const frame = pick(random, atlas.flat);
      const wide = Math.min(length - 2, 9);
      const tall = wide / frame.ratio;
      const y = PODIUM + height + 1.9 + tall / 2;
      const across = x - side * depth * 0.2;
      put(batch, "sign", framed(wide, tall, frame), [across, y, 0]);
      put(batch, "solid", solid([wide + 0.4, tall + 0.4, 0.3], look.dark), [
        across,
        y,
        -0.2,
      ]);
      for (const leg of [-1, 1]) {
        put(batch, "solid", solid([0.2, 2, 0.2], look.dark), [
          across + leg * wide * 0.35,
          PODIUM + height + 1.2,
          -0.3,
        ]);
      }
    }
    if (side < 0 && random() < 0.3) {
      const y = 9 + random() * 3;
      const z = (random() - 0.5) * length;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-front, y, z),
        new THREE.Vector3(0, y - 2.2, z + random() * 6 - 3),
        new THREE.Vector3(front, y + random() * 3, z + random() * 12 - 6)
      );
      const cable = new THREE.TubeGeometry(curve, 12, 0.035, 4);
      cable.deleteAttribute("uv");
      put(batch, "cable", cable, [0, 0, 0]);
    }
  };

  const sampleOf = (key: string): THREE.BufferGeometry => {
    const [frame] = atlas.flat;
    if (key === "sign" && frame) {
      return framed(1, 1, frame);
    }
    if (key === "cable") {
      const cable = new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-1, 0, 0),
          new THREE.Vector3(0, -0.5, 0),
          new THREE.Vector3(1, 0, 0)
        ),
        2,
        0.035,
        4
      );
      cable.deleteAttribute("uv");
      return cable;
    }
    if (key.startsWith("facade") || key.startsWith("shop")) {
      return walls([1, 1, 1], [1, 1]);
    }
    return solid([1, 1, 1], "#ffffff");
  };

  const buildChunk = (index: number): THREE.Group => {
    const from = track.startS + index * CITY_CHUNK;
    const batch: Batch = new Map();
    for (const block of blocks) {
      if (block.s >= from && block.s < from + CITY_CHUNK) {
        raise(batch, block);
      }
    }
    const chunk = new THREE.Group();
    for (const [key, geometries] of batch) {
      const material = materials.get(key);
      if (!material) {
        continue;
      }
      chunk.add(meshFor(key, mergeGeometries(geometries), material));
      for (const geometry of geometries) {
        geometry.dispose();
      }
    }
    return chunk;
  };

  const drop = (index: number): void => {
    const chunk = chunks[index];
    if (!chunk) {
      return;
    }
    group.remove(chunk);
    chunk.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
      }
    });
    chunks[index] = null;
  };

  let settled = false;

  return {
    dispose() {
      for (let index = 0; index < chunkCount; index += 1) {
        drop(index);
      }
      for (const material of materials.values()) {
        material.dispose();
      }
      for (const texture of textures) {
        texture.dispose();
      }
    },
    facades,
    follow(s, reach) {
      const first = Math.floor((s - track.startS - 260) / CITY_CHUNK);
      const last = Math.floor((s - track.startS + reach) / CITY_CHUNK);
      let budget = settled ? 1 : chunkCount;
      for (let index = 0; index < chunkCount; index += 1) {
        const wanted = index >= first && index <= last;
        if (!wanted) {
          drop(index);
        } else if (!chunks[index] && budget > 0) {
          const chunk = buildChunk(index);
          chunks[index] = chunk;
          group.add(chunk);
          budget -= 1;
        }
      }
      settled = true;
    },
    group,
    samples() {
      const samples = new THREE.Group();
      for (const [key, material] of materials) {
        samples.add(meshFor(key, sampleOf(key), material));
      }
      return samples;
    },
  };
};
