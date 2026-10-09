import type { WeaponKind } from "@racer/sim/state";
import * as THREE from "three";

export type RiderPose =
  | "seated"
  | "tumble"
  | "lying"
  | "run"
  | "lift"
  | "punch"
  | "kick"
  | "windup"
  | "swing"
  | "surrender";

export const jacketColours = [
  0x23_26_2c, 0x1d_3a_6e, 0x5a_1f_1f, 0x1f_4a_2a, 0x3a_1f_4f, 0x6b_5a_3a,
  0x14_1c_33,
];

const helmetColours = [
  0xf2_c2_30, 0xf2_c2_30, 0xf2_c2_30, 0xf2_c2_30, 0xf2_c2_30, 0xf2_c2_30,
  0xf4_f6_f8,
];

export interface RiderFigure {
  readonly root: THREE.Group;
  animate: (
    pose: RiderPose,
    time: number,
    seconds: number,
    side: number,
    weapon: WeaponKind
  ) => void;
}

interface Joint {
  readonly node: THREE.Group;
  x: number;
  z: number;
}

interface Posture {
  torso: number;
  head: number;
  upperArm: readonly [number, number];
  forearm: number;
  armSpread: number;
  thigh: readonly [number, number];
  shin: readonly [number, number];
  legSpread: number;
}

const BLEND_RATE = 14;
const RUN_HZ = 2.6;

const matte = (color: number): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, flatShading: true });

const limb = (
  parent: THREE.Object3D,
  material: THREE.Material,
  width: number,
  length: number,
  at: readonly [number, number, number]
): Joint => {
  const node = new THREE.Group();
  node.position.set(...at);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, length, width),
    material
  );
  mesh.position.y = -length / 2;
  node.add(mesh);
  parent.add(node);
  return { node, x: 0, z: 0 };
};

const settle = (joint: Joint, x: number, z: number, blend: number): void => {
  joint.x += (x - joint.x) * blend;
  joint.z += (z - joint.z) * blend;
  joint.node.rotation.set(joint.x, 0, joint.z);
};

const seatedPosture = (): Posture => ({
  armSpread: 0,
  forearm: 0.35,
  head: -0.55,
  legSpread: 0,
  shin: [-1.55, -1.55],
  thigh: [1.3, 1.3],
  torso: 0.78,
  upperArm: [1.15, 1.15],
});

const attackPosture = (pose: RiderPose, side: number): Posture => {
  const base = seatedPosture();
  const index = side < 0 ? 0 : 1;
  if (pose === "windup" || pose === "swing") {
    const raised = pose === "windup";
    const upperArm: [number, number] = [...base.upperArm];
    upperArm[index] = raised ? 0.4 : 0.15;
    return {
      ...base,
      armSpread: raised ? 2.6 : 1.1,
      forearm: raised ? 0.9 : 0,
      torso: raised ? 0.62 : 0.48,
      upperArm,
    };
  }
  if (pose === "kick") {
    const thigh: [number, number] = [...base.thigh];
    const shin: [number, number] = [...base.shin];
    thigh[index] = 0.2;
    shin[index] = 0;
    return { ...base, legSpread: 1.1, shin, thigh, torso: 0.6 };
  }
  const upperArm: [number, number] = [...base.upperArm];
  upperArm[index] = 0.1;
  return { ...base, armSpread: 1.5, forearm: 0.05, torso: 0.55, upperArm };
};

const attacks: ReadonlySet<RiderPose> = new Set([
  "punch",
  "kick",
  "windup",
  "swing",
]);

const surrender: Posture = {
  armSpread: 0.3,
  forearm: 0.4,
  head: 0,
  legSpread: 0.05,
  shin: [0, 0],
  thigh: [0, 0],
  torso: 0,
  upperArm: [2.9, 2.9],
};

const postureFor = (pose: RiderPose, time: number, side: number): Posture => {
  if (attacks.has(pose)) {
    return attackPosture(pose, side);
  }
  if (pose === "surrender") {
    return surrender;
  }
  if (pose === "seated") {
    return {
      armSpread: 0,
      forearm: 0.35,
      head: -0.55,
      legSpread: 0,
      shin: [-1.55, -1.55],
      thigh: [1.3, 1.3],
      torso: 0.78,
      upperArm: [1.15, 1.15],
    };
  }
  if (pose === "run") {
    const phase = time * RUN_HZ * Math.PI * 2;
    const left = Math.sin(phase);
    const right = -left;
    return {
      armSpread: 0.15,
      forearm: 1.1,
      head: -0.15,
      legSpread: 0.05,
      shin: [-0.3 - 0.9 * Math.max(0, -left), -0.3 - 0.9 * Math.max(0, -right)],
      thigh: [0.8 * left, 0.8 * right],
      torso: 0.22,
      upperArm: [0.7 * right, 0.7 * left],
    };
  }
  if (pose === "lift") {
    return {
      armSpread: 0.2,
      forearm: 0.5,
      head: -0.3,
      legSpread: 0.25,
      shin: [-0.5, -0.5],
      thigh: [0.5, 0.5],
      torso: 0.7,
      upperArm: [0.9, 0.9],
    };
  }
  if (pose === "lying") {
    return {
      armSpread: 1.2,
      forearm: 0.4,
      head: 0.3,
      legSpread: 0.35,
      shin: [-0.5, -0.15],
      thigh: [0.35, -0.1],
      torso: 0,
      upperArm: [0.3, -0.4],
    };
  }
  const flail = time * 11;
  return {
    armSpread: 0.8 + 0.5 * Math.sin(flail * 1.3),
    forearm: 0.6,
    head: 0.2,
    legSpread: 0.3,
    shin: [-0.6 + 0.4 * Math.sin(flail), -0.6 - 0.4 * Math.sin(flail)],
    thigh: [0.7 * Math.sin(flail), -0.7 * Math.sin(flail)],
    torso: 0.3 * Math.sin(flail * 0.7),
    upperArm: [0.9 * Math.cos(flail), -0.9 * Math.cos(flail)],
  };
};

