import * as THREE from "three";

import { createBikes } from "./actors.ts";
import type { Assets, Decoded } from "./assets.ts";
import { riderBlocks } from "./bar-blocks.ts";
import { createCast } from "./bar-cast.ts";
import { createKit } from "./bar-kit.ts";
import { duskLook, nightLook, toneAt } from "./bar-light.ts";
import { createOutside } from "./bar-outside.ts";
import { createPools } from "./bar-pools.ts";
import { buildProps } from "./bar-props.ts";
import {
  buildCeiling,
  buildDoor,
  buildFixtures,
  buildFloor,
  buildShell,
  MEZZANINE,
  PLINTH,
  ROOM,
} from "./bar-room.ts";
import { countdownPlate, createSignAtlas, signGeometry } from "./bar-signs.ts";
import { createTagLayer } from "./bar-tags.ts";
import { createShading } from "./cel.ts";
import { createPipeline } from "./post.ts";
import { createProfiler, profileModeOf } from "./profile.ts";
import type { FrameEnd } from "./profile.ts";
import { createPuffs } from "./puffs.ts";

export { assetParsers } from "./assets.ts";

const MAX_PIXEL_RATIO = 2;
const LOOP_AFTER_DOOR = 15;
const BIKE_WAITS = 1.3;
const BIKE_PULL = 1.6;
const DOOR_REACH = Math.hypot(
  PLINTH.x - ROOM.doorCentre,
  PLINTH.z - ROOM.backZ
);
const SIGN_GLOW = 1.55;
const REV_PUFF_SPEED = 9;
const SHOTS = {
  garage: {
    aim: new THREE.Vector3(2.4, 1.75, 0.8),
    fov: 26,
    spot: new THREE.Vector3(-11, 2.4, 8.2),
  },
  home: {
    aim: new THREE.Vector3(-0.4, 2.4, -3),
    fov: 50,
    spot: new THREE.Vector3(8, 4.6, 16),
  },
} as const;
const SHADOW_SPAN = 18;
const SHADOW_DISTANCE = 26;
const LONGEST_STEP = 0.1;
const CYCLE_SECONDS = 150;
const COUNTDOWN_START = 40;
const DOOR_SECONDS = 2.6;
const DOOR_RISE = 4.5;
const TURN_SECONDS = 14;
const BUBBLES = [
  "RACE NEXT?",
  "LOBBY LOOKS SICK!",
  "SAME!",
  "NICE BIKE",
  "0:24!",
];

interface Pins {
  readonly ratio: number | null;
  readonly riders: number;
  readonly samples: number | null;
  readonly bloom: number | null;
  readonly shadow: number;
  readonly time: number | null;
}

const pinsFrom = (search: string): Pins => {
  const flags = new URLSearchParams(search);
  const number = (name: string): number | null => {
    const value = flags.get(name);
    return value === null ? null : Number(value);
  };
  const lean = flags.has("lean");
  const named = flags.get("time");
  const fixed = named === "night" ? 1 : number("time");
  return {
    bloom: lean ? 1 : number("bloom"),
    ratio: number("ratio"),
    riders: number("riders") ?? riderBlocks.length,
    samples: lean ? 0 : number("samples"),
    shadow: lean ? 2048 : (number("shadow") ?? 4096),
    time: named === "dusk" ? 0 : fixed,
  };
};

export interface BarScene {
  readonly dispose: () => void;
}

