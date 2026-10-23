import { riderPalette } from "@racer/sim/palette";
import type { TrafficView } from "@racer/sim/race-view";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { glows, paintPrimitives } from "./assets.ts";
import type { Assets, Palette, Primitive } from "./assets.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { freeze, placeOnGround, whiteInstances } from "./ground.ts";

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };

const DEFAULT_PAINT = 0xc8_2f_2f;
const DARK_TRIM = "#1c1826";
const WHEELS = [
  ["wheel_f", 0.293, 0.69],
  ["wheel_r", 0.306, -0.69],
] as const;
const MODEL = new THREE.Matrix4().makeRotationY(Math.PI);
const BEACONS = [
  [0x2f_6b_ff, -0.07],
  [0xff_2f_3a, 0.07],
] as const;
const BEACON_STRENGTH = 2.4;
const FLEET_BEHIND = 40;
const FLEET_MARGIN = 200;
const LIVERY: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["body", [1, 0]],
  ["accent", [0, 1]],
]);
const LIVERY_SLOTS: Palette = new Map([
  ["body", "#ffffff"],
  ["accent", "#ffffff"],
]);
const LIVERY_VERTEX = `attribute vec2 livery;
attribute vec3 instancePaint;
attribute vec3 instanceTrim;
`;
const LIVERY_COLOUR = `#include <color_vertex>
vColor.xyz = mix(mix(vColor.xyz, instancePaint, livery.x), instanceTrim, livery.y);`;

export interface BikeRider {
  readonly paint: number;
  readonly police: boolean;
}

export interface Reach {
  readonly behind: number;
  readonly ahead: number;
}

export interface Bikes {
  readonly group: THREE.Group;
  readonly roots: readonly THREE.Object3D[];
  spin: (index: number, distance: number) => void;
  sag: (index: number, metres: number) => void;
  show: (index: number) => void;
  commit: (anchor: THREE.Vector3) => void;
  dispose: () => void;
}

interface Wheel {
  readonly radius: number;
  readonly z: number;
  readonly turns: Float64Array;
  readonly frame: THREE.Matrix4;
}

interface BikePart {
  readonly mesh: THREE.InstancedMesh;
  readonly wheel: Wheel | null;
}

export const reachOf = (shading: Shading): Reach => ({
  ahead: shading.look.fogFar + FLEET_MARGIN,
  behind: FLEET_BEHIND,
});

const liveried = (material: THREE.MeshToonMaterial): THREE.MeshToonMaterial => {
  const cel = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    cel(shader, renderer);
    shader.vertexShader = `${LIVERY_VERTEX}${shader.vertexShader.replace(
      "#include <color_vertex>",
      LIVERY_COLOUR
    )}`;
  };
  material.customProgramCacheKey = () => `${key}-livery`;
  return material;
};

const liveryOf = (
  primitives: readonly Primitive[],
  vertices: number
): THREE.BufferAttribute => {
  const weights = new Float32Array(vertices * 2);
  let at = 0;
  for (const primitive of primitives) {
    if (glows(primitive.slot)) {
      continue;
    }
    const [paint, trim] = LIVERY.get(primitive.slot) ?? [0, 0];
    const end = at + primitive.geometry.getAttribute("position").count;
    for (let vertex = at; vertex < end; vertex += 1) {
      weights[vertex * 2] = paint;
      weights[vertex * 2 + 1] = trim;
    }
    at = end;
  }
  return new THREE.BufferAttribute(weights, 2);
};

const beaconGeometry = (): THREE.BufferGeometry => {
  const tint = new THREE.Color();
  const lamps = BEACONS.map(([colour, x]) => {
    const lamp = new THREE.BoxGeometry(0.1, 0.08, 0.1).translate(
      x,
      1.02,
      -0.92
    );
    tint.set(colour).multiplyScalar(BEACON_STRENGTH);
    const { count } = lamp.getAttribute("position");
    const colours = new Float32Array(count * 3);
    for (let vertex = 0; vertex < count; vertex += 1) {
      tint.toArray(colours, vertex * 3);
    }
    lamp.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    return lamp;
  });
  const merged = mergeGeometries(lamps);
  for (const lamp of lamps) {
    lamp.dispose();
  }
  return merged;
};

