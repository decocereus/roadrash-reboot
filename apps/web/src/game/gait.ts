import * as THREE from "three";

import type { RiderAsset } from "./assets.ts";
import { MOVE_RATE } from "./rider-moves.ts";
import type { Move, MoveName, RiderMoves } from "./rider-moves.ts";

const CONTACT_REACH = 0.01;
const PLANTED_REACH = 0.02;
const FEET = [
  ["foot_l", "ball_l"],
  ["foot_r", "ball_r"],
] as const;

export interface Stride {
  readonly frames: number;
  readonly seconds: number;
  readonly poses: number[];
  readonly lifts: readonly number[];
  readonly planted: readonly boolean[];
  readonly left: number;
  readonly right: number;
  readonly speed: number;
}

export interface Gait {
  readonly idle: Stride;
  readonly walk: Stride;
  readonly jog: Stride;
  readonly sprint: Stride;
}

interface Skeleton {
  readonly parents: readonly number[];
  readonly order: readonly number[];
  readonly base: readonly THREE.Quaternion[];
  readonly offsets: readonly THREE.Vector3[];
  readonly rest: readonly THREE.Quaternion[];
}

const skeletonOf = (
  scene: THREE.Object3D,
  names: readonly string[],
  needs: (name: string) => boolean
): Skeleton => {
  scene.updateMatrixWorld(true);
  const nodes = names.map((name) => {
    const node = scene.getObjectByName(name);
    if (!node && needs(name)) {
      throw new Error(`The skeleton has no ${name}.`);
    }
    return node ?? null;
  });
  const parents = nodes.map((node) =>
    node?.parent ? nodes.indexOf(node.parent) : -1
  );
  const depthOf = (bone: number): number => {
    const parent = parents[bone] ?? -1;
    return parent < 0 ? 0 : 1 + depthOf(parent);
  };
  const depths = nodes.map((_, bone) => depthOf(bone));
  return {
    base: nodes.map(
      (node) =>
        node?.parent?.getWorldQuaternion(new THREE.Quaternion()) ??
        new THREE.Quaternion()
    ),
    offsets: nodes.map((node) => node?.position.clone() ?? new THREE.Vector3()),
    order: nodes
      .map((_, bone) => bone)
      .toSorted((a, b) => (depths[a] ?? 0) - (depths[b] ?? 0)),
    parents,
    rest: nodes.map(
      (node) => node?.quaternion.clone() ?? new THREE.Quaternion()
    ),
  };
};

const at = <Value>(list: readonly Value[], index: number): Value => {
  const value = list[index];
  if (value === undefined) {
    throw new Error(`Nothing is at ${String(index)}.`);
  }
  return value;
};

const turnsOf = (count: number) =>
  Array.from({ length: count }, () => new THREE.Quaternion());

const parentTurn = (
  skeleton: Skeleton,
  world: readonly THREE.Quaternion[],
  bone: number
): THREE.Quaternion => {
  const parent = at(skeleton.parents, bone);
  return parent < 0 ? at(skeleton.base, bone) : at(world, parent);
};

const worldOf = (
  skeleton: Skeleton,
  local: (bone: number, into: THREE.Quaternion) => THREE.Quaternion,
  world: THREE.Quaternion[]
) => {
  const turn = new THREE.Quaternion();
  for (const bone of skeleton.order) {
    at(world, bone)
      .copy(parentTurn(skeleton, world, bone))
      .multiply(local(bone, turn));
  }
};

interface Fitting {
  readonly names: readonly string[];
  readonly moves: RiderMoves;
  readonly mover: Skeleton;
  readonly rider: Skeleton;
  readonly animated: readonly number[];
  readonly stand: readonly number[];
  readonly fit: readonly THREE.Quaternion[];
  readonly hips: number;
  readonly sole: number;
  readonly travelTurn: THREE.Quaternion;
}

const placesOf = (
  { offsets, order, parents }: Skeleton,
  world: readonly THREE.Quaternion[],
  pelvis: number,
  hips: THREE.Vector3,
  places: readonly THREE.Vector3[]
) => {
  for (const bone of order) {
    const parent = at(parents, bone);
    const place = at(places, bone);
    if (bone === pelvis) {
      place.copy(hips);
    } else if (parent < 0) {
      place.set(0, 0, 0);
    } else {
      place
        .copy(at(offsets, bone))
        .applyQuaternion(at(world, parent))
        .add(at(places, parent));
    }
  }
};

