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
import { CYAN, INK, MAGENTA, YELLOW } from "./looks.ts";

const BEHIND = 40;
const MARGIN = 200;
const FIRST_CAPACITY = 32;
const DECAL_LIFT = 0.025;
const SHEEN_LIFT = 0.03;
const BLOB_SPOKES = 28;
const KEY_PRIME = 31;
const OIL_INK = new THREE.Color("#07060c");
const OIL_EDGE = new THREE.Color("#1c1828");
const SHEEN = [CYAN, MAGENTA, YELLOW, CYAN, MAGENTA].map((colour) =>
  new THREE.Color(colour).multiplyScalar(0.75)
);
const GLINT_CORE = new THREE.Color("#ffffff");
const GLINT_TIP = new THREE.Color(CYAN);
const GLINT_POINTS = 4;
const GLINT_WAIST = 0.18;
const GLINTS = [
  [-0.45, 0.5, -1.1, 0.5],
  [0.5, 0.36, 0.7, 0.36],
] as const;
const HOLE = new THREE.Color("#050407");
const HOLE_WALL = new THREE.Color("#1d1a22");
const RIM = new THREE.Color("#b9b2a8");
const CRATE = new THREE.Color("#ff8a1f");
const STRAP = new THREE.Color(INK);
const ROCK_SHADOW = new THREE.Color("#000000");

interface Part {
  readonly kind: HazardKind;
  readonly mesh: THREE.InstancedMesh;
}

export interface HazardMarks {
  readonly group: THREE.Group;
  show: (hazards: readonly Hazard[], centre: number) => void;
  dispose: () => void;
}

const CRATE_TURN = 0.15;
const CRATE_HALF_WIDTH = 0.38;
const CRATE_HALF_LENGTH = 0.39;

const round = (): number => 1;

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

const glints = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  for (const [x, y, z, size] of GLINTS) {
    const centre = positions.length / 3;
    positions.push(x, y, z);
    colours.push(GLINT_CORE.r, GLINT_CORE.g, GLINT_CORE.b);
    const corners = GLINT_POINTS * 2;
    for (let corner = 0; corner < corners; corner += 1) {
      const angle = (corner / corners) * Math.PI * 2;
      const reach = corner % 2 === 0 ? size : size * GLINT_WAIST;
      positions.push(
        x + Math.sin(angle) * reach,
        y + Math.cos(angle) * reach,
        z
      );
      const colour = corner % 2 === 0 ? GLINT_TIP : GLINT_CORE;
      colours.push(colour.r, colour.g, colour.b);
      indices.push(
        centre,
        centre + 1 + corner,
        centre + 1 + ((corner + 1) % corners)
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
  return geometry;
};

const glintMaterial = (shading: Shading): THREE.MeshBasicMaterial => {
  const material = shading.glowPaint();
  material.side = THREE.DoubleSide;
  return material;
};

const pothole = (): THREE.BufferGeometry =>
  stretched(
    blob(
      [
        [0.6, () => HOLE],
        [0.8, () => HOLE_WALL],
        [0.9, () => RIM],
        [1, (spoke) => (spoke % 2 === 0 ? HOLE_WALL : RIM)],
      ],
      0.4,
      round
    ),
    "pothole",
    DECAL_LIFT
  );

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

const crate = (): THREE.BufferGeometry => {
  const { height } = hazardSizes.rock;
  const body = new THREE.BoxGeometry(
    CRATE_HALF_WIDTH * 2,
    height,
    CRATE_HALF_LENGTH * 2
  )
    .rotateY(CRATE_TURN)
    .translate(0, height / 2, 0);
  const colours: number[] = [];
  const { count } = body.getAttribute("position");
  for (let index = 0; index < count; index += 1) {
    colours.push(CRATE.r, CRATE.g, CRATE.b);
  }
  body.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  const straps = [-0.2, 0.2].map((offset) => {
    const strap = new THREE.BoxGeometry(
      CRATE_HALF_WIDTH * 2.02,
      height * 1.02,
      0.08
    )
      .translate(0, height / 2, offset)
      .rotateY(CRATE_TURN);
    const tint: number[] = [];
    for (
      let index = 0;
      index < strap.getAttribute("position").count;
      index += 1
    ) {
      tint.push(STRAP.r, STRAP.g, STRAP.b);
    }
    strap.setAttribute("color", new THREE.Float32BufferAttribute(tint, 3));
    return strap;
  });
  return mergeBoxes([body, ...straps]);
};

const mergeBoxes = (
  boxes: readonly THREE.BufferGeometry[]
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  for (const box of boxes) {
    const flat = box.index ? box.toNonIndexed() : box;
    positions.push(...flat.getAttribute("position").array);
    normals.push(...flat.getAttribute("normal").array);
    colours.push(...flat.getAttribute("color").array);
    flat.dispose();
    box.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return merged;
};

const decalMaterial = (shading: Shading): THREE.MeshToonMaterial => {
  const material = shading.cel("#ffffff", { vertexColors: true });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  return material;
};

const sheenMaterial = (shading: Shading): THREE.MeshBasicMaterial => {
  const material = shading.glowPaint();
  material.polygonOffset = true;
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

export function createHazardMarks(track: Track, shading: Shading): HazardMarks {
  const group = new THREE.Group();
  const parts: Part[] = [];
  const reach = shading.look.fogFar + MARGIN;
  const city = shading.look.kit === "city";
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
  add("oil", oilPool(), decal, true);
  add("oil", oilSheen(), sheenMaterial(shading), true);
  add("oil", glints(), glintMaterial(shading), true);
  add("pothole", pothole(), decal, true);
  add("rock", rockShadow(), shadowMaterial(), false);
  add(
    "rock",
    city ? crate() : boulder(),
    city
      ? shading.cel("#ffffff", { rim: 0.6, vertexColors: true })
      : shading.cel(shading.look.rock, { rim: 0.6 }),
    true
  );

  const grow = (needed: number) => {
    if (needed <= capacity) {
      return;
    }
    capacity = Math.max(needed, capacity * 2);
    for (const [index, part] of parts.entries()) {
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
      for (const part of parts) {
        part.mesh.dispose();
      }
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
      for (const [index, hazard] of hazards.entries()) {
        if (hazard.s > centre - BEHIND && hazard.s < centre + reach) {
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
        for (const [index, hazard] of hazards.entries()) {
          const matrix = matrices[index];
          if (
            hazard.kind === part.kind &&
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
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
