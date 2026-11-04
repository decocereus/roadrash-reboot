import { GARAGE_PLINTH, MEZZANINE, PLINTH, ROOM } from "@racer/sim/lobby-floor";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { GARAGE_LAMPS, LAMP_SPOTS } from "./bar-room.ts";
import { onFxLayer } from "./cel.ts";
import { CYAN, MAGENTA, ORANGE, YELLOW } from "./looks.ts";

const POOL_HEIGHT = 0.015;

type Quad = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
];

const quad = (
  corners: Quad,
  colour: string,
  strength: number,
  y = POOL_HEIGHT
): THREE.BufferGeometry => {
  const positions = new Float32Array(corners.flatMap(([x, z]) => [x, y, z]));
  const tint = new THREE.Color(colour).multiplyScalar(strength);
  const colours = new Float32Array([
    ...tint.toArray(),
    ...tint.toArray(),
    ...tint.toArray(),
    ...tint.toArray(),
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
};

const rect = (
  x: number,
  z: number,
  width: number,
  depth: number,
  colour: string,
  strength: number
): THREE.BufferGeometry =>
  quad(
    [
      [x - width / 2, z - depth / 2],
      [x + width / 2, z - depth / 2],
      [x + width / 2, z + depth / 2],
      [x - width / 2, z + depth / 2],
    ],
    colour,
    strength
  );

const ring = (
  x: number,
  z: number,
  inner: number,
  outer: number,
  colour: string,
  strength: number
): THREE.BufferGeometry => {
  const geometry = new THREE.RingGeometry(inner, outer, 48);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, POOL_HEIGHT, z);
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("normal");
  const { count } = geometry.getAttribute("position");
  const tint = new THREE.Color(colour).multiplyScalar(strength);
  const colours = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex += 1) {
    tint.toArray(colours, vertex * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
};

const lampPools = (): THREE.BufferGeometry[] =>
  LAMP_SPOTS.flatMap(([x, z]) => [
    quad(
      [
        [x - 3.2, z - 1.3],
        [x + 3.2, z - 1.3],
        [x + 4.1, z + 1.7],
        [x - 4.1, z + 1.7],
      ],
      ORANGE,
      0.2
    ),
    quad(
      [
        [x - 2.4, z - 0.8],
        [x + 2.4, z - 0.8],
        [x + 3, z + 1.1],
        [x - 3, z + 1.1],
      ],
      "#ffb765",
      0.17
    ),
  ]);

const neonPools = (): THREE.BufferGeometry[] => [
  rect(-5, -2.75, 11.4, 1.5, YELLOW, 0.11),
  rect(-5, -2.4, 11.4, 0.7, ORANGE, 0.14),
  rect(ROOM.doorCentre, -8.4, 6.4, 1.2, MAGENTA, 0.14),
  rect(ROOM.doorCentre, -7.3, 6.4, 1.2, MAGENTA, 0.08),
  ...[PLINTH, GARAGE_PLINTH].flatMap(({ radius, x, z }) => [
    ring(x, z, radius + 0.2, radius + 0.95, CYAN, 0.2),
    ring(x, z, radius + 0.95, radius + 1.6, CYAN, 0.08),
  ]),
];

const wallWash = (
  x: number,
  z: number,
  width: number,
  top: number,
  colour: string,
  strength: number
): THREE.BufferGeometry => {
  const geometry = quad(
    [
      [x, z - width / 2],
      [x, z + width / 2],
      [x, z + width / 2],
      [x, z - width / 2],
    ],
    colour,
    strength
  );
  const positions = geometry.getAttribute("position");
  const colours = geometry.getAttribute("color");
  for (const [vertex, y, share] of [
    [0, top, 1],
    [1, top, 1],
    [2, 0, 0.2],
    [3, 0, 0.2],
  ] as const) {
    positions.setY(vertex, y);
    colours.setXYZ(
      vertex,
      colours.getX(vertex) * share,
      colours.getY(vertex) * share,
      colours.getZ(vertex) * share
    );
  }
  return geometry;
};

const garagePools = (): THREE.BufferGeometry[] => [
  ...GARAGE_LAMPS.flatMap(([x, z]) => [
    rect(x, z, 4.4, 5.4, ORANGE, 0.16),
    rect(x - 0.3, z, 2.8, 4, "#ffb765", 0.12),
    wallWash(ROOM.rightX - 0.13, z, 5, MEZZANINE.y - 0.3, ORANGE, 0.2),
  ]),
  rect(GARAGE_PLINTH.x - 4.1, GARAGE_PLINTH.z, 3.6, 1.7, ORANGE, 0.16),
  rect(GARAGE_PLINTH.x - 4.1, GARAGE_PLINTH.z, 3.6, 0.8, "#ffb765", 0.1),
  rect(10.4, GARAGE_PLINTH.z, 2.6, 2.2, ORANGE, 0.16),
];

const windowShafts = (): THREE.BufferGeometry[] => {
  const shafts: THREE.BufferGeometry[] = [];
  for (let z = -8; z < 10; z += 4) {
    const from = ROOM.leftX + 0.2;
    shafts.push(
      quad(
        [
          [from, z + 0.2],
          [from, z + 3.7],
          [from + 11, z + 7.1],
          [from + 11, z + 3.6],
        ],
        ORANGE,
        0.16
      )
    );
  }
  return shafts;
};

const nightSheen = (): THREE.BufferGeometry[] => {
  const shafts: THREE.BufferGeometry[] = [];
  for (let z = -8; z < 10; z += 4) {
    shafts.push(
      quad(
        [
          [ROOM.leftX + 0.2, z + 0.2],
          [ROOM.leftX + 0.2, z + 3.7],
          [ROOM.leftX + 5, z + 3.7],
          [ROOM.leftX + 5, z + 0.2],
        ],
        "#3a56d8",
        0.13
      )
    );
  }
  return shafts;
};

const additive = (): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexColors: true,
  });

interface BarPool {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
}

const poolMesh = (parts: readonly THREE.BufferGeometry[]): BarPool => {
  const material = additive();
  const merged = mergeGeometries([...parts]);
  for (const part of parts) {
    part.dispose();
  }
  const mesh = onFxLayer(new THREE.Mesh(merged, material));
  mesh.renderOrder = 1;
  return { material, mesh };
};

export interface BarPools {
  readonly group: THREE.Group;
  readonly setTime: (time: number, neon: number) => void;
  readonly sweep: (x: number, z: number, strength: number) => void;
  readonly dispose: () => void;
}

export const createPools = (): BarPools => {
  const group = new THREE.Group();
  const steady = poolMesh([...lampPools(), ...neonPools(), ...garagePools()]);
  const dusk = poolMesh(windowShafts());
  const night = poolMesh(nightSheen());
  const lights = poolMesh([rect(0, 0, 8, 2.4, "#fff2c8", 0.24)]);
  group.add(steady.mesh, dusk.mesh, night.mesh, lights.mesh);
  lights.mesh.visible = false;
  return {
    dispose() {
      for (const each of [steady, dusk, night, lights]) {
        each.mesh.geometry.dispose();
        each.material.dispose();
      }
    },
    group,
    setTime(time, neon) {
      steady.material.color.setScalar(neon);
      dusk.material.color.setScalar(Math.max(0, 1 - time * 1.6));
      night.material.color.setScalar(time);
    },
    sweep(x, z, strength) {
      lights.mesh.visible = strength > 0;
      lights.mesh.position.set(x, 0, z);
      lights.material.color.setScalar(strength);
    },
  };
};