const moverLocal =
  (fitting: Fitting, move: Move, frame: number) =>
  (bone: number, into: THREE.Quaternion): THREE.Quaternion => {
    const source = at(fitting.animated, bone);
    if (source < 0) {
      return into.copy(at(fitting.mover.rest, bone));
    }
    return into.fromArray(
      move.turns,
      (frame * fitting.moves.bones.length + source) * 4
    );
  };

const standLocal =
  (stand: readonly number[]) =>
  (bone: number, into: THREE.Quaternion): THREE.Quaternion =>
    into.fromArray(stand, bone * 4);

const fittingOf = (asset: RiderAsset, moves: RiderMoves): Fitting => {
  const stand = asset.poses.get("stand");
  if (!stand) {
    throw new Error("The rider model has no stand pose.");
  }
  const mover = skeletonOf(moves.scene, asset.bones, (name) =>
    moves.bones.includes(name)
  );
  const rider = skeletonOf(asset.scene, asset.bones, () => true);
  const pelvis = asset.bones.indexOf("pelvis");
  const hip = moves.scene.getObjectByName("pelvis")?.parent;
  if (pelvis === -1 || !hip) {
    throw new Error("The rider moves have no pelvis.");
  }
  const animated = asset.bones.map((name) => moves.bones.indexOf(name));
  const partial: Fitting = {
    animated,
    fit: [],
    hips: 1,
    mover,
    moves,
    names: asset.bones,
    rider,
    sole: 0,
    stand,
    travelTurn: hip.getWorldQuaternion(new THREE.Quaternion()),
  };
  const moverStand = turnsOf(asset.bones.length);
  const riderStand = turnsOf(asset.bones.length);
  worldOf(mover, moverLocal(partial, moves.stand, 0), moverStand);
  worldOf(rider, standLocal(stand), riderStand);
  const places = turnsOf(asset.bones.length).map(() => new THREE.Vector3());
  placesOf(rider, riderStand, pelvis, new THREE.Vector3(), places);
  const balls = FEET.map(([, ball]) => at(places, asset.bones.indexOf(ball)).y);
  const moverHips = hip.localToWorld(
    new THREE.Vector3().fromArray(moves.stand.travel, 0)
  ).y;
  return {
    ...partial,
    fit: moverStand.map((turn, bone) =>
      turn.clone().invert().multiply(at(riderStand, bone))
    ),
    hips: asset.standHeight / moverHips,
    sole: Math.min(...balls),
  };
};

interface Sole {
  readonly ankle: THREE.Vector3[];
  readonly ball: THREE.Vector3[];
}

const solesOf = (frames: number): Sole[] =>
  FEET.map(() => ({
    ankle: Array.from({ length: frames }, () => new THREE.Vector3()),
    ball: Array.from({ length: frames }, () => new THREE.Vector3()),
  }));

const lowest = (points: readonly THREE.Vector3[]): number =>
  Math.min(...points.map(({ y }) => y));

const strikeOf = (sole: Sole): number => {
  const heel = lowest(sole.ankle) + CONTACT_REACH;
  const frames = sole.ankle.length;
  for (let frame = 0; frame < frames; frame += 1) {
    const now = at(sole.ankle, frame).y;
    const before = at(sole.ankle, (frame + frames - 1) % frames).y;
    if (now < heel && heel <= before) {
      return frame;
    }
  }
  return 0;
};

const plantedTravel = ({ ball }: Sole, from: number, to: number): number => {
  const low = lowest(ball) + PLANTED_REACH;
  const a = at(ball, from);
  const b = at(ball, to);
  return a.y < low && b.y < low ? Math.hypot(b.x - a.x, b.z - a.z) : -1;
};

const speedOf = (soles: readonly Sole[], frames: number): number => {
  let travel = 0;
  let planted = 0;
  for (const sole of soles) {
    for (let frame = 0; frame < frames; frame += 1) {
      const moved = plantedTravel(sole, frame, (frame + 1) % frames);
      if (moved >= 0) {
        travel += moved;
        planted += 1;
      }
    }
  }
  return planted > 0 ? (travel / planted) * MOVE_RATE : 0;
};

