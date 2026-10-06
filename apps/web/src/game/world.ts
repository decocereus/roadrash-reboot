import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint, TrackProp } from "@racer/track/track";
import * as THREE from "three";

const CHUNK_LENGTH = 200;
const ROAD_STEP = 2;
const TERRAIN_STEP = 4;
const TERRAIN_RINGS = [0, 1.5, 4, 9, 20, 45, 90, 160];
const DASH_CYCLE = 12;
const HORIZON = 0xc9_db_e8;
const ZENITH = 0x3f_7f_d6;

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function rolling(worldX: number, worldZ: number): number {
  return (
    Math.sin(worldX * 0.011 + 1.3) * Math.cos(worldZ * 0.013) +
    0.5 * Math.sin(worldX * 0.031 - worldZ * 0.027)
  );
}

export function groundLift(
  distance: number,
  worldX: number,
  worldZ: number
): number {
  if (distance <= 0) {
    return 0;
  }
  const ditch =
    -0.35 * smoothstep(distance / 1.5) * (1 - smoothstep((distance - 4) / 6));
  const rise = smoothstep((distance - 9) / 90);
  return ditch + rise * (6 + 16 * rolling(worldX, worldZ));
}

export function placeOnGround(
  track: Track,
  s: number,
  x: number,
  target: TrackPoint
): void {
  placeOnTrack(track, s, x, target);
  target.y += groundLift(Math.abs(x) - track.roadHalfWidth, target.x, target.z);
}

function createRoadTexture(track: Track): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The road texture needs a 2D canvas.");
  }
  const roadWidth = track.roadHalfWidth * 2;
  const across = (metres: number): number =>
    (0.5 + metres / roadWidth) * canvas.width;
  context.fillStyle = "#3b3e44";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let speck = 0; speck < 9000; speck += 1) {
    const shade = 46 + Math.floor(Math.random() * 34);
    context.fillStyle = `rgb(${shade},${shade},${shade + 4})`;
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1 + Math.random() * 2,
      2 + Math.random() * 5
    );
  }
  const lineWidth = (0.14 / roadWidth) * canvas.width;
  context.fillStyle = "#e9e6dc";
  for (const edge of [-track.plan.laneWidth, track.plan.laneWidth]) {
    context.fillRect(across(edge) - lineWidth / 2, 0, lineWidth, canvas.height);
  }
  context.fillStyle = "#f0c540";
  context.fillRect(
    across(0) - lineWidth / 2,
    0,
    lineWidth,
    canvas.height * (4 / DASH_CYCLE)
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  return texture;
}