const instanced = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
  shadows: boolean
): THREE.InstancedMesh => {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
};

const upload = (
  attribute: THREE.BufferAttribute,
  from: number,
  to: number
): void => {
  if (to <= from) {
    return;
  }
  attribute.addUpdateRange(
    from * attribute.itemSize,
    (to - from) * attribute.itemSize
  );
  attribute.needsUpdate = true;
};

const showPrefix = (mesh: THREE.InstancedMesh, count: number): void => {
  mesh.count = count;
  mesh.visible = count > 0;
  mesh.instanceMatrix.clearUpdateRanges();
  upload(mesh.instanceMatrix, 0, count);
};

export const createBikes = (
  assets: Pick<Assets, "bike">,
  shading: Shading,
  riders: readonly BikeRider[]
): Bikes => {
  const group = new THREE.Group();
  const capacity = riders.length;
  const roots = riders.map(() => new THREE.Object3D());
  const paint = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity * 3),
    3
  );
  const trim = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity * 3),
    3
  );
  const paints = new Float32Array(capacity * 3);
  const trims = new Float32Array(capacity * 3);
  const tint = new THREE.Color();
  for (let index = 0; index < riders.length; index += 1) {
    const rider = riders[index];
    if (!rider) {
      continue;
    }
    const colours = riderPalette[rider.paint];
    tint.set(colours?.bike ?? DEFAULT_PAINT).toArray(paints, index * 3);
    tint.set(colours?.trim ?? DARK_TRIM).toArray(trims, index * 3);
  }
  const material = liveried(shading.paint());
  const wheels: Wheel[] = WHEELS.map(([, radius, z]) => ({
    frame: new THREE.Matrix4(),
    radius,
    turns: new Float64Array(capacity),
    z,
  }));
  const parts: BikePart[] = [];
  const addPart = (name: string, wheel: Wheel | null, shift: THREE.Vector3) => {
    const primitives = assets.bike.get(name) ?? [];
    const painted = paintPrimitives(primitives, LIVERY_SLOTS);
    if (painted.cel) {
      const geometry = painted.cel.translate(shift.x, shift.y, shift.z);
      geometry.setAttribute(
        "livery",
        liveryOf(primitives, geometry.getAttribute("position").count)
      );
      geometry.setAttribute("instancePaint", paint);
      geometry.setAttribute("instanceTrim", trim);
      const mesh = instanced(geometry, material, capacity, true);
      group.add(mesh);
      parts.push({ mesh, wheel });
    }
    if (painted.glow) {
      const geometry = painted.glow.translate(shift.x, shift.y, shift.z);
      const mesh = instanced(geometry, shading.glowPaint(), capacity, false);
      group.add(mesh);
      parts.push({ mesh, wheel });
    }
  };
  addPart("bike_body", null, new THREE.Vector3());
  for (let index = 0; index < WHEELS.length; index += 1) {
    const wheel = WHEELS[index];
    if (!wheel) {
      continue;
    }
    const [name, radius, z] = wheel;
    addPart(name, wheels[index] ?? null, new THREE.Vector3(0, -radius, -z));
  }
  const police = riders.filter((rider) => rider.police).length;
  const beacons =
    police > 0
      ? instanced(beaconGeometry(), shading.glowPaint(), police, false)
      : null;
  if (beacons) {
    group.add(beacons);
  }

  const shown = new Uint8Array(capacity);
  const slotRider = new Int32Array(capacity).fill(-1);
  const sags = new Float32Array(capacity);
  const frame = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const pivot = new THREE.Matrix4();

  const recolour = (slot: number, index: number): boolean => {
    if (slotRider[slot] === index) {
      return false;
    }
    slotRider[slot] = index;
    paint.setXYZ(
      slot,
      paints[index * 3] ?? 1,
      paints[index * 3 + 1] ?? 1,
      paints[index * 3 + 2] ?? 1
    );
    trim.setXYZ(
      slot,
      trims[index * 3] ?? 1,
      trims[index * 3 + 1] ?? 1,
      trims[index * 3 + 2] ?? 1
    );
    return true;
  };

  return {
    commit(anchor) {
      group.position.copy(anchor);
      let slot = 0;
      let cop = 0;
      let firstRecoloured = capacity;
      let lastRecoloured = -1;
      for (let index = 0; index < capacity; index += 1) {
        const root = roots[index];
        if (shown[index] === 0 || !root) {
          continue;
        }
        shown[index] = 0;
        root.updateMatrix();
        frame.multiplyMatrices(root.matrix, MODEL);
        frame.elements[12] -= anchor.x;
        frame.elements[13] -= anchor.y;
        frame.elements[14] -= anchor.z;
        for (const wheel of wheels) {
          pivot.makeRotationX(wheel.turns[index] ?? 0);
          pivot.setPosition(0, wheel.radius, wheel.z);
          wheel.frame.multiplyMatrices(frame, pivot);
        }
        pivot.makeTranslation(0, -(sags[index] ?? 0), 0);
        body.multiplyMatrices(frame, pivot);
        for (const part of parts) {
          part.mesh.setMatrixAt(slot, part.wheel?.frame ?? body);
        }
        if (beacons && riders[index]?.police === true) {
          beacons.setMatrixAt(cop, body);
          cop += 1;
        }
        if (recolour(slot, index)) {
          firstRecoloured = Math.min(firstRecoloured, slot);
          lastRecoloured = slot;
        }
        slot += 1;
      }
      for (const { mesh } of parts) {
        showPrefix(mesh, slot);
      }
      if (beacons) {
        showPrefix(beacons, cop);
      }
      upload(paint, firstRecoloured, lastRecoloured + 1);
      upload(trim, firstRecoloured, lastRecoloured + 1);
    },
    dispose() {
      disposeTree(group);
    },
    group,
    roots,
    sag(index, metres) {
      sags[index] = metres;
    },
    show(index) {
      shown[index] = 1;
    },
    spin(index, distance) {
      for (const wheel of wheels) {
        wheel.turns[index] =
          (wheel.turns[index] ?? 0) + distance / wheel.radius;
      }
    },
  };
};

