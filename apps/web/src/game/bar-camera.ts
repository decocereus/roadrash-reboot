import {
  GARAGE_PLINTH,
  heightOfSolidsAt,
  MEZZANINE,
  ROOM,
} from "@racer/sim/lobby-floor";
import * as THREE from "three";

import type { BarCamera } from "../bar-view.ts";

const FOV = {
  angled: 42,
  door: 50,
  follow: 54,
  garage: 38,
  room: 44,
} as const;
const FOLLOW = {
  back: 4.6,
  backOnBike: 5.6,
  dragTurn: 0.006,
  lift: 2.3,
  liftOnBike: 2.6,
  turnBehind: 1.5,
} as const;
const ANGLED = { back: 8.2, lift: 5.6 } as const;
const WHOLE_ROOM = { y: 7, z: 18 } as const;
const EASE = {
  angled: 5,
  door: 3.2,
  follow: 7,
  garage: 3.6,
  room: 3.2,
} as const;
const GARAGE_SHOT = {
  aimRight: 1.7,
  aimY: 0.75,
  eyeX: -3.5,
  eyeY: 2.5,
  eyeZ: 4.1,
} as const;
const MOVING_PACE = 0.5;
const FULL_TURN = Math.PI * 2;

export interface CameraView {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly pace: number;
  readonly mounted: boolean;
}

const inRoom = (eye: THREE.Vector3): void => {
  eye.x = THREE.MathUtils.clamp(eye.x, ROOM.leftX + 0.5, ROOM.rightX - 0.5);
  eye.z = THREE.MathUtils.clamp(eye.z, ROOM.backZ + 0.5, ROOM.frontZ - 0.5);
  if (eye.x > MEZZANINE.leftX - 0.4 && eye.z < MEZZANINE.frontZ + 0.4) {
    eye.y = Math.min(eye.y, MEZZANINE.y - 0.7);
  }
  eye.y = Math.max(eye.y, heightOfSolidsAt(eye.x, eye.z) + 0.5);
};

export interface BarEye {
  readonly camera: THREE.PerspectiveCamera;
  readonly mode: () => BarCamera;
  readonly setMode: (mode: BarCamera, heading: number) => void;
  readonly orbit: (pixels: number) => void;
  readonly viewYaw: () => number;
  readonly aim: (
    seconds: number,
    view: CameraView,
    door: number,
    holding: boolean,
    garage: boolean
  ) => void;
}

export const createBarEye = (mode: BarCamera, start: CameraView): BarEye => {
  const camera = new THREE.PerspectiveCamera(FOV[mode], 1, 0.3, 1000);
  const eye = new THREE.Vector3(start.x, ANGLED.lift, start.z + ANGLED.back);
  const target = new THREE.Vector3(start.x, 1, start.z);
  const wantEye = new THREE.Vector3();
  const wantAim = new THREE.Vector3();
  let current = mode;
  let followYaw = start.heading;

  const placeFollow = (view: CameraView, seconds: number, holding: boolean) => {
    if (view.pace > MOVING_PACE && !holding) {
      const off =
        THREE.MathUtils.euclideanModulo(
          view.heading - followYaw + Math.PI,
          FULL_TURN
        ) - Math.PI;
      followYaw += off * Math.min(1, seconds * FOLLOW.turnBehind);
    }
    const back = view.mounted ? FOLLOW.backOnBike : FOLLOW.back;
    wantAim.set(view.x, view.mounted ? 1.2 : 1.35, view.z);
    wantEye.set(
      view.x + Math.sin(followYaw) * back,
      view.mounted ? FOLLOW.liftOnBike : FOLLOW.lift,
      view.z + Math.cos(followYaw) * back
    );
    inRoom(wantEye);
  };

  const placeShot = (
    shot: BarCamera,
    view: CameraView,
    seconds: number,
    holding: boolean
  ): void => {
    switch (shot) {
      case "angled": {
        wantAim.set(view.x, 1, view.z);
        wantEye.set(view.x, ANGLED.lift, view.z + ANGLED.back);
        inRoom(wantEye);
        break;
      }
      case "follow": {
        placeFollow(view, seconds, holding);
        break;
      }
      case "room": {
        wantEye.set(view.x * 0.35, WHOLE_ROOM.y, WHOLE_ROOM.z + view.z * 0.1);
        wantAim.set(view.x * 0.7, 1.2, view.z * 0.5 - 1);
        break;
      }
      default: {
        shot satisfies never;
      }
    }
  };

  const placeGarage = (): void => {
    const eyeX = GARAGE_PLINTH.x + GARAGE_SHOT.eyeX;
    const eyeZ = GARAGE_PLINTH.z + GARAGE_SHOT.eyeZ;
    const along = Math.hypot(GARAGE_SHOT.eyeX, GARAGE_SHOT.eyeZ);
    wantEye.set(eyeX, GARAGE_SHOT.eyeY, eyeZ);
    wantAim.set(
      GARAGE_PLINTH.x + (GARAGE_SHOT.eyeZ / along) * GARAGE_SHOT.aimRight,
      GARAGE_SHOT.aimY,
      GARAGE_PLINTH.z - (GARAGE_SHOT.eyeX / along) * GARAGE_SHOT.aimRight
    );
  };

  return {
    aim(seconds, view, door, holding, garage) {
      let wantFov: number = FOV[current];
      let rate: number = EASE[current];
      if (garage && door === 0) {
        wantFov = FOV.garage;
        rate = EASE.garage;
        placeGarage();
      } else if (door > 0) {
        wantFov = FOV.door;
        rate = EASE.door;
        wantAim.set(ROOM.doorCentre, 2.2, ROOM.backZ - 6);
        wantEye.set(
          ROOM.doorCentre - 1 + (1 - door) * 3,
          2.4 + (1 - door) * 4,
          -1 + (1 - door) * 20
        );
      } else {
        placeShot(current, view, seconds, holding);
      }
      const ease = Math.min(1, seconds * rate);
      eye.lerp(wantEye, ease);
      target.lerp(wantAim, ease);
      if (Math.abs(camera.fov - wantFov) > 0.01) {
        camera.fov += (wantFov - camera.fov) * ease;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(eye);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    },
    camera,
    mode: () => current,
    orbit(pixels) {
      if (current === "follow") {
        followYaw -= pixels * FOLLOW.dragTurn;
      }
    },
    setMode(next, heading) {
      current = next;
      if (next === "follow") {
        followYaw = heading;
      }
    },
    viewYaw: () =>
      current === "follow"
        ? followYaw
        : Math.atan2(eye.x - target.x, eye.z - target.z),
  };
};
