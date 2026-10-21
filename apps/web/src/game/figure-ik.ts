import * as THREE from "three";

const REACH_SLACK = 0.002;

export const turnInWorld = (bone: THREE.Object3D, turn: THREE.Quaternion) => {
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parent);
  bone.quaternion.copy(parent.invert().multiply(turn.clone().multiply(world)));
  bone.updateMatrixWorld(true);
};

const holdInWorld = (bone: THREE.Object3D, world: THREE.Quaternion) => {
  const parent = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parent);
  bone.quaternion.copy(parent.invert().multiply(world));
  bone.updateMatrixWorld(true);
};

const interiorAngle = (upper: number, lower: number, span: number): number =>
  Math.acos(
    THREE.MathUtils.clamp(
      (upper * upper + lower * lower - span * span) / (2 * upper * lower),
      -1,
      1
    )
  );

export const reachFor = (
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  facing: THREE.Quaternion
) => {
  const joint = upper.getWorldPosition(new THREE.Vector3());
  const middle = lower.getWorldPosition(new THREE.Vector3());
  const tip = end.getWorldPosition(new THREE.Vector3());
  const upperLength = joint.distanceTo(middle);
  const lowerLength = middle.distanceTo(tip);
  const span = THREE.MathUtils.clamp(
    joint.distanceTo(target),
    Math.abs(upperLength - lowerLength) + REACH_SLACK,
    upperLength + lowerLength - REACH_SLACK
  );
  const opening =
    interiorAngle(upperLength, lowerLength, span) -
    interiorAngle(upperLength, lowerLength, joint.distanceTo(tip));
  const hinge = new THREE.Vector3()
    .subVectors(middle, joint)
    .cross(new THREE.Vector3().subVectors(tip, middle))
    .normalize();
  const shin = new THREE.Vector3().subVectors(tip, middle);
  const spanAfter = (angle: number) =>
    shin.clone().applyAxisAngle(hinge, angle).add(middle).distanceTo(joint);
  const angle =
    Math.abs(spanAfter(opening) - span) <= Math.abs(spanAfter(-opening) - span)
      ? opening
      : -opening;
  turnInWorld(lower, new THREE.Quaternion().setFromAxisAngle(hinge, angle));
  const reached = end.getWorldPosition(new THREE.Vector3()).sub(joint);
  turnInWorld(
    upper,
    new THREE.Quaternion().setFromUnitVectors(
      reached.normalize(),
      target.clone().sub(joint).normalize()
    )
  );
  holdInWorld(end, facing);
};
