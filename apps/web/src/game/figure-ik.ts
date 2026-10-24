import * as THREE from "three";

const REACH_SLACK = 0.002;

export const turnInWorld = (bone: THREE.Object3D, turn: THREE.Quaternion) => {
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parent);
  bone.quaternion.copy(parent.invert().multiply(turn.clone().multiply(world)));
  bone.updateMatrixWorld(true);
};

export interface Joint {
  readonly index: number;
  readonly parent: Joint | null;
  readonly offset: THREE.Vector3;
  readonly at: THREE.Vector3;
  readonly turn: THREE.Quaternion;
}

export interface Chain {
  readonly joints: readonly Joint[];
  readonly baseAt: THREE.Vector3;
  readonly baseTurn: THREE.Quaternion;
}

export interface Limb {
  readonly girdle: Joint | null;
  readonly bones: readonly [upper: Joint, lower: Joint, end: Joint];
}

export interface Grip {
  readonly limb: Limb;
  readonly reach: number;
  readonly at: THREE.Vector3;
  readonly facing: THREE.Quaternion;
}

const pivot = new THREE.Vector3();
const arm = new THREE.Vector3();
const toward = new THREE.Vector3();
const along = new THREE.Vector3();
const across = new THREE.Vector3();
const hinge = new THREE.Vector3();
const shin = new THREE.Vector3();
const bent = new THREE.Vector3();
const local = new THREE.Quaternion();
const spin = new THREE.Quaternion();

export const placeChain = (
  chain: Chain,
  pose: readonly number[],
  lift: THREE.Vector3
) => {
  for (const joint of chain.joints) {
    const { parent } = joint;
    if (parent) {
      pivot.copy(parent.at);
    } else {
      pivot.addVectors(chain.baseAt, lift);
    }
    const parentTurn = parent ? parent.turn : chain.baseTurn;
    joint.at.copy(joint.offset).applyQuaternion(parentTurn).add(pivot);
    joint.turn
      .copy(parentTurn)
      .multiply(local.fromArray(pose, joint.index * 4).normalize());
  }
};

const turnAbout = (
  joints: readonly Joint[],
  from: number,
  centre: THREE.Vector3,
  turn: THREE.Quaternion
) => {
  pivot.copy(centre);
  for (let at = from; at < joints.length; at += 1) {
    const joint = joints[at];
    joint?.at.sub(pivot).applyQuaternion(turn).add(pivot);
    joint?.turn.premultiply(turn);
  }
};

const swingInto = (
  point: THREE.Vector3,
  centre: THREE.Vector3,
  axis: THREE.Vector3,
  target: THREE.Vector3,
  reach: number,
  limit: number
): number => {
  arm.subVectors(point, centre);
  toward.subVectors(target, centre);
  along.copy(axis).multiplyScalar(arm.dot(axis));
  arm.sub(along);
  across.crossVectors(axis, arm);
  const ahead = arm.dot(toward);
  const aside = across.dot(toward);
  const wanted =
    (point.distanceToSquared(centre) + toward.lengthSq() - reach * reach) / 2 -
    along.dot(toward);
  if (ahead >= wanted) {
    return 0;
  }
  const best = Math.atan2(aside, ahead);
  const span = Math.hypot(ahead, aside);
  const needed = wanted >= span ? best : best - Math.acos(wanted / span);
  return THREE.MathUtils.clamp(needed, 0, limit);
};

export const swingGirdle = (grip: Grip, limit: number) => {
  const { bones, girdle } = grip.limb;
  if (!girdle) {
    return;
  }
  const [shoulder] = bones;
  hinge
    .subVectors(shoulder.at, girdle.at)
    .cross(bent.subVectors(grip.at, girdle.at))
    .normalize();
  const angle = swingInto(
    shoulder.at,
    girdle.at,
    hinge,
    grip.at,
    grip.reach,
    limit
  );
  if (angle > 0) {
    spin.setFromAxisAngle(hinge, angle);
    girdle.turn.premultiply(spin);
    turnAbout(bones, 0, girdle.at, spin);
  }
};

export const leanToward = (
  torso: Joint,
  above: readonly Joint[],
  axis: THREE.Vector3,
  grips: readonly Grip[],
  limit: number
) => {
  let angle = 0;
  for (const grip of grips) {
    const [shoulder] = grip.limb.bones;
    if (above.includes(shoulder)) {
      angle = Math.max(
        angle,
        swingInto(shoulder.at, torso.at, axis, grip.at, grip.reach, limit)
      );
    }
  }
  if (angle > 0) {
    turnAbout(above, 0, torso.at, spin.setFromAxisAngle(axis, angle));
  }
};

const interiorAngle = (upper: number, lower: number, span: number): number =>
  Math.acos(
    THREE.MathUtils.clamp(
      (upper * upper + lower * lower - span * span) / (2 * upper * lower),
      -1,
      1
    )
  );

const spanAfter = (
  angle: number,
  middle: THREE.Vector3,
  joint: THREE.Vector3
): number =>
  bent.copy(shin).applyAxisAngle(hinge, angle).add(middle).distanceTo(joint);

export const reachFor = (grip: Grip) => {
  const { bones } = grip.limb;
  const [upper, lower, end] = bones;
  const upperLength = upper.at.distanceTo(lower.at);
  const lowerLength = lower.at.distanceTo(end.at);
  const span = THREE.MathUtils.clamp(
    upper.at.distanceTo(grip.at),
    Math.abs(upperLength - lowerLength) + REACH_SLACK,
    upperLength + lowerLength - REACH_SLACK
  );
  const opening =
    interiorAngle(upperLength, lowerLength, span) -
    interiorAngle(upperLength, lowerLength, upper.at.distanceTo(end.at));
  shin.subVectors(end.at, lower.at);
  hinge.subVectors(lower.at, upper.at).cross(shin).normalize();
  const angle =
    Math.abs(spanAfter(opening, lower.at, upper.at) - span) <=
    Math.abs(spanAfter(-opening, lower.at, upper.at) - span)
      ? opening
      : -opening;
  turnAbout(bones, 1, lower.at, spin.setFromAxisAngle(hinge, angle));
  turnAbout(
    bones,
    0,
    upper.at,
    spin.setFromUnitVectors(
      arm.subVectors(end.at, upper.at).normalize(),
      toward.subVectors(grip.at, upper.at).normalize()
    )
  );
  end.turn.copy(grip.facing);
};

export const reachOf = ({ bones: [, lower, end] }: Limb): number =>
  lower.offset.length() + end.offset.length() - REACH_SLACK;

export const writeLocal = (chain: Chain, pose: number[], joint: Joint) => {
  local
    .copy(joint.parent ? joint.parent.turn : chain.baseTurn)
    .invert()
    .multiply(joint.turn)
    .toArray(pose, joint.index * 4);
};
