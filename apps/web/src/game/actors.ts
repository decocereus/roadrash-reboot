import { riderPalette } from "@racer/sim/palette";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { glows, paintPrimitives } from "./assets.ts";
import type { Assets, BikeParts, Palette, Primitive } from "./assets.ts";
import type { BikeModelId } from "./bike-models.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { placeOnGround } from "./ground.ts";
import { uploadSpan } from "./uploads.ts";

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
  readonly model: BikeModelId;
  readonly paint: number;
  readonly police: boolean;
  readonly livery?:
    | { readonly bike: number; readonly trim: number }
    | undefined;
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

interface ModelFleet {
  readonly parts: readonly BikePart[];
  readonly paint: THREE.InstancedBufferAttribute;
  readonly trim: THREE.InstancedBufferAttribute;
  readonly slotRider: Int32Array;
  count: number;
  firstRecoloured: number;
  lastRecoloured: number;
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

const showPrefix = (mesh: THREE.InstancedMesh, count: number): void => {
  mesh.count = count;
  mesh.visible = count > 0;
  uploadSpan(mesh.instanceMatrix, 0, count);
};

export const createBikes = (
  assets: Pick<Assets, "bikes">,
  shading: Shading,
  riders: readonly BikeRider[]
): Bikes => {
  const group = new THREE.Group();
  const capacity = riders.length;
  const roots = riders.map(() => new THREE.Object3D());
  const paints = new Float32Array(capacity * 3);
  const trims = new Float32Array(capacity * 3);
  const tint = new THREE.Color();
  const store = (
    into: Float32Array,
    slot: number,
    colour: THREE.ColorRepresentation
  ): void => {
    tint.set(colour).toArray(into, slot * 3);
  };
  for (let index = 0; index < riders.length; index += 1) {
    const rider = riders[index];
    if (!rider) {
      continue;
    }
    const colours = rider.livery ?? riderPalette[rider.paint];
    store(paints, index, colours?.bike ?? DEFAULT_PAINT);
    store(trims, index, colours?.trim ?? DARK_TRIM);
  }
  const material = liveried(shading.figure(null));
  const wheels: Wheel[] = WHEELS.map(([, radius, z]) => ({
    frame: new THREE.Matrix4(),
    radius,
    turns: new Float64Array(capacity),
    z,
  }));

  const modelFleet = (bike: BikeParts, seats: number): ModelFleet => {
    const paint = new THREE.InstancedBufferAttribute(
      new Float32Array(seats * 3),
      3
    );
    const trim = new THREE.InstancedBufferAttribute(
      new Float32Array(seats * 3),
      3
    );
    const parts: BikePart[] = [];
    const addPart = (
      name: string,
      wheel: Wheel | null,
      shift: THREE.Vector3
    ) => {
      const primitives = bike.get(name) ?? [];
      const painted = paintPrimitives(primitives, LIVERY_SLOTS);
      if (painted.cel) {
        const geometry = painted.cel.translate(shift.x, shift.y, shift.z);
        geometry.setAttribute(
          "livery",
          liveryOf(primitives, geometry.getAttribute("position").count)
        );
        geometry.setAttribute("instancePaint", paint);
        geometry.setAttribute("instanceTrim", trim);
        const mesh = instanced(geometry, material, seats, true);
        group.add(mesh);
        parts.push({ mesh, wheel });
      }
      if (painted.glow) {
        const geometry = painted.glow.translate(shift.x, shift.y, shift.z);
        const mesh = instanced(geometry, shading.glowPaint(), seats, false);
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
    return {
      count: 0,
      firstRecoloured: seats,
      lastRecoloured: -1,
      paint,
      parts,
      slotRider: new Int32Array(seats).fill(-1),
      trim,
    };
  };

  const fleetByModel = new Map<BikeModelId, ModelFleet>();
  const fleetOf = riders.map((rider) => {
    const known = fleetByModel.get(rider.model);
    if (known) {
      return known;
    }
    const seats = riders.filter((each) => each.model === rider.model).length;
    const fleet = modelFleet(assets.bikes[rider.model], seats);
    fleetByModel.set(rider.model, fleet);
    return fleet;
  });
  const fleets = [...fleetByModel.values()];
  const police = riders.filter((rider) => rider.police).length;
  const beacons =
    police > 0
      ? instanced(beaconGeometry(), shading.glowPaint(), police, false)
      : null;
  if (beacons) {
    group.add(beacons);
  }

  const shown = new Uint8Array(capacity);
  const sags = new Float32Array(capacity);
  const frame = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const pivot = new THREE.Matrix4();

  const recolour = (fleet: ModelFleet, slot: number, index: number): void => {
    if (fleet.slotRider[slot] === index) {
      return;
    }
    fleet.slotRider[slot] = index;
    fleet.firstRecoloured = Math.min(fleet.firstRecoloured, slot);
    fleet.lastRecoloured = slot;
    fleet.paint.setXYZ(
      slot,
      paints[index * 3] ?? 1,
      paints[index * 3 + 1] ?? 1,
      paints[index * 3 + 2] ?? 1
    );
    fleet.trim.setXYZ(
      slot,
      trims[index * 3] ?? 1,
      trims[index * 3 + 1] ?? 1,
      trims[index * 3 + 2] ?? 1
    );
  };

  return {
    commit(anchor) {
      group.position.copy(anchor);
      let cop = 0;
      for (const fleet of fleets) {
        fleet.count = 0;
        fleet.firstRecoloured = fleet.slotRider.length;
        fleet.lastRecoloured = -1;
      }
      for (let index = 0; index < capacity; index += 1) {
        const root = roots[index];
        const fleet = fleetOf[index];
        if (shown[index] === 0 || !root || !fleet) {
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
        for (const part of fleet.parts) {
          part.mesh.setMatrixAt(fleet.count, part.wheel?.frame ?? body);
        }
        if (beacons && riders[index]?.police === true) {
          beacons.setMatrixAt(cop, body);
          cop += 1;
        }
        recolour(fleet, fleet.count, index);
        fleet.count += 1;
      }
      for (const fleet of fleets) {
        for (const { mesh } of fleet.parts) {
          showPrefix(mesh, fleet.count);
        }
        uploadSpan(
          fleet.paint,
          fleet.firstRecoloured,
          fleet.lastRecoloured + 1
        );
        uploadSpan(fleet.trim, fleet.firstRecoloured, fleet.lastRecoloured + 1);
      }
      if (beacons) {
        showPrefix(beacons, cop);
      }
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