const openRoom = (
  canvas: HTMLCanvasElement,
  assets: Assets,
  owners: (() => void)[]
): BarScene => {
  const pins = pinsFrom(globalThis.location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: false, canvas });
  owners.push(() => {
    renderer.dispose();
    renderer.forceContextLoss();
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;

  const profileMode = profileModeOf(globalThis.location.search);
  const profiler =
    profileMode === "off"
      ? null
      : createProfiler(renderer, profileMode === "gpu");
  if (profiler) {
    owners.push(() => {
      profiler.dispose();
    });
  }
  const pipeline = createPipeline(renderer, (part) => {
    profiler?.lap(part);
  });
  owners.push(() => {
    pipeline.dispose();
  });
  if (pins.samples !== null) {
    pipeline.setSamples(pins.samples);
  }
  if (pins.bloom !== null) {
    pipeline.setBloomScale(pins.bloom);
  }

  const shading = createShading(duskLook);
  owners.push(() => {
    shading.dispose();
  });
  const scene = new THREE.Scene();
  const ambient = new THREE.AmbientLight(shading.ambient, 1);
  const key = new THREE.DirectionalLight(shading.sun, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(pins.shadow, pins.shadow);
  key.shadow.camera.left = -SHADOW_SPAN;
  key.shadow.camera.right = SHADOW_SPAN;
  key.shadow.camera.top = SHADOW_SPAN;
  key.shadow.camera.bottom = -SHADOW_SPAN;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = SHADOW_DISTANCE * 2;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.04;
  key.position.copy(shading.key).multiplyScalar(SHADOW_DISTANCE);
  scene.add(ambient, key, key.target);
  owners.push(() => {
    key.dispose();
  });

  const shellKit = createKit();
  const floorKit = createKit();
  const propKit = createKit();
  const glowKit = createKit();
  const slats = createKit();
  const slatGlow = createKit();
  buildFloor(floorKit);
  buildShell(shellKit);
  buildCeiling(shellKit, glowKit);
  buildFixtures(propKit, glowKit);
  buildProps(propKit, glowKit);
  buildDoor({ slatGlow, slats });

  const celMaterial = shading.cel("#ffffff", { vertexColors: true });
  const glowMaterial = shading.glowPaint();
  owners.push(() => {
    celMaterial.dispose();
    glowMaterial.dispose();
  });
  const meshOf = (
    kit: ReturnType<typeof createKit>,
    material: THREE.Material,
    casts: boolean
  ): THREE.Mesh => {
    const geometry = kit.build();
    if (!geometry) {
      throw new Error("A bar kit has nothing in it.");
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = casts;
    mesh.receiveShadow = material === celMaterial;
    owners.push(() => {
      geometry.dispose();
    });
    return mesh;
  };
  const shell = meshOf(shellKit, celMaterial, false);
  const floor = meshOf(floorKit, celMaterial, false);
  const props = meshOf(propKit, celMaterial, true);
  const glows = meshOf(glowKit, glowMaterial, false);
  const door = new THREE.Group();
  door.add(
    meshOf(slats, celMaterial, false),
    meshOf(slatGlow, glowMaterial, false)
  );
  door.position.z = ROOM.backZ - 0.05;
  scene.add(shell, floor, props, glows, door);

  const atlas = createSignAtlas();
  owners.push(() => {
    atlas.texture.dispose();
  });
  const signMaterial = new THREE.MeshBasicMaterial({ map: atlas.texture });
  signMaterial.color.setScalar(SIGN_GLOW);
  const signs = new THREE.Mesh(signGeometry(atlas.uvOf), signMaterial);
  scene.add(signs);
  owners.push(() => {
    signs.geometry.dispose();
    signMaterial.dispose();
  });

  const countdown = countdownPlate();
  const countdownMaterial = new THREE.MeshBasicMaterial({
    map: countdown.texture,
  });
  countdownMaterial.color.setScalar(SIGN_GLOW);
  const countdownFace = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 2.1),
    countdownMaterial
  );
  countdownFace.position.set(ROOM.doorCentre, 2.5, 0.12);
  door.add(countdownFace);
  owners.push(() => {
    countdown.texture.dispose();
    countdownMaterial.dispose();
    countdownFace.geometry.dispose();
  });

  const outside = createOutside(shading, duskLook, nightLook);
  scene.add(outside.group);
  owners.push(() => {
    outside.dispose();
  });
  const pools = createPools();
  scene.add(pools.group);
  owners.push(() => {
    pools.dispose();
  });

  const bikes = createBikes(assets, shading, [
    {
      livery: riderBlocks[0]?.livery,
      model: "classic",
      paint: 0,
      police: false,
    },
    { livery: riderBlocks[4]?.livery, model: "oni", paint: 4, police: false },
  ]);
  scene.add(bikes.group);
  owners.push(() => {
    bikes.dispose();
  });
  const [heroBike, shelfBike] = bikes.roots;
  if (!(heroBike && shelfBike)) {
    throw new Error("The bar lost a bike.");
  }
  shelfBike.position.set(10.9, MEZZANINE.y, -1.4);
  shelfBike.rotation.y = Math.PI * 0.68;
  heroBike.position.set(PLINTH.x, PLINTH.height, PLINTH.z);

  let revving = 0;
  const puffs = createPuffs(shading);
  scene.add(puffs.group);
  owners.push(() => {
    puffs.dispose();
  });
  const rev = (): void => {
    revving = 1;
    puffs.burst(heroBike, 1, REV_PUFF_SPEED);
  };

  const tags = createTagLayer(canvas);
  owners.push(() => {
    tags.dispose();
  });
  const cast = createCast(
    assets,
    shading,
    tags,
    BUBBLES,
    heroBike,
    pins.riders
  );
  scene.add(cast.group);
  owners.push(() => {
    cast.dispose();
  });
  pipeline.prepare(scene);

  const camera = new THREE.PerspectiveCamera(SHOTS.home.fov, 1, 0.3, 1000);
  let shot: keyof typeof SHOTS = "home";
  const eye = SHOTS.home.spot.clone();
  const aim = SHOTS.home.aim.clone();
  const wantEye = new THREE.Vector3();
  const wantAim = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const projected = new THREE.Vector3();
  const viewSize = { height: 1, width: 1 };
  let clock = 0;
  let neonNow = 1;
  let timeShift = 0;
  let focus: number | null = null;
  let doorOpenedAt: number | null = null;
  let spinAt = 0;

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    const ratio =
      pins.ratio ?? Math.min(globalThis.devicePixelRatio, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    pipeline.resize(width, height, ratio);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  owners.push(() => {
    observer.disconnect();
  });
  resize();

  const onMove = (event: PointerEvent): void => {
    pointer.set(
      (event.clientX / canvas.clientWidth) * 2 - 1,
      (event.clientY / canvas.clientHeight) * 2 - 1
    );
  };
  const pick = (event: PointerEvent): void => {
    const x = (event.clientX / canvas.clientWidth) * 2 - 1;
    const y = 1 - (event.clientY / canvas.clientHeight) * 2;
    let best: number | null = null;
    let nearest = 0.12;
    for (let index = 0; index < cast.members.length; index += 1) {
      const head = cast.members[index]?.head;
      if (!head) {
        continue;
      }
      projected
        .copy(head)
        .setY(head.y - 0.6)
        .project(camera);
      const away = Math.hypot(projected.x - x, (projected.y - y) * 0.6);
      if (away < nearest) {
        nearest = away;
        best = index;
      }
    }
    focus = best === focus ? null : best;
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.code === "KeyR") {
      rev();
    }
    if (event.code === "Space") {
      event.preventDefault();
      doorOpenedAt ??= clock;
    }
    if (event.code === "KeyT") {
      timeShift += CYCLE_SECONDS / 4;
    }
    if (event.code === "KeyG") {
      focus = null;
      shot = shot === "home" ? "garage" : "home";
    }
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", pick);
  globalThis.addEventListener("keydown", onKey);
  owners.push(() => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", pick);
    globalThis.removeEventListener("keydown", onKey);
  });

  let last = 0;
  let handle = 0;
  let frameId = 0;
  let timeStep = -1;
  const frameEnd: FrameEnd = {
    discarded: 0,
    drawRung: 0,
    drawnEpoch: 0,
    interval: 0,
    pixelRatio: 1,
    race: 0,
    rung: 0,
    sizeEpoch: 0,
    tick: 0,
    ticks: 1,
  };

  const setTime = (time: number): void => {
    const tone = toneAt(time);
    shading.relight(tone);
    ambient.color.copy(shading.ambient);
    key.color.copy(shading.sun);
    pipeline.setLook({
      ...duskLook,
      bloom: tone.bloom,
      grade: tone.grade,
      ink: tone.ink,
    });
    neonNow = tone.neon;
    outside.setTime(time);
    pools.setTime(time, tone.neon);
  };

  const frame = (now: number): void => {
    handle = requestAnimationFrame(frame);
    profiler?.start(frameId);
    renderer.info.reset();
    const interval = last === 0 ? 0 : now - last;
    const seconds = Math.min(interval / 1000, LONGEST_STEP);
    last = now;
    clock += seconds;

    const cycle =
      pins.time ??
      0.5 - 0.5 * Math.cos(((clock + timeShift) / CYCLE_SECONDS) * Math.PI * 2);
    const step = Math.round(cycle * 240);
    if (step !== timeStep) {
      timeStep = step;
      setTime(cycle);
    }

    if (doorOpenedAt !== null && clock - doorOpenedAt > LOOP_AFTER_DOOR) {
      clock = 0;
      doorOpenedAt = null;
      cast.reset();
      spinAt = 0;
      heroBike.position.set(PLINTH.x, PLINTH.height, PLINTH.z);
    }
    const left = Math.max(0, COUNTDOWN_START - clock);
    if (left === 0) {
      doorOpenedAt ??= clock;
    }
    const opened = doorOpenedAt === null ? 0 : clock - doorOpenedAt;
    const lift = THREE.MathUtils.smoothstep(opened / DOOR_SECONDS, 0, 1);
    door.position.y = lift * DOOR_RISE;
    countdown.show(`0:${String(Math.ceil(left)).padStart(2, "0")}`);

    revving = Math.max(0, revving - seconds * 0.8);
    spinAt += seconds * ((Math.PI * 2) / TURN_SECONDS);
    bikes.spin(0, revving * seconds * 60);
    glowMaterial.color.setScalar(neonNow * (1 + revving * 0.7));
    if (doorOpenedAt === null) {
      heroBike.rotation.y = spinAt;
    } else {
      const ride = Math.max(0, opened - BIKE_WAITS);
      const gone = BIKE_PULL * ride * ride;
      const toDoor = Math.min(1, gone / DOOR_REACH);
      const onward = Math.max(0, gone - DOOR_REACH);
      const facing = Math.atan2(
        PLINTH.x - ROOM.doorCentre,
        PLINTH.z - ROOM.backZ
      );
      const turn = THREE.MathUtils.smoothstep(opened / BIKE_WAITS, 0, 1);
      const off =
        THREE.MathUtils.euclideanModulo(
          facing - spinAt + Math.PI,
          Math.PI * 2
        ) - Math.PI;
      heroBike.rotation.y = (spinAt + off * turn) * (1 - toDoor);
      heroBike.position.set(
        THREE.MathUtils.lerp(PLINTH.x, ROOM.doorCentre, toDoor),
        gone > PLINTH.radius ? 0 : PLINTH.height,
        THREE.MathUtils.lerp(PLINTH.z, ROOM.backZ, toDoor) - onward
      );
      bikes.spin(0, BIKE_PULL * 2 * ride * seconds);
    }
    bikes.show(0);
    bikes.sag(0, Math.sin(clock * 90) * 0.006 * revving);
    bikes.show(1);
    bikes.commit(anchor);

    puffs.update(seconds);
    outside.tick(seconds);
    const sweepPhase = (clock % 9) / 9;
    pools.sweep(
      -9,
      THREE.MathUtils.lerp(-14, 22, sweepPhase),
      sweepPhase < 0.5 ? cycle * 0.8 : 0
    );

    const member = focus === null ? null : cast.members[focus];
    if (member) {
      wantAim.copy(member.head).setY(member.head.y - 0.5);
      wantEye.copy(wantAim).add(projected.set(1.4, 0.9, 5.2));
    } else if (lift > 0) {
      wantAim.set(ROOM.doorCentre, 2.2, ROOM.backZ - 6);
      wantEye.set(
        ROOM.doorCentre + (1 - lift) * 2,
        2.4 + (1 - lift) * 4,
        -1 + (1 - lift) * 20
      );
    } else {
      const { aim: shotAim, spot } = SHOTS[shot];
      wantAim.copy(shotAim);
      wantEye.set(spot.x + pointer.x * 0.9, spot.y - pointer.y * 0.4, spot.z);
      wantAim.x += pointer.x * 0.4;
    }
    const ease = Math.min(1, seconds * 3.2);
    eye.lerp(wantEye, ease);
    aim.lerp(wantAim, ease);
    const wantFov = member || lift > 0 ? SHOTS.home.fov : SHOTS[shot].fov;
    if (Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov += (wantFov - camera.fov) * ease;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(eye);
    camera.lookAt(aim);
    camera.updateMatrixWorld();

    viewSize.width = canvas.clientWidth;
    viewSize.height = canvas.clientHeight;
    cast.update(seconds, clock, camera, lift, viewSize);
    shading.aim(camera);
    pipeline.render(scene, camera);

    if (profiler) {
      frameEnd.interval = interval;
      frameEnd.pixelRatio = renderer.getPixelRatio();
      frameEnd.tick = frameId;
      profiler.finish(frameEnd);
    }
    frameId += 1;
  };

  pipeline.compile(scene, camera);
  handle = requestAnimationFrame(frame);
  owners.push(() => {
    cancelAnimationFrame(handle);
  });
  Reflect.set(globalThis, "__rushlineBar", {
    calls: () => renderer.info.render.calls,
    frames: () => frameId,
    openDoor: () => {
      doorOpenedAt ??= clock;
    },
    rev,
    setFocus: (index: number | null) => {
      focus = index;
    },
    setShot: (name: keyof typeof SHOTS) => {
      focus = null;
      shot = name;
    },
    triangles: () => renderer.info.render.triangles,
  });
  owners.push(() => {
    Reflect.deleteProperty(globalThis, "__rushlineBar");
  });

  return {
    dispose() {
      for (const release of owners.splice(0).toReversed()) {
        release();
      }
    },
  };
};

export const createBar = (
  canvas: HTMLCanvasElement,
  assets: Decoded<Assets>
): BarScene => {
  const owners = [assets.release];
  try {
    return openRoom(canvas, assets.value, owners);
  } catch (error) {
    for (const release of owners.splice(0).toReversed()) {
      release();
    }
    throw error;
  }
};
