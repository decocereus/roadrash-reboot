import * as THREE from "three";

export const BIKE_TURN = new THREE.Matrix4().makeRotationY(Math.PI);

export const contactNames = ["hand_l", "hand_r", "foot_l", "foot_r"] as const;

export type ContactName = (typeof contactNames)[number];

export interface BikeFit {
  readonly foot_l: THREE.Vector3;
  readonly foot_r: THREE.Vector3;
  readonly hand_l: THREE.Vector3;
  readonly hand_r: THREE.Vector3;
  readonly seat: THREE.Vector3;
}

const fitNodes = {
  foot_l: "fit_peg_l",
  foot_r: "fit_peg_r",
  hand_l: "fit_grip_l",
  hand_r: "fit_grip_r",
  seat: "fit_seat",
} as const satisfies Record<keyof BikeFit, string>;

const fitNodeNames: ReadonlySet<string> = new Set(Object.values(fitNodes));

export const isFitNode = (node: THREE.Object3D): boolean =>
  fitNodeNames.has(node.name);

export const fitOf = (
  scene: THREE.Object3D,
  refuse: (why: string) => Error
): BikeFit => {
  scene.updateMatrixWorld(true);
  const pointOf = (name: string): THREE.Vector3 => {
    const node = scene.getObjectByName(name);
    if (!node) {
      throw refuse(`has no ${name} point.`);
    }
    return node.getWorldPosition(new THREE.Vector3()).applyMatrix4(BIKE_TURN);
  };
  return {
    foot_l: pointOf(fitNodes.foot_l),
    foot_r: pointOf(fitNodes.foot_r),
    hand_l: pointOf(fitNodes.hand_l),
    hand_r: pointOf(fitNodes.hand_r),
    seat: pointOf(fitNodes.seat),
  };
};
