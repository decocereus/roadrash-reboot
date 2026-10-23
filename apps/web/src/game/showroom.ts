import { PLAYER_COLOURS, riderPalette } from "@racer/sim/palette";
import * as THREE from "three";

import { createBikes } from "./actors.ts";
import type { Assets, Decoded } from "./assets.ts";
import { createShading } from "./cel.ts";
import { lookOf } from "./looks.ts";
import { createPipeline } from "./post.ts";

export { assetParsers } from "./assets.ts";

const LOOK = lookOf("salt-coast");
const TURN_SECONDS = 12;
const THREE_QUARTER = -0.75;
const OFF_KEY = 1;
const FIELD_OF_VIEW = 28;
const SEAT_HEIGHT = 0.9;
const AIM_HEIGHT = 0.45;
const FILL = 0.95;
const NEAR_END = 0.15;
const MAX_PIXEL_RATIO = 2;
const FRAME_MS = 1000 / 60 - 1;
const LONGEST_STEP = 0.1;
const SHADOW_SPAN = 1.6;
const SHADOW_DISTANCE = 8;
const SHADOW_MAP = 1024;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export interface Showroom {
  show: (paint: number) => void;
  dispose: () => void;
}

interface Footprint {
  readonly centre: THREE.Vector3;
  readonly radius: number;
  readonly height: number;
}

const footprintOf = (bike: Assets["bike"]): Footprint => {
  const bounds = new THREE.Box3();
  for (const primitive of [...bike.values()].flat()) {
    primitive.geometry.computeBoundingBox();
    if (primitive.geometry.boundingBox) {
      bounds.union(primitive.geometry.boundingBox);
    }
  }
  const size = bounds.getSize(new THREE.Vector3());
  const middle = bounds.getCenter(new THREE.Vector3());
  return {
    centre: new THREE.Vector3(-middle.x, 0, -middle.z),
    height: bounds.max.y,
    radius: Math.hypot(size.x, size.z) / 2,
  };
};

const distanceToFit = (
  footprint: Footprint,
  camera: THREE.PerspectiveCamera
): number => {
  const tall = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const wide = tall * camera.aspect;
  const across = footprint.radius / (wide * FILL);
  const up = (footprint.height * (1 - AIM_HEIGHT)) / (tall * FILL);
  return Math.max(across, up) + footprint.radius * NEAR_END;
};

const releaseAll = (owners: (() => void)[]): void => {
  for (const release of owners.splice(0).toReversed()) {
    release();
  }
};

const paintOf = (paint: number): number =>
  riderPalette[paint] === undefined ? PLAYER_COLOURS : paint;

const openRoom = (
  canvas: HTMLCanvasElement,
  bike: Assets["bike"],
  owners: (() => void)[]
): Showroom => {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    canvas,
  });
  owners.push(() => {
    renderer.dispose();
    renderer.forceContextLoss();
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x00_00_00, 0);

  const pipeline = createPipeline(renderer);
  owners.push(() => {
    pipeline.dispose();
  });
  pipeline.setLook(LOOK);

  const shading = createShading(LOOK);
  owners.push(() => {
    shading.dispose();
  });
  const bikes = createBikes(
    { bike },
    shading,
    riderPalette.map((_, paint) => ({ paint, police: false }))
  );
  owners.push(() => {
    bikes.dispose();
  });

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(shading.ambient, 1));
  const light = new THREE.DirectionalLight(shading.sun, 1);
  owners.push(() => {
    light.dispose();
  });
  light.castShadow = true;
  light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  light.shadow.camera.left = -SHADOW_SPAN;
  light.shadow.camera.right = SHADOW_SPAN;
  light.shadow.camera.top = SHADOW_SPAN;
  light.shadow.camera.bottom = -SHADOW_SPAN;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_DISTANCE * 2;
  light.shadow.bias = -0.0008;
  light.shadow.normalBias = 0.02;
  light.position.copy(shading.key).multiplyScalar(SHADOW_DISTANCE);
  scene.add(light, light.target, bikes.group);
  pipeline.prepare(scene);

  const footprint = footprintOf(bike);
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 40);
  const aim = new THREE.Vector3(0, footprint.height * AIM_HEIGHT, 0);
  const anchor = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const motion = globalThis.matchMedia(REDUCED_MOTION);
  const bearing = Math.atan2(shading.key.x, shading.key.z) + OFF_KEY;
  const facing = bearing + THREE_QUARTER;

  let paint = PLAYER_COLOURS;
  let turned = facing;
  let last = 0;
  let handle = 0;
  let ready = false;
  let open = true;

  const draw = (): void => {
    const root = bikes.roots[paint];
    if (!root) {
      return;
    }
    root.rotation.y = motion.matches ? facing : turned;
    spot
      .copy(footprint.centre)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, root.rotation.y);
    root.position.set(spot.x, 0, spot.z);
    bikes.show(paint);
    bikes.commit(anchor);
    shading.aim(camera);
    pipeline.render(scene, camera);
  };

  const frame = (now: number): void => {
    handle = 0;
    const step = last === 0 ? 0 : (now - last) / 1000;
    if (last !== 0 && now - last < FRAME_MS && !motion.matches) {
      handle = requestAnimationFrame(frame);
      return;
    }
    last = now;
    turned += (Math.min(step, LONGEST_STEP) * Math.PI * 2) / TURN_SECONDS;
    draw();
    if (!motion.matches) {
      handle = requestAnimationFrame(frame);
    }
  };

  const wake = (): void => {
    if (ready && handle === 0) {
      last = 0;
      handle = requestAnimationFrame(frame);
    }
  };

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    const ratio = Math.min(globalThis.devicePixelRatio, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    pipeline.resize(width, height, ratio);
    camera.aspect = width / height;
    const distance = distanceToFit(footprint, camera);
    camera.position.set(
      Math.sin(bearing) * distance,
      SEAT_HEIGHT,
      Math.cos(bearing) * distance
    );
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    wake();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  owners.push(() => {
    observer.disconnect();
  });
  motion.addEventListener("change", wake);
  owners.push(
    () => {
      motion.removeEventListener("change", wake);
    },
    () => {
      open = false;
      ready = false;
      cancelAnimationFrame(handle);
    }
  );

  resize();
  const compiling = pipeline.compile(scene, camera);
  owners.push(() => {
    compiling.stop?.();
  });
  const start = async (): Promise<void> => {
    await compiling.ready;
    ready = open;
    wake();
  };
  void start();

  return {
    dispose() {
      releaseAll(owners);
    },
    show(next) {
      paint = paintOf(next);
      wake();
    },
  };
};

export const createShowroom = (
  canvas: HTMLCanvasElement,
  bike: Decoded<Assets["bike"]>
): Showroom => {
  const owners = [bike.release];
  try {
    return openRoom(canvas, bike.value, owners);
  } catch (error) {
    releaseAll(owners);
    throw error;
  }
};
