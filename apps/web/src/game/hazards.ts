import type { Hazard } from "@racer/sim/state";
import { hazardSizes } from "@racer/track/hazards";
import type { HazardKind } from "@racer/track/hazards";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { whiteInstances } from "./ground.ts";
import { uploadSpan } from "./uploads.ts";

const BEHIND = 40;
const MARGIN = 200;
const FIRST_CAPACITY = 32;
const DECAL_LIFT = 0.025;
const SHEEN_LIFT = 0.03;
const BLOB_SPOKES = 28;
const KEY_PRIME = 31;
const OIL_INK = new THREE.Color("#060509");
const OIL_EDGE = new THREE.Color("#16131c");
const SHEEN = ["#1d3640", "#33203f", "#2f3420", "#1d3640", "#33203f"].map(
  (colour) => new THREE.Color(colour)
);
const OIL_GLOSS = new THREE.Color("#7d8aa3");
const HOLE = new THREE.Color("#040306");
const HOLE_WALL = new THREE.Color("#2a2630");
const ROCK_SHADOW = new THREE.Color("#000000");
const GLOSS_LIFT = 0.035;
const GLOSS_SPOKES = 20;
const LIP_HEIGHT = 0.05;

interface Part {
  readonly kind: HazardKind;
  readonly mesh: THREE.InstancedMesh;
}

export interface HazardMarks {
  readonly group: THREE.Group;
  show: (hazards: readonly Hazard[], centre: number) => void;
  dispose: () => void;
}

const jagged = (angle: number, seed: number): number =>
  0.84 +
  0.09 * Math.sin(angle * 5 + seed) +
  0.07 * Math.sign(Math.sin(angle * 11 + seed * 1.7));

const lobe = (angle: number, seed: number): number =>
  0.82 +
  0.12 * Math.sin(angle * 3 + seed) +
  0.07 * Math.sin(angle * 5 + seed * 2.3);

