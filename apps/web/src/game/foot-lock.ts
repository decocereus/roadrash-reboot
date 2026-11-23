import * as THREE from "three";

const RELEASE_SECONDS = 0.12;
const DRIFT_METRES = 0.3;
const TWIST_RADIANS = 0.6;
const SLACK = 1e-4;
const DOWN_METRES = 0.015;
const LIFTED_METRES = 0.035;
const UPRIGHT = 0.98;

interface Leg {
  readonly thigh: THREE.Object3D;
  readonly calf: THREE.Object3D;
  readonly foot: THREE.Object3D;
  readonly ball: THREE.Object3D;
  readonly thighIndex: number;
  readonly calfIndex: number;
  readonly footIndex: number;
  readonly anchor: THREE.Vector3;
  readonly offset: THREE.Vector3;
  locked: boolean;
  yaw: number;
  release: number;
}

export interface FootLock {
  readonly hold: (
    pose: number[],
    planted: readonly boolean[],
    seconds: number
  ) => void;
  readonly free: () => void;
}

const hip = new THREE.Vector3();
const knee = new THREE.Vector3();
const ankle = new THREE.Vector3();
const ball = new THREE.Vector3();
const target = new THREE.Vector3();
const toward = new THREE.Vector3();
const bend = new THREE.Vector3();
const placed = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const facing = new THREE.Vector3();
const standing = new THREE.Vector3();
const up = new THREE.Vector3();
const thighTurn = new THREE.Quaternion();
const calfTurn = new THREE.Quaternion();
const footTurn = new THREE.Quaternion();
const above = new THREE.Quaternion();
const swing = new THREE.Quaternion();
const swingShin = new THREE.Quaternion();
const local = new THREE.Quaternion();

const turnApart = (a: number, b: number): number =>
  Math.abs(
    THREE.MathUtils.euclideanModulo(a - b + Math.PI, 2 * Math.PI) - Math.PI
  );

const reach = (leg: Leg, pose: number[]) => {
  leg.thigh.getWorldPosition(hip);
  leg.calf.getWorldPosition(knee);
  leg.foot.getWorldPosition(ankle);
  const upper = knee.distanceTo(hip);
  const lower = ankle.distanceTo(knee);
  toward.subVectors(target, hip);
  const distance = THREE.MathUtils.clamp(
    toward.length(),
    Math.abs(upper - lower) + SLACK,
    upper + lower - SLACK
  );
  toward.normalize();
  bend.subVectors(knee, hip);
  bend.addScaledVector(toward, -bend.dot(toward));
  if (bend.lengthSq() < SLACK * SLACK) {
    return;
  }
  bend.normalize();
  const cosine =
    (upper * upper + distance * distance - lower * lower) /
    (2 * upper * distance);
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  placed
    .copy(hip)
    .addScaledVector(toward, upper * cosine)
    .addScaledVector(bend, upper * sine);
  leg.thigh.getWorldQuaternion(thighTurn);
  leg.calf.getWorldQuaternion(calfTurn);
  leg.foot.getWorldQuaternion(footTurn);
  swing.setFromUnitVectors(
    from.subVectors(knee, hip).normalize(),
    to.subVectors(placed, hip).normalize()
  );
  from.subVectors(ankle, knee).applyQuaternion(swing).normalize();
  to.subVectors(target, placed).normalize();
  swingShin.setFromUnitVectors(from, to);
  thighTurn.premultiply(swing);
  calfTurn.premultiply(swing).premultiply(swingShin);
  leg.thigh.parent?.getWorldQuaternion(above);
  local
    .copy(above)
    .invert()
    .multiply(thighTurn)
    .toArray(pose, leg.thighIndex * 4);
  local
    .copy(thighTurn)
    .invert()
    .multiply(calfTurn)
    .toArray(pose, leg.calfIndex * 4);
  local
    .copy(calfTurn)
    .invert()
    .multiply(footTurn)
    .toArray(pose, leg.footIndex * 4);
};

export const createFootLock = (
  root: THREE.Object3D,
  names: readonly string[],
  standHeight: number
): FootLock => {
  const legs = (["_l", "_r"] as const).map((side): Leg => {
    const bone = (name: string) => {
      const found = root.getObjectByName(name + side);
      if (!found) {
        throw new Error(`The rider model has no ${name}${side}.`);
      }
      return found;
    };
    return {
      anchor: new THREE.Vector3(),
      ball: bone("ball"),
      calf: bone("calf"),
      calfIndex: names.indexOf(`calf${side}`),
      foot: bone("foot"),
      footIndex: names.indexOf(`foot${side}`),
      locked: false,
      offset: new THREE.Vector3(),
      release: 0,
      thigh: bone("thigh"),
      thighIndex: names.indexOf(`thigh${side}`),
      yaw: 0,
    };
  });
  const free = () => {
    for (const leg of legs) {
      leg.locked = false;
      leg.release = 0;
    }
  };
  return {
    free,
    hold(pose, planted, seconds) {
      root.updateMatrixWorld(true);
      up.setFromMatrixColumn(root.matrixWorld, 1).normalize();
      if (up.y < UPRIGHT) {
        free();
        return;
      }
      root.getWorldDirection(facing);
      const yaw = Math.atan2(facing.x, facing.z);
      const ground = root.getWorldPosition(standing).y - standHeight;
      for (let side = 0; side < legs.length; side += 1) {
        const leg = legs[side];
        if (!leg) {
          continue;
        }
        leg.foot.getWorldPosition(ankle);
        leg.ball.getWorldPosition(ball);
        const clear = ball.y - ground;
        const down = planted[side] === true || clear < DOWN_METRES;
        if (
          leg.locked &&
          ((planted[side] !== true && clear > LIFTED_METRES) ||
            turnApart(yaw, leg.yaw) > TWIST_RADIANS ||
            leg.anchor.distanceTo(ball) > DRIFT_METRES)
        ) {
          leg.locked = false;
          leg.offset.subVectors(leg.anchor, ball).setY(0);
          leg.release = 1;
        }
        if (down && !leg.locked && leg.release <= 0) {
          leg.locked = true;
          leg.anchor.copy(ball);
          leg.yaw = yaw;
        }
        if (leg.locked) {
          target.set(leg.anchor.x, ball.y, leg.anchor.z);
        } else if (leg.release > 0 || ball.y < ground) {
          leg.release = Math.max(0, leg.release - seconds / RELEASE_SECONDS);
          target.copy(ball).addScaledVector(leg.offset, leg.release);
        } else {
          continue;
        }
        target.y = Math.max(target.y, ground);
        target.sub(ball).add(ankle);
        reach(leg, pose);
      }
    },
  };
};