function buildRoadChunk(
  track: Track,
  from: number,
  to: number,
  material: THREE.Material
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let row = 0;
  for (let s = from; s <= to; s += ROAD_STEP) {
    for (const side of [-1, 1]) {
      placeOnTrack(track, s, side * track.roadHalfWidth, point);
      positions.push(point.x, point.y, point.z);
      uvs.push(side < 0 ? 0 : 1, s / DASH_CYCLE);
    }
    if (s + ROAD_STEP <= to) {
      const base = row * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    row += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

const gravel = new THREE.Color(0x8c_7d_5e);
const grassNear = new THREE.Color(0x6a_9a_3f);
const grassFar = new THREE.Color(0x4c_7a_38);
const grassDry = new THREE.Color(0x9a_a8_4a);
const tint = new THREE.Color();

function terrainColor(
  ring: number,
  worldX: number,
  worldZ: number
): THREE.Color {
  if (ring <= 1) {
    return tint.copy(gravel);
  }
  const patch = (rolling(worldX * 3.1, worldZ * 2.7) + 1.5) / 3;
  return tint
    .copy(grassNear)
    .lerp(grassFar, smoothstep((ring - 2) / 5))
    .lerp(grassDry, patch * 0.35);
}

function buildTerrainChunk(
  track: Track,
  from: number,
  to: number,
  side: number,
  material: THREE.Material
): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const columns = TERRAIN_RINGS.length;
  let row = 0;
  for (let s = from; s <= to; s += TERRAIN_STEP) {
    const bend = track.curvature[Math.round(s - track.startS)] ?? 0;
    const inside = side * bend > 0;
    const reach = inside ? 0.8 / Math.abs(bend) : Number.POSITIVE_INFINITY;
    for (const [ring, offset] of TERRAIN_RINGS.entries()) {
      const distance = Math.min(offset, reach);
      placeOnTrack(track, s, side * (track.roadHalfWidth + distance), point);
      const lift = groundLift(distance, point.x, point.z);
      positions.push(point.x, point.y + lift, point.z);
      const color = terrainColor(ring, point.x, point.z);
      colors.push(color.r, color.g, color.b);
    }
    if (s + TERRAIN_STEP <= to) {
      for (let column = 0; column < columns - 1; column += 1) {
        const near = row * columns + column;
        const far = near + columns;
        if (side > 0) {
          indices.push(near, near + 1, far, near + 1, far + 1, far);
        } else {
          indices.push(near, far, near + 1, near + 1, far, far + 1);
        }
      }
    }
    row += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

interface Part {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly lift: number;
}

const placer = new THREE.Object3D();
const partMatrix = new THREE.Matrix4();
const liftMatrix = new THREE.Matrix4();

function plant(
  group: THREE.Group,
  track: Track,
  props: readonly TrackProp[],
  parts: readonly Part[],
  mirrored = false
): void {
  if (props.length === 0) {
    return;
  }
  const meshes = parts.map((part) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      part.material,
      props.length
    );
    group.add(mesh);
    return mesh;
  });
  for (const [index, prop] of props.entries()) {
    placeOnGround(track, prop.s, prop.x, point);
    placer.position.set(point.x, point.y, point.z);
    placer.rotation.set(0, -point.heading, 0);
    const flip = mirrored && prop.x > 0 ? -1 : 1;
    placer.scale.set(prop.scale * flip, prop.scale, prop.scale);
    placer.updateMatrix();
    for (const [partIndex, part] of parts.entries()) {
      liftMatrix.makeTranslation(0, part.lift, 0);
      partMatrix.multiplyMatrices(placer.matrix, liftMatrix);
      meshes[partIndex]?.setMatrixAt(index, partMatrix);
    }
  }
  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

function matte(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function createChevronTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The chevron texture needs a 2D canvas.");
  }
  context.fillStyle = "#f2c230";
  context.fillRect(0, 0, 128, 96);
  context.fillStyle = "#15171a";
  context.beginPath();
  context.moveTo(34, 10);
  context.lineTo(66, 10);
  context.lineTo(100, 48);
  context.lineTo(66, 86);
  context.lineTo(34, 86);
  context.lineTo(68, 48);
  context.closePath();
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBannerTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The banner texture needs a 2D canvas.");
  }
  context.fillStyle = "#15171a";
  context.fillRect(0, 0, 1024, 128);
  for (let column = 0; column < 32; column += 1) {
    for (let line = 0; line < 2; line += 1) {
      if ((column + line) % 2 === 0) {
        context.fillStyle = "#f4f1e8";
        context.fillRect(column * 32, line * 16, 32, 16);
        context.fillRect(column * 32, 96 + line * 16, 32, 16);
      }
    }
  }
  context.fillStyle = "#f2c230";
  context.font = "900 58px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 512, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildGate(track: Track, s: number, label: string): THREE.Group {
  const gate = new THREE.Group();
  const span = track.roadHalfWidth * 2 + 3;
  const steel = matte(0x2a_2f_36);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), steel);
    post.position.set((side * span) / 2, 3.5, 0);
    gate.add(post);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(span, 1.3, 0.3),
    new THREE.MeshBasicMaterial({ map: createBannerTexture(label) })
  );
  banner.position.set(0, 6.4, 0);
  gate.add(banner);
  placeOnTrack(track, s, 0, point);
  gate.position.set(point.x, point.y, point.z);
  gate.rotation.set(0, -point.heading, 0);
  return gate;
}