export const poseOnTrack = (
  target: THREE.Object3D,
  track: Track,
  s: number,
  x: number,
  lift: number,
  yaw: number,
  roll: number,
  pitch: number
): void => {
  placeOnGround(track, s, x, point);
  target.position.set(point.x, point.y + lift, point.z);
  target.rotation.set(
    Math.atan(point.slope) + pitch,
    -(point.heading + yaw),
    -roll,
    "YXZ"
  );
};

const paints = [
  0xe8_e2_d6, 0x2f_6f_d0, 0xc8_32_3c, 0x2f_8f_6b, 0xd8_a0_20, 0x3a_35_50,
];
const BOXY_HEIGHT = 1.8;
const WHITE: Palette = new Map([["body", "#ffffff"]]);
const NO_PAINT: Palette = new Map();

interface FleetPart {
  readonly mesh: THREE.InstancedMesh;
  readonly cars: readonly number[];
  readonly painted: boolean;
}

export interface Fleet {
  readonly group: THREE.Group;
  place: (track: Track, index: number, s: number) => void;
  commit: (centre: number) => void;
  dispose: () => void;
}

const sizeOf = (primitives: readonly Primitive[]): THREE.Vector3 => {
  const bounds = new THREE.Box3();
  for (const primitive of primitives) {
    primitive.geometry.computeBoundingBox();
    if (primitive.geometry.boundingBox) {
      bounds.union(primitive.geometry.boundingBox);
    }
  }
  return bounds.getSize(new THREE.Vector3());
};