const blob = (
  rings: readonly (readonly [
    radius: number,
    colour: (spoke: number) => THREE.Color,
  ])[],
  seed: number,
  outline: (angle: number, seed: number) => number = lobe
): THREE.BufferGeometry => {
  const positions: number[] = [0, 0, 0];
  const colours: number[] = [];
  const centre = rings[0]?.[1](0) ?? OIL_INK;
  colours.push(centre.r, centre.g, centre.b);
  for (const [radius, colourOf] of rings) {
    for (let spoke = 0; spoke < BLOB_SPOKES; spoke += 1) {
      const angle = (spoke / BLOB_SPOKES) * Math.PI * 2;
      const reach = radius * outline(angle, seed);
      positions.push(Math.cos(angle) * reach, 0, Math.sin(angle) * reach);
      const colour = colourOf(spoke);
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  const indices: number[] = [];
  for (let spoke = 0; spoke < BLOB_SPOKES; spoke += 1) {
    const next = (spoke + 1) % BLOB_SPOKES;
    indices.push(0, 1 + next, 1 + spoke);
  }
  for (let ring = 1; ring < rings.length; ring += 1) {
    const inner = 1 + (ring - 1) * BLOB_SPOKES;
    const outer = 1 + ring * BLOB_SPOKES;
    for (let spoke = 0; spoke < BLOB_SPOKES; spoke += 1) {
      const next = (spoke + 1) % BLOB_SPOKES;
      indices.push(
        inner + spoke,
        inner + next,
        outer + spoke,
        inner + next,
        outer + next,
        outer + spoke
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const stretched = (
  geometry: THREE.BufferGeometry,
  kind: HazardKind,
  lift: number
): THREE.BufferGeometry =>
  geometry
    .scale(hazardSizes[kind].halfWidth, 1, hazardSizes[kind].halfLength)
    .translate(0, lift, 0);

const oilPool = (): THREE.BufferGeometry =>
  stretched(
    blob(
      [
        [0.55, () => OIL_INK],
        [0.92, () => OIL_INK],
        [1, () => OIL_EDGE],
      ],
      1.3
    ),
    "oil",
    DECAL_LIFT
  );

const oilSheen = (): THREE.BufferGeometry => {
  const sheen = blob(
    [
      [0.4, () => OIL_INK],
      [0.52, (spoke) => SHEEN[spoke % SHEEN.length] ?? OIL_INK],
      [0.64, (spoke) => SHEEN[(spoke + 2) % SHEEN.length] ?? OIL_INK],
      [0.76, () => OIL_INK],
    ],
    1.3
  );
  return stretched(sheen, "oil", SHEEN_LIFT);
};

const oilGloss = (): THREE.BufferGeometry => {
  const positions: number[] = [0, 0, 0];
  const colours: number[] = [OIL_GLOSS.r, OIL_GLOSS.g, OIL_GLOSS.b];
  const indices: number[] = [];
  for (let spoke = 0; spoke < GLOSS_SPOKES; spoke += 1) {
    const angle = (spoke / GLOSS_SPOKES) * Math.PI * 2;
    positions.push(Math.cos(angle) * 0.62, 0, Math.sin(angle) * 0.13);
    colours.push(OIL_INK.r, OIL_INK.g, OIL_INK.b);
    indices.push(0, 1 + ((spoke + 1) % GLOSS_SPOKES), 1 + spoke);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return stretched(geometry, "oil", GLOSS_LIFT).translate(0.1, 0, -0.9);
};

const farSide = (spoke: number): boolean =>
  Math.sin((spoke / BLOB_SPOKES) * Math.PI * 2) < 0;

const pothole = (road: THREE.Color): THREE.BufferGeometry => {
  const broken = road.clone().lerp(new THREE.Color("#ffffff"), 0.38);
  const chipped = road.clone().multiplyScalar(0.6);
  const wall = road.clone().multiplyScalar(0.75);
  return stretched(
    blob(
      [
        [0.42, () => HOLE],
        [0.6, (spoke) => (farSide(spoke) ? HOLE_WALL : HOLE)],
        [0.72, (spoke) => (farSide(spoke) ? wall : HOLE)],
        [0.8, (spoke) => (farSide(spoke) ? broken : chipped)],
        [1, (spoke) => (spoke % 3 === 0 ? chipped : broken)],
      ],
      0.4,
      jagged
    ),
    "pothole",
    DECAL_LIFT
  );
};

const potholeLip = (road: THREE.Color): THREE.BufferGeometry => {
  const broken = road.clone().lerp(new THREE.Color("#ffffff"), 0.3);
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  for (let spoke = 0; spoke < BLOB_SPOKES; spoke += 1) {
    const angle = (spoke / BLOB_SPOKES) * Math.PI * 2;
    const edge = jagged(angle, 0.4);
    const rise = LIP_HEIGHT * (0.6 + 0.4 * Math.abs(Math.sin(angle * 7)));
    positions.push(
      Math.cos(angle) * edge * 0.76,
      rise,
      Math.sin(angle) * edge * 0.76,
      Math.cos(angle) * edge,
      0,
      Math.sin(angle) * edge
    );
    colours.push(broken.r, broken.g, broken.b, broken.r, broken.g, broken.b);
    const next = (spoke + 1) % BLOB_SPOKES;
    indices.push(
      spoke * 2,
      next * 2,
      spoke * 2 + 1,
      next * 2,
      next * 2 + 1,
      spoke * 2 + 1
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return stretched(geometry, "pothole", DECAL_LIFT);
};

const rockShadow = (): THREE.BufferGeometry => {
  const geometry = new THREE.CircleGeometry(1, 20);
  geometry.rotateX(-Math.PI / 2);
  return stretched(geometry, "rock", DECAL_LIFT * 0.5).scale(1.35, 1, 1.35);
};

const boulder = (): THREE.BufferGeometry => {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const bump = 0.86 + 0.14 * Math.sin(x * 4.1 + z * 2.7 + y * 3.3);
    position.setXYZ(index, x * bump, Math.max(-0.15, y) * bump, z * bump);
  }
  geometry.computeVertexNormals();
  const { halfLength, halfWidth, height } = hazardSizes.rock;
  return geometry
    .scale(halfWidth, height * 0.9, halfLength)
    .translate(0, height * 0.12, 0);
};

const decalMaterial = (shading: Shading): THREE.MeshToonMaterial => {
  const material = shading.cel("#ffffff", { vertexColors: true });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  return material;
};

const sheenMaterial = (shading: Shading): THREE.MeshToonMaterial => {
  const material = decalMaterial(shading);
  material.polygonOffsetFactor = -4;
  material.polygonOffsetUnits = -4;
  return material;
};

const shadowMaterial = (): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color: ROCK_SHADOW,
    depthWrite: false,
    opacity: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    transparent: true,
  });

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const placer = new THREE.Object3D();

export const createHazardMarks = (
  track: Track,
  shading: Shading
): HazardMarks => {
  const group = new THREE.Group();
  const parts: Part[] = [];
  const reach = shading.look.fogFar + MARGIN;
  let capacity = FIRST_CAPACITY;
  let matrices: THREE.Matrix4[] = [];
  let placedS = new Float64Array(0);
  let placedX = new Float64Array(0);
  let shownKey = Number.NaN;
  let moved = false;

  const add = (
    kind: HazardKind,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    lit: boolean
  ) => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.castShadow = lit && kind === "rock";
    mesh.receiveShadow = lit;
    whiteInstances(mesh);
    mesh.count = 0;
    mesh.visible = false;
    group.add(lit ? mesh : onFxLayer(mesh));
    parts.push({ kind, mesh });
  };

  const decal = decalMaterial(shading);
  const sheen = sheenMaterial(shading);
  add("oil", oilPool(), decal, true);
  add("oil", oilSheen(), sheen, true);
  add("oil", oilGloss(), sheen, true);
  const road = new THREE.Color(shading.look.road);
  add("pothole", pothole(road), decal, true);
  add("pothole", potholeLip(road), decal, true);
  add("rock", rockShadow(), shadowMaterial(), false);
  add("rock", boulder(), shading.cel(shading.look.rock, { rim: 0.6 }), true);

  const grow = (needed: number) => {
    if (needed <= capacity) {
      return;
    }
    capacity = Math.max(needed, capacity * 2);
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part) {
        continue;
      }
      const { geometry, material } = part.mesh;
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.frustumCulled = false;
      mesh.castShadow = part.mesh.castShadow;
      mesh.receiveShadow = part.mesh.receiveShadow;
      mesh.layers.mask = part.mesh.layers.mask;
      whiteInstances(mesh);
      mesh.count = 0;
      group.remove(part.mesh);
      part.mesh.dispose();
      group.add(mesh);
      parts[index] = { kind: part.kind, mesh };
    }
    moved = true;
  };

  const matrixOf = (index: number, hazard: Hazard): THREE.Matrix4 => {
    let matrix = matrices[index];
    if (!matrix) {
      matrix = new THREE.Matrix4();
      matrices[index] = matrix;
    }
    if (placedS[index] !== hazard.s || placedX[index] !== hazard.x) {
      placeOnTrack(track, hazard.s, hazard.x, point);
      placer.position.set(point.x, point.y, point.z);
      placer.rotation.set(Math.atan(point.slope), -point.heading, 0, "YXZ");
      placer.updateMatrix();
      matrix.copy(placer.matrix);
      placedS[index] = hazard.s;
      placedX[index] = hazard.x;
      moved = true;
    }
    return matrix;
  };

  return {
    dispose() {
      group.removeFromParent();
      disposeTree(group);
    },
    group,
    show(hazards, centre) {
      if (placedS.length < hazards.length) {
        const s = new Float64Array(hazards.length * 2).fill(Number.NaN);
        const x = new Float64Array(hazards.length * 2).fill(Number.NaN);
        s.set(placedS);
        x.set(placedX);
        placedS = s;
        placedX = x;
        matrices = [...matrices];
      }
      grow(hazards.length);
      let key = hazards.length;
      for (let index = 0; index < hazards.length; index += 1) {
        const hazard = hazards[index];
        if (hazard && hazard.s > centre - BEHIND && hazard.s < centre + reach) {
          matrixOf(index, hazard);
          key = Math.imul(key, KEY_PRIME) + index + 1;
        }
      }
      if (key === shownKey && !moved) {
        return;
      }
      shownKey = key;
      moved = false;
      for (const part of parts) {
        let slot = 0;
        for (let index = 0; index < hazards.length; index += 1) {
          const hazard = hazards[index];
          const matrix = matrices[index];
          if (
            hazard?.kind === part.kind &&
            matrix &&
            hazard.s > centre - BEHIND &&
            hazard.s < centre + reach
          ) {
            part.mesh.setMatrixAt(slot, matrix);
            slot += 1;
          }
        }
        part.mesh.count = slot;
        part.mesh.visible = slot > 0;
        uploadSpan(part.mesh.instanceMatrix, 0, slot);
      }
    },
  };
};
