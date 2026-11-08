import { trafficPaints } from "@racer/sim/palette";
import type { CrossCarView, TrafficView } from "@racer/sim/race-view";
import { carSlant, PAINT_COUNT } from "@racer/sim/traffic";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";

import { reachOf } from "./actors.ts";
import type { Assets } from "./assets.ts";
import type { Shading } from "./cel.ts";
import type { CrossCarPose } from "./cross-car-pose.ts";
import { disposeTree } from "./dispose.ts";
import { freeze, placeOnGround, whiteInstances } from "./ground.ts";
import { paintPrimitives } from "./model-slots.ts";
import type { Palette, Primitive } from "./model-slots.ts";
import { uploadSpan } from "./uploads.ts";

const BOXY_HEIGHT = 1.8;
const WHITE: Palette = new Map([["body", "#ffffff"]]);
const SIDE_STRIPE: Palette = new Map([["accent", "#ff00ff"]]);

interface FleetMember {
  readonly index: number;
  readonly colour: THREE.Color;
}

interface FleetPart {
  readonly mesh: THREE.InstancedMesh;
  readonly cars: readonly FleetMember[];
  readonly slotCar: Int32Array | null;
}

export interface Fleet {
  readonly group: THREE.Group;
  place: (track: Track, index: number, s: number) => void;
  placeCrossCar: (
    track: Track,
    index: number,
    pose: Readonly<CrossCarPose>
  ) => void;
  hideCrossCar: (index: number) => void;
  commit: (centre: number) => void;
  dispose: () => void;
}

interface FleetBody {
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly height: number;
  readonly paint: number;
}

const colourOf = (paint: number): THREE.Color => {
  const hex = trafficPaints[paint];
  if (hex === undefined) {
    throw new Error(`Traffic paint ${paint} has no colour.`);
  }
  return new THREE.Color(hex);
};

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

const DECK_CAR = { halfLength: 2.2, halfWidth: 0.92, height: 1.45 };
const CARRIER_DECKS = [
  { along: 8.85, y: 1.18 },
  { along: 4.5, y: 1.18 },
  { along: 0.15, y: 1.18 },
  { along: 8.85, y: 2.72 },
  { along: 4.5, y: 2.72 },
  { along: 0.15, y: 2.72 },
] as const;