export const createFleet = (
  assets: Assets,
  shading: Shading,
  cars: readonly TrafficView[]
): Fleet => {
  const group = new THREE.Group();
  const parts: FleetPart[] = [];
  const local: THREE.Matrix4[] = cars.map(() => new THREE.Matrix4());
  const along = new Float64Array(cars.length);
  const reach = shading.look.fogFar + FLEET_MARGIN;
  const scratch = new THREE.Object3D();
  const color = new THREE.Color();

  const muster = (primitives: readonly Primitive[], boxy: boolean): void => {
    const members = cars
      .map((car, index) => ({ car, index }))
      .filter(({ car }) => car.height > BOXY_HEIGHT === boxy);
    if (members.length === 0) {
      return;
    }
    const size = sizeOf(primitives);
    for (const { car, index } of members) {
      scratch.position.set(0, 0, 0);
      scratch.rotation.set(0, Math.PI, 0);
      scratch.scale.set(
        (car.halfWidth * 2) / size.x,
        car.height / size.y,
        (car.halfLength * 2) / size.z
      );
      scratch.updateMatrix();
      local[index]?.copy(scratch.matrix);
    }
    const indices = members.map(({ index }) => index);
    const body = paintPrimitives(
      primitives.filter((primitive) => primitive.slot === "body"),
      WHITE
    );
    const rest = paintPrimitives(
      primitives.filter((primitive) => primitive.slot !== "body"),
      NO_PAINT
    );
    const addPart = (
      geometry: THREE.BufferGeometry | null,
      material: THREE.Material,
      shadows: boolean,
      painted: boolean
    ): void => {
      if (!geometry) {
        material.dispose();
        return;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, members.length);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      whiteInstances(mesh);
      group.add(mesh);
      parts.push({ cars: indices, mesh, painted });
    };
    addPart(body.cel, shading.paint(), true, true);
    addPart(rest.cel, shading.paint(), true, false);
    addPart(rest.glow, shading.glowPaint(), false, false);
  };

  muster(assets.car, false);
  muster(assets.van, true);
  freeze(group);

  const base = new THREE.Object3D();
  const world = new THREE.Matrix4();
  const spot: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  const placed: THREE.Matrix4[] = cars.map(() => new THREE.Matrix4());
  const placedAt = new Float64Array(cars.length).fill(Number.NaN);
  let road: Track | null = null;

  const placeCar = (track: Track, index: number, s: number): void => {
    const car = cars[index];
    const fit = local[index];
    if (!(car && fit)) {
      return;
    }
    placeOnGround(track, s, car.x, spot);
    base.position.set(spot.x, spot.y, spot.z);
    const oncoming = car.cruiseSpeed < 0;
    base.rotation.set(
      Math.atan(spot.slope) * (oncoming ? -1 : 1),
      -spot.heading + (oncoming ? Math.PI : 0),
      0,
      "YXZ"
    );
    base.updateMatrix();
    placed[index]?.copy(world.multiplyMatrices(base.matrix, fit));
  };

  return {
    commit(centre) {
      const from = centre - FLEET_BEHIND;
      const to = centre + reach;
      for (const part of parts) {
        let slot = 0;
        for (const index of part.cars) {
          const matrix = placed[index];
          const s = along[index] ?? Number.NEGATIVE_INFINITY;
          if (!matrix || s < from || s > to) {
            continue;
          }
          if (road && placedAt[index] !== s) {
            placeCar(road, index, s);
            placedAt[index] = s;
          }
          part.mesh.setMatrixAt(slot, matrix);
          if (part.painted) {
            const paint = cars[index]?.paint ?? 0;
            part.mesh.setColorAt(
              slot,
              color.setHex(paints[paint] ?? 0x88_88_88)
            );
          }
          slot += 1;
        }
        part.mesh.count = slot;
        part.mesh.instanceMatrix.needsUpdate = true;
        if (part.painted && part.mesh.instanceColor) {
          part.mesh.instanceColor.needsUpdate = true;
        }
      }
    },
    dispose() {
      disposeTree(group);
    },
    group,
    place(track, index, s) {
      road = track;
      along[index] = s;
    },
  };
};