const boneOf = ({ names }: Fitting, name: string): number => {
  const bone = names.indexOf(name);
  if (bone === -1) {
    throw new Error(`The rider model has no ${name}.`);
  }
  return bone;
};

const strideOf = (fitting: Fitting, move: Move, name: MoveName): Stride => {
  const { mover, rider } = fitting;
  const count = rider.parents.length;
  const poses = Array.from({ length: move.frames * count * 4 }, () => 0);
  const lifts = Array.from({ length: move.frames * 3 }, () => 0);
  const moverWorld = turnsOf(count);
  const riderWorld = turnsOf(count);
  const places = Array.from({ length: count }, () => new THREE.Vector3());
  const lift = new THREE.Vector3();
  const standing = new THREE.Vector3().fromArray(fitting.moves.stand.travel);
  const soles = solesOf(move.frames);
  const feet = FEET.map(([ankle, ball]) => [
    boneOf(fitting, ankle),
    boneOf(fitting, ball),
  ]);
  const pelvis = boneOf(fitting, "pelvis");
  const turn = new THREE.Quaternion();
  for (let frame = 0; frame < move.frames; frame += 1) {
    worldOf(mover, moverLocal(fitting, move, frame), moverWorld);
    for (const bone of rider.order) {
      const above = parentTurn(rider, riderWorld, bone);
      const world = at(riderWorld, bone);
      if (at(fitting.animated, bone) < 0) {
        world.copy(above).multiply(turn.fromArray(fitting.stand, bone * 4));
      } else {
        world.copy(at(moverWorld, bone)).multiply(at(fitting.fit, bone));
      }
      turn
        .copy(above)
        .invert()
        .multiply(world)
        .toArray(poses, (frame * count + bone) * 4);
    }
    lift
      .fromArray(move.travel, frame * 3)
      .sub(standing)
      .applyQuaternion(fitting.travelTurn)
      .multiplyScalar(fitting.hips);
    lifts[frame * 3] = -lift.x;
    lifts[frame * 3 + 1] = lift.y;
    lifts[frame * 3 + 2] = -lift.z;
    placesOf(rider, riderWorld, pelvis, lift, places);
    for (let side = 0; side < FEET.length; side += 1) {
      const [ankle = -1, ball = -1] = at(feet, side);
      const sole = at(soles, side);
      at(sole.ankle, frame).copy(at(places, ankle));
      at(sole.ball, frame).copy(at(places, ball));
    }
  }
  const seconds = move.frames / MOVE_RATE;
  const planted = Array.from({ length: move.frames * 2 }, (_, index) => {
    const { ball } = at(soles, index % 2);
    return at(ball, Math.floor(index / 2)).y < lowest(ball) + PLANTED_REACH;
  });
  let ground = 0;
  for (const { ball } of soles) {
    ground += lowest(ball) / soles.length;
  }
  for (let frame = 0; frame < move.frames; frame += 1) {
    lifts[frame * 3 + 1] = (lifts[frame * 3 + 1] ?? 0) + fitting.sole - ground;
  }
  const walking = name !== "idle";
  return {
    frames: move.frames,
    left: walking ? strikeOf(at(soles, 0)) / MOVE_RATE : 0,
    lifts,
    planted,
    poses,
    right: walking ? strikeOf(at(soles, 1)) / MOVE_RATE : seconds / 2,
    seconds,
    speed: walking ? speedOf(soles, move.frames) : 0,
  };
};

const fitted = new WeakMap<RiderMoves, WeakMap<RiderAsset, Gait>>();

export const gaitOf = (asset: RiderAsset, moves: RiderMoves): Gait => {
  const byRider = fitted.get(moves) ?? new WeakMap<RiderAsset, Gait>();
  fitted.set(moves, byRider);
  const known = byRider.get(asset);
  if (known) {
    return known;
  }
  const fitting = fittingOf(asset, moves);
  const gait = {
    idle: strideOf(fitting, moves.moves.idle, "idle"),
    jog: strideOf(fitting, moves.moves.jog, "jog"),
    sprint: strideOf(fitting, moves.moves.sprint, "sprint"),
    walk: strideOf(fitting, moves.moves.walk, "walk"),
  } satisfies Record<MoveName, Stride>;
  byRider.set(asset, gait);
  return gait;
};