export const createFleet = (
  assets: Assets,
  shading: Shading,
  cars: readonly TrafficView[],
  crossCars: readonly CrossCarView[]
): Fleet => {
  const group = new THREE.Group();
  const parts: FleetPart[] = [];
  const carriers = cars.flatMap((car, index) => (car.carrier ? [index] : []));
  const deckOwner = carriers.flatMap((owner) => CARRIER_DECKS.map(() => owner));
  const firstDeckCar = cars.length + crossCars.length;
  const bodies: readonly FleetBody[] = [
    ...cars,
    ...crossCars.map((car) => ({
      halfLength: car.bodyHalfLength,
      halfWidth: car.bodyHalfWidth,
      height: car.height,
      paint: car.paint,
    })),
    ...deckOwner.map((owner, slot) => ({
      ...DECK_CAR,
      paint: ((cars[owner]?.paint ?? 0) + slot + 1) % PAINT_COUNT,
    })),
  ];
  const local: THREE.Matrix4[] = bodies.map(() => new THREE.Matrix4());
  const along = new Float64Array(bodies.length);
  const reach = reachOf(shading);
  const scratch = new THREE.Object3D();

  const muster = (
    primitives: readonly Primitive[],
    belongs: (car: FleetBody, index: number) => boolean
  ): void => {
    const members = bodies
      .map((car, index) => ({ car, index }))
      .filter(({ car, index }) => belongs(car, index));
    if (members.length === 0) {
      return;
    }
    const size = sizeOf(primitives);
    for (const { car, index } of members) {
      const deck = CARRIER_DECKS[(index - firstDeckCar) % CARRIER_DECKS.length];
      if (index >= firstDeckCar && deck) {
        scratch.position.set(0, deck.y, -deck.along);
      } else {
        scratch.position.set(0, 0, 0);
      }
      scratch.rotation.set(0, Math.PI, 0);
      scratch.scale.set(
        (car.halfWidth * 2) / size.x,
        car.height / size.y,
        (car.halfLength * 2) / size.z
      );
      scratch.updateMatrix();
      local[index]?.copy(scratch.matrix);
    }
    const roster = members.map(({ car, index }) => ({
      colour: colourOf(car.paint),
      index,
    }));
    const body = paintPrimitives(
      primitives.filter((primitive) => primitive.slot === "body"),
      WHITE
    );
    const rest = paintPrimitives(
      primitives.filter((primitive) => primitive.slot !== "body"),
      SIDE_STRIPE
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
      parts.push({
        cars: roster,
        mesh,
        slotCar: painted ? new Int32Array(members.length).fill(-1) : null,
      });
    };
    addPart(body.cel, shading.paint(null), true, true);
    addPart(rest.cel, shading.paint(null), true, false);
    addPart(rest.glow, shading.glowPaint(), false, false);
  };

  const isCarrier = (index: number): boolean =>
    index < cars.length && cars[index]?.carrier === true;
  muster(
    assets.car,
    (car, index) => car.height <= BOXY_HEIGHT && !isCarrier(index)
  );
  muster(
    assets.van,
    (car, index) => car.height > BOXY_HEIGHT && !isCarrier(index)
  );
  muster(assets.truck, (_car, index) => isCarrier(index));
  freeze(group);

  const base = new THREE.Object3D();
  const world = new THREE.Matrix4();
  const spot: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  const placed: THREE.Matrix4[] = bodies.map(() => new THREE.Matrix4());
  const placedAt = new Float64Array(bodies.length).fill(Number.NaN);
  let road: Track | null = null;

  const fitInto = (index: number): void => {
    const fit = local[index];
    if (fit) {
      base.updateMatrix();
      placed[index]?.copy(world.multiplyMatrices(base.matrix, fit));
    }
  };

  const ownerOf = (index: number): number =>
    index >= firstDeckCar ? (deckOwner[index - firstDeckCar] ?? index) : index;

  const placeCar = (track: Track, index: number, s: number): void => {
    const car = cars[ownerOf(index)];
    if (!car) {
      return;
    }
    placeOnGround(track, s, car.x, spot);
    base.position.set(spot.x, spot.y, spot.z);
    const oncoming = car.cruiseSpeed < 0;
    base.rotation.set(
      Math.atan(spot.slope) * (oncoming ? -1 : 1),
      -spot.heading -
        Math.atan(carSlant(car, track, s)) +
        (oncoming ? Math.PI : 0),
      0,
      "YXZ"
    );
    fitInto(index);
  };

  const recolour = (
    part: FleetPart,
    slot: number,
    { colour, index }: FleetMember
  ): boolean => {
    if (!part.slotCar || part.slotCar[slot] === index) {
      return false;
    }
    part.slotCar[slot] = index;
    part.mesh.setColorAt(slot, colour);
    return true;
  };

  return {
    commit(centre) {
      const from = centre - reach.behind;
      const to = centre + reach.ahead;
      for (const part of parts) {
        let slot = 0;
        let firstRecoloured = part.cars.length;
        let lastRecoloured = -1;
        for (const member of part.cars) {
          const { index } = member;
          const matrix = placed[index];
          const s = along[ownerOf(index)] ?? Number.NEGATIVE_INFINITY;
          if (!matrix || s < from || s > to) {
            continue;
          }
          if (
            road &&
            (index < cars.length || index >= firstDeckCar) &&
            placedAt[index] !== s
          ) {
            placeCar(road, index, s);
            placedAt[index] = s;
          }
          part.mesh.setMatrixAt(slot, matrix);
          if (recolour(part, slot, member)) {
            firstRecoloured = Math.min(firstRecoloured, slot);
            lastRecoloured = slot;
          }
          slot += 1;
        }
        part.mesh.count = slot;
        uploadSpan(part.mesh.instanceMatrix, 0, slot);
        if (part.mesh.instanceColor) {
          uploadSpan(
            part.mesh.instanceColor,
            firstRecoloured,
            lastRecoloured + 1
          );
        }
      }
    },
    dispose() {
      disposeTree(group);
    },
    group,
    hideCrossCar(index) {
      along[cars.length + index] = Number.NEGATIVE_INFINITY;
    },
    place(track, index, s) {
      road = track;
      along[index] = s;
    },
    placeCrossCar(track, index, pose) {
      const at = cars.length + index;
      road = track;
      along[at] = pose.s;
      placeOnGround(track, pose.s, pose.x, spot);
      base.position.set(spot.x, spot.y, spot.z);
      base.rotation.set(0, -spot.heading + pose.yaw, 0, "YXZ");
      fitInto(at);
    },
  };
};