const weaponMesh = (kind: WeaponKind): THREE.Group => {
  const held = new THREE.Group();
  held.position.y = -0.34;
  held.rotation.x = 0.6;
  held.visible = false;
  const shaft = (
    radiusTop: number,
    radiusBottom: number,
    length: number,
    color: number
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 6),
      matte(color)
    );
    mesh.position.y = -length / 2;
    held.add(mesh);
    return mesh;
  };
  if (kind === "club") {
    shaft(0.06, 0.035, 0.62, 0x6b_4a_2b);
  } else if (kind === "crowbar") {
    shaft(0.02, 0.02, 0.6, 0x7a_1c_1c);
    const hook = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.14),
      matte(0x7a_1c_1c)
    );
    hook.position.set(0, -0.6, 0.06);
    held.add(hook);
  } else if (kind === "baton") {
    shaft(0.03, 0.03, 0.52, 0x15_16_18);
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 0.12),
      matte(0x15_16_18)
    );
    grip.position.set(0, -0.12, 0.06);
    held.add(grip);
  } else if (kind === "chain") {
    const steel = matte(0x8a_90_96);
    for (let link = 0; link < 6; link += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.1, 0.025),
        steel
      );
      mesh.position.y = -0.05 - link * 0.1;
      mesh.rotation.y = link % 2 === 0 ? 0 : Math.PI / 2;
      held.add(mesh);
    }
  }
  return held;
};

interface HeldWeapon {
  readonly kind: WeaponKind;
  readonly mesh: THREE.Group;
}

const showWeapon = (
  held: readonly (readonly HeldWeapon[])[],
  weapon: WeaponKind,
  pose: RiderPose,
  side: number
): void => {
  const swinging = pose === "windup" || pose === "swing";
  const weaponHand = swinging && side < 0 ? 0 : 1;
  for (const [hand, meshes] of held.entries()) {
    for (const each of meshes) {
      each.mesh.visible = each.kind === weapon && hand === weaponHand;
    }
  }
};

const weaponKinds: readonly WeaponKind[] = [
  "club",
  "chain",
  "crowbar",
  "baton",
];

export const createRiderFigure = (jacketIndex: number): RiderFigure => {
  const root = new THREE.Group();
  const leather = matte(jacketColours[jacketIndex] ?? 0x23_26_2c);
  const denim = matte(0x2d_3d_5c);
  const skin = matte(0xc9_9a_7a);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), denim);
  root.add(pelvis);

  const torso: Joint = { node: new THREE.Group(), x: 0, z: 0 };
  torso.node.position.y = 0.08;
  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.56, 0.25),
    leather
  );
  chest.position.y = 0.3;
  torso.node.add(chest);
  root.add(torso.node);

  const head: Joint = { node: new THREE.Group(), x: 0, z: 0 };
  head.node.position.y = 0.62;
  const helmet = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.17, 1),
    matte(helmetColours[jacketIndex] ?? 0xf2_c2_30)
  );
  helmet.position.y = 0.14;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.1, 0.06),
    matte(0x10_12_14)
  );
  visor.position.set(0, 0.14, -0.16);
  head.node.add(helmet, visor);
  torso.node.add(head.node);

  const upperArms = [-1, 1].map((side) =>
    limb(torso.node, leather, 0.11, 0.32, [side * 0.26, 0.52, 0])
  );
  const forearms = upperArms.map((arm) =>
    limb(arm.node, leather, 0.1, 0.3, [0, -0.32, 0])
  );
  for (const arm of forearms) {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin);
    glove.position.y = -0.32;
    arm.node.add(glove);
  }
  const held = forearms.map((arm) =>
    weaponKinds.map((kind) => {
      const mesh = weaponMesh(kind);
      arm.node.add(mesh);
      return { kind, mesh };
    })
  );
  const thighs = [-1, 1].map((side) =>
    limb(root, denim, 0.15, 0.42, [side * 0.13, -0.06, 0])
  );
  const shins = thighs.map((thigh) =>
    limb(thigh.node, denim, 0.13, 0.42, [0, -0.42, 0])
  );
  for (const shin of shins) {
    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.1, 0.24),
      leather
    );
    boot.position.set(0, -0.44, -0.05);
    shin.node.add(boot);
  }

  return {
    animate(pose, time, seconds, side, weapon) {
      const target = postureFor(pose, time, side);
      const blend = Math.min(1, BLEND_RATE * seconds);
      settle(torso, target.torso, 0, blend);
      settle(head, target.head, 0, blend);
      const attacking = attacks.has(pose);
      showWeapon(held, pose === "surrender" ? "none" : weapon, pose, side);
      for (const [index, arm] of upperArms.entries()) {
        const armSide = index === 0 ? -1 : 1;
        const spread = attacking && armSide !== side ? 0 : target.armSpread;
        settle(arm, target.upperArm[index] ?? 0, armSide * spread, blend);
      }
      for (const arm of forearms) {
        settle(arm, target.forearm, 0, blend);
      }
      for (const [index, thigh] of thighs.entries()) {
        const legSide = index === 0 ? -1 : 1;
        const spread = attacking && legSide !== side ? 0 : target.legSpread;
        settle(thigh, target.thigh[index] ?? 0, legSide * spread, blend);
      }
      for (const [index, shin] of shins.entries()) {
        settle(shin, target.shin[index] ?? 0, 0, blend);
      }
    },
    root,
  };
};