function buildScenery(track: Track): THREE.Group {
  const scenery = new THREE.Group();
  const ofKind = (kind: TrackProp["kind"]): TrackProp[] =>
    track.props.filter((prop) => prop.kind === kind);

  plant(scenery, track, ofKind("tree"), [
    {
      geometry: new THREE.CylinderGeometry(0.16, 0.26, 2.4, 5),
      lift: 0.9,
      material: matte(0x5b_43_2e),
    },
    {
      geometry: new THREE.ConeGeometry(2.1, 4.2, 6),
      lift: 3.9,
      material: matte(0x2f_6b_35),
    },
    {
      geometry: new THREE.ConeGeometry(1.5, 3.4, 6),
      lift: 6.1,
      material: matte(0x3b_80_3d),
    },
  ]);
  plant(scenery, track, ofKind("pole"), [
    {
      geometry: new THREE.CylinderGeometry(0.1, 0.14, 8.4, 5),
      lift: 4.1,
      material: matte(0x4a_3a_2c),
    },
    {
      geometry: new THREE.BoxGeometry(2.2, 0.14, 0.14),
      lift: 7.6,
      material: matte(0x4a_3a_2c),
    },
  ]);
  plant(
    scenery,
    track,
    ofKind("chevron"),
    [
      {
        geometry: new THREE.CylinderGeometry(0.05, 0.05, 1.5, 4),
        lift: 0.7,
        material: matte(0x70_75_7c),
      },
      {
        geometry: new THREE.PlaneGeometry(1.2, 0.9),
        lift: 1.6,
        material: new THREE.MeshBasicMaterial({
          map: createChevronTexture(),
          side: THREE.DoubleSide,
        }),
      },
    ],
    true
  );
  plant(scenery, track, ofKind("rock"), [
    {
      geometry: new THREE.IcosahedronGeometry(0.95, 0),
      lift: 0.35,
      material: matte(0x7d_7f_82),
    },
  ]);
  scenery.add(buildGate(track, 0, "START"));
  scenery.add(buildGate(track, track.length, "FINISH"));
  return scenery;
}

function buildSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(4000, 24, 12);
  const colors: number[] = [];
  const low = new THREE.Color(HORIZON);
  const high = new THREE.Color(ZENITH);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const height = Math.max(0, position.getY(index) / 4000);
    tint.copy(low).lerp(high, smoothstep(height * 1.6));
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      depthWrite: false,
      fog: false,
      side: THREE.BackSide,
      vertexColors: true,
    })
  );
}

function buildMountains(): THREE.InstancedMesh {
  const count = 44;
  const mountains = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 5),
    new THREE.MeshBasicMaterial({ color: 0x9d_b6_cc, fog: false }),
    count
  );
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const height = 260 + 240 * Math.abs(Math.sin(index * 2.3 + 0.7));
    placer.position.set(
      Math.sin(angle) * 3000,
      height / 2 - 60,
      Math.cos(angle) * 3000
    );
    placer.rotation.set(0, index * 1.7, 0);
    placer.scale.set(420 + 260 * Math.abs(Math.cos(index * 1.1)), height, 420);
    placer.updateMatrix();
    mountains.setMatrixAt(index, placer.matrix);
  }
  mountains.frustumCulled = false;
  return mountains;
}

export interface World {
  readonly scene: THREE.Scene;
  follow: (camera: THREE.Camera) => void;
}

export function createWorld(track: Track): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 260, 2100);
  scene.add(new THREE.HemisphereLight(0xe6_f1_ff, 0x6b_7a_4f, 1.7));
  const sun = new THREE.DirectionalLight(0xff_f2_d6, 2.1);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun);

  const roadMaterial = new THREE.MeshLambertMaterial({
    map: createRoadTexture(track),
  });
  const terrainMaterial = new THREE.MeshLambertMaterial({
    flatShading: true,
    vertexColors: true,
  });
  for (let from = track.startS; from < track.endS; from += CHUNK_LENGTH) {
    const to = Math.min(track.endS, from + CHUNK_LENGTH);
    scene.add(buildRoadChunk(track, from, to, roadMaterial));
    for (const side of [-1, 1]) {
      scene.add(buildTerrainChunk(track, from, to, side, terrainMaterial));
    }
  }
  scene.add(buildScenery(track));

  let lowest = Number.POSITIVE_INFINITY;
  for (const height of track.worldY) {
    lowest = Math.min(lowest, height);
  }
  const plain = new THREE.Mesh(
    new THREE.CircleGeometry(4200, 32),
    new THREE.MeshBasicMaterial({ color: 0x5d_86_4a })
  );
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = lowest - 24;
  const sky = buildSky();
  const mountains = buildMountains();
  scene.add(plain, sky, mountains);

  return {
    follow(camera) {
      plain.position.x = camera.position.x;
      plain.position.z = camera.position.z;
      sky.position.copy(camera.position);
      mountains.position.set(camera.position.x, 0, camera.position.z);
    },
    scene,
  };
}
