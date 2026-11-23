import * as THREE from "three";

export interface Contacts {
  readonly foot_l: THREE.Vector3;
  readonly foot_r: THREE.Vector3;
  readonly hand_l: THREE.Vector3;
  readonly hand_r: THREE.Vector3;
}

const FINGERS = ["index", "middle", "ring", "pinky"] as const;
const SOLE_REACH = 0.03;

const boneNamed = (body: THREE.SkinnedMesh, name: string): THREE.Bone => {
  const bone = body.skeleton.getBoneByName(name);
  if (!bone) {
    throw new Error(`The rider model has no ${name} bone.`);
  }
  return bone;
};

const skinOf = (body: THREE.SkinnedMesh) => {
  const { bindMatrix, geometry, skeleton } = body;
  const position = geometry.getAttribute("position");
  const boneOf = geometry.getAttribute("skinIndex");
  const weightOf = geometry.getAttribute("skinWeight");
  const owners = new Int32Array(position.count);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    let heaviest = 0;
    let owner = -1;
    for (let influence = 0; influence < 4; influence += 1) {
      const weight = weightOf.getComponent(vertex, influence);
      if (weight > heaviest) {
        heaviest = weight;
        owner = boneOf.getComponent(vertex, influence);
      }
    }
    owners[vertex] = owner;
  }
  const toWorld = new THREE.Matrix4();
  return (bones: readonly THREE.Bone[]): THREE.Vector3[] => {
    const indexes = bones.map((bone) => skeleton.bones.indexOf(bone));
    const points: THREE.Vector3[] = [];
    for (const index of indexes) {
      const bone = skeleton.bones[index];
      const inverse = skeleton.boneInverses[index];
      if (!(bone && inverse)) {
        continue;
      }
      toWorld.multiplyMatrices(bone.matrixWorld, inverse).multiply(bindMatrix);
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        if (owners[vertex] === index) {
          points.push(
            new THREE.Vector3()
              .fromBufferAttribute(position, vertex)
              .applyMatrix4(toWorld)
          );
        }
      }
    }
    return points;
  };
};

const centreOf = (points: readonly THREE.Vector3[]): THREE.Vector3 => {
  const sum = new THREE.Vector3();
  for (const point of points) {
    sum.add(point);
  }
  return sum.divideScalar(Math.max(1, points.length));
};

const palmOf = (
  body: THREE.SkinnedMesh,
  skin: ReturnType<typeof skinOf>,
  side: "l" | "r"
): THREE.Vector3 => {
  const hand = boneNamed(body, `hand_${side}`);
  const toHand = hand.matrixWorld.clone().invert();
  const inHand = (points: readonly THREE.Vector3[]) =>
    points.map((point) => point.applyMatrix4(toHand));
  const palm = inHand(skin([hand]));
  const fingers = inHand(
    skin(
      FINGERS.flatMap((finger) =>
        [1, 2, 3].map((joint) => boneNamed(body, `${finger}_0${joint}_${side}`))
      )
    )
  );
  const knuckle = (finger: string) =>
    boneNamed(body, `${finger}_01_${side}`)
      .getWorldPosition(new THREE.Vector3())
      .applyMatrix4(toHand);
  const centre = centreOf(palm);
  const facing = knuckle("index").cross(knuckle("pinky")).normalize();
  if (facing.dot(centreOf(fingers).sub(centre)) < 0) {
    facing.negate();
  }
  let below = 0;
  let count = 0;
  for (const point of palm) {
    const depth = point.clone().sub(centre).dot(facing);
    if (depth > 0) {
      below += depth;
      count += 1;
    }
  }
  return centre.addScaledVector(facing, below / Math.max(1, count));
};

const soleOf = (
  body: THREE.SkinnedMesh,
  skin: ReturnType<typeof skinOf>,
  root: THREE.Object3D,
  side: "l" | "r"
): THREE.Vector3 => {
  const toRoot = root.matrixWorld.clone().invert();
  const foot = boneNamed(body, `foot_${side}`);
  const ballBone = boneNamed(body, `ball_${side}`);
  const ball = ballBone
    .getWorldPosition(new THREE.Vector3())
    .applyMatrix4(toRoot);
  let lowest = ball.y;
  for (const point of skin([foot, ballBone])) {
    point.applyMatrix4(toRoot);
    if (Math.hypot(point.x - ball.x, point.z - ball.z) < SOLE_REACH) {
      lowest = Math.min(lowest, point.y);
    }
  }
  return foot.worldToLocal(ball.setY(lowest).applyMatrix4(root.matrixWorld));
};

export const contactsOf = (
  body: THREE.SkinnedMesh,
  root: THREE.Object3D
): Contacts => {
  const skin = skinOf(body);
  return {
    foot_l: soleOf(body, skin, root, "l"),
    foot_r: soleOf(body, skin, root, "r"),
    hand_l: palmOf(body, skin, "l"),
    hand_r: palmOf(body, skin, "r"),
  };
};
