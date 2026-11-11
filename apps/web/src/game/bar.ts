import type { RoomSeat } from "@racer/rooms/seat-client";
import { createLobbyRider } from "@racer/sim/lobby";
import { doorSpot, GARAGE_PLINTH, PLINTH, ROOM } from "@racer/sim/lobby-floor";
import { riderBlocks } from "@racer/sim/palette";
import * as THREE from "three";

import { SOLO_SLOT } from "../bar-view.ts";
import type { BarCamera } from "../bar-view.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import { graphicsCard } from "../diagnostics/player-events.ts";
import { createBikes } from "./actors.ts";
import type { Assets, Decoded } from "./assets.ts";
import { createBarEye } from "./bar-camera.ts";
import { createCast } from "./bar-cast.ts";
import { buildGarage } from "./bar-garage.ts";
import { createBarInput } from "./bar-input.ts";
import { createKit } from "./bar-kit.ts";
import { duskLook, nightLook, toneAt } from "./bar-light.ts";
import { createMembers } from "./bar-members.ts";
import type { BarMembers } from "./bar-members.ts";
import { createOutside } from "./bar-outside.ts";
import { createBarPlayer } from "./bar-player.ts";
import type { BarCompany, PlayerSlot } from "./bar-player.ts";
import { createPools } from "./bar-pools.ts";
import { buildProps } from "./bar-props.ts";
import {
  buildCeiling,
  buildDoor,
  buildFixtures,
  buildFloor,
  buildShell,
} from "./bar-room.ts";
import { countdownPlate, createSignAtlas, signGeometry } from "./bar-signs.ts";
import { createSpeech } from "./bar-speech.ts";
import { createTagLayer } from "./bar-tags.ts";
import { createWalkers } from "./bar-walker.ts";
import { createShading } from "./cel.ts";
import { releaseAll } from "./dispose.ts";
import { createPipeline } from "./post.ts";
import { pixelRatioFor, presetFor, presets } from "./presets.ts";
import { createProfiler, profileModeOf } from "./profile.ts";
import type { FrameEnd } from "./profile.ts";
import { createPuffs } from "./puffs.ts";

export { assetParsers } from "./assets.ts";

const BIKE_WAITS = 1.3;
const BIKE_PULL = 1.6;
const DOOR_REACH = Math.hypot(
  PLINTH.x - ROOM.doorCentre,
  PLINTH.z - ROOM.backZ
);
const SIGN_GLOW = 1.55;
const REV_PUFF_SPEED = 9;
const GARAGE_LIVERY = { bike: 0xc8_21_4a, trim: 0x2a_1a_38 } as const;
const GARAGE_BIKE_YAW = 2.61;
const GARAGE_BIKE_SWAY = 0.22;
const SHADOW_SPAN = 18;
const SHADOW_DISTANCE = 26;
const LONGEST_STEP = 0.1;
const CYCLE_SECONDS = 150;
const DOOR_SECONDS = 2.6;
const DOOR_RISE = 4.5;
const TURN_SECONDS = 14;
const FIRST_WALKER_BIKE = 2;
const MS_PER_SECOND = 1000;
const NO_RACE_YET = "--";
const MIN_BLOOM_SCALE = 1;

interface Pins {
  readonly ratio: number | null;
  readonly riders: number;
  readonly samples: number;
  readonly bloom: number;
  readonly maxPixels: number | null;
  readonly shadow: number;
  readonly time: number | null;
}

const pinsFrom = (search: string): Pins => {
  const flags = new URLSearchParams(search);
  const number = (name: string): number | null => {
    const value = flags.get(name);
    return value === null ? null : Number(value);
  };
  const preset = flags.has("lean") ? presets.lean : presetFor(graphicsCard());
  const named = flags.get("time");
  const fixed = named === "night" ? 1 : number("time");
  return {
    bloom: number("bloom") ?? Math.max(preset.bloomScale, MIN_BLOOM_SCALE),
    maxPixels: preset.maxPixels,
    ratio: number("ratio"),
    riders: number("riders") ?? riderBlocks.length,
    samples: number("samples") ?? preset.samples,
    shadow: number("shadow") ?? preset.shadowMap,
    time: named === "dusk" ? 0 : fixed,
  };
};

export interface BarScene {
  readonly setCamera: (mode: BarCamera) => void;
  readonly setSeat: (seat: RoomSeat | null) => void;
  readonly setDoor: (open: boolean) => void;
  readonly dispose: () => void;
}

const openRoom = (
  canvas: HTMLCanvasElement,
  assets: Assets,
  startCamera: BarCamera,
  owners: (() => void)[]
): BarScene => {
  const pins = pinsFrom(globalThis.location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: false, canvas });
  owners.push(
    () => {
      renderer.dispose();
      renderer.forceContextLoss();
    },
    diagnostics().watchCanvas(canvas, "bar")
  );
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
  const pipeline = createPipeline(
    renderer,
    (part) => {
      profiler?.lap(part);
    },
    { bloomScale: pins.bloom, samples: pins.samples }
  );
  owners.push(() => {
    pipeline.dispose();
  });

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
  buildGarage(propKit, glowKit);
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
    { livery: GARAGE_LIVERY, model: "ghost", paint: 4, police: false },
    ...riderBlocks.map(({ livery }) => ({
      livery,
      model: "classic" as const,
      paint: 2,
      police: false,
    })),
  ]);
  scene.add(bikes.group);
  owners.push(() => {
    bikes.dispose();
  });
  const [heroBike, garageBike] = bikes.roots;
  if (!(heroBike && garageBike)) {
    throw new Error("The bar lost a bike.");
  }
  garageBike.position.set(
    GARAGE_PLINTH.x,
    GARAGE_PLINTH.height,
    GARAGE_PLINTH.z
  );
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
  const speech = createSpeech(tags);
  const cast = createCast(
    assets,
    shading,
    tags,
    speech,
    heroBike,
    garageBike,
    pins.riders,
    true
  );
  scene.add(cast.group);
  owners.push(() => {
    cast.dispose();
  });
  const walkers = createWalkers(assets, shading, tags, scene);
  owners.push(() => {
    walkers.dispose();
  });
  const rider = createLobbyRider();
  let seat: RoomSeat | null = null;
  let members: BarMembers | null = null;
  const company: BarCompany = {
    crowd: () => (members ?? cast).crowd(),
    greet(index, x, z, time) {
      (members ?? cast).greet(index, x, z, time);
    },
    nearest: (x, z, reach) => (members ?? cast).nearest(x, z, reach),
    shove(index, x, z, time) {
      (members ?? cast).shove(index, x, z, time);
    },
    spotOf: (index) => (members ?? cast).spotOf(index),
  };
  const yourSlot = (): PlayerSlot => {
    const slot = members?.mine() ?? SOLO_SLOT;
    const bikeIndex = FIRST_WALKER_BIKE + slot;
    const bike = bikes.roots[bikeIndex];
    if (!bike) {
      throw new Error(`The bar has no bike for slot ${String(slot)}.`);
    }
    return { bike, bikeIndex, walker: walkers.at(slot) };
  };
  yourSlot().walker.rename("YOU");
  const player = createBarPlayer({
    bikes,
    company,
    puffs,
    rider,
    slot: yourSlot,
    speech,
  });
  pipeline.prepare(scene);

  const eye = createBarEye(startCamera, player.view);
  const { camera } = eye;
  const anchor = new THREE.Vector3();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const clicked = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const noControl = { forward: 0, right: 0, sprint: false };
  const viewSize = { height: 1, width: 1 };
  let clock = 0;
  let neonNow = 1;
  let doorOpenedAt: number | null = null;
  let spinAt = 0;

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    const ratio =
      pins.ratio ??
      pixelRatioFor(pins, globalThis.devicePixelRatio, width, height);
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

  const input = createBarInput(canvas, {
    action(action) {
      player.act(action, clock);
    },
    click(x, y) {
      clicked.set(x, y);
      ray.setFromCamera(clicked, camera);
      if (ray.ray.intersectPlane(floorPlane, hit)) {
        player.walkTo(hit.x, hit.z);
      }
    },
    drag(pixels) {
      eye.orbit(pixels);
    },
    pose(pose) {
      player.pose(pose);
    },
  });
  owners.push(() => {
    input.dispose();
  });

  let last = 0;
  let handle = 0;
  let frameId = 0;
  let timeStep = -1;
  const frameEnd: FrameEnd = {
    discarded: 0,
    drawnEpoch: 0,
    interval: 0,
    pixelRatio: 1,
    race: 0,
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

  const openDoor = (): void => {
    if (doorOpenedAt === null) {
      doorOpenedAt = clock;
      const spot = doorSpot(members?.mine() ?? 0);
      player.walkTo(spot.x, spot.z);
    }
  };

  const runDoor = (): void => {
    if (seat?.race()) {
      openDoor();
    }
  };

  const msToDoor = (): number | null => {
    if (!seat) {
      return null;
    }
    return seat.race() ? 0 : seat.startsInMs();
  };

  const closeDoor = (): void => {
    doorOpenedAt = null;
    door.position.y = 0;
    heroBike.position.set(PLINTH.x, PLINTH.height, PLINTH.z);
  };

  const setSeat = (next: RoomSeat | null): void => {
    if (next === seat) {
      return;
    }
    const left = yourSlot();
    seat = next;
    members =
      next &&
      createMembers({
        bikes,
        firstBike: FIRST_WALKER_BIKE,
        rider,
        seat: next,
        speech,
        walkers,
      });
    cast.setStandIns(next === null);
    closeDoor();
    if (next === null) {
      for (let slot = 0; slot < riderBlocks.length; slot += 1) {
        if (slot !== SOLO_SLOT) {
          walkers.hide(slot);
        }
      }
    } else {
      left.walker.show(false);
    }
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
      pins.time ?? 0.5 - 0.5 * Math.cos((clock / CYCLE_SECONDS) * Math.PI * 2);
    const step = Math.round(cycle * 240);
    if (step !== timeStep) {
      timeStep = step;
      setTime(cycle);
    }

    runDoor();
    const left = msToDoor();
    const opened = doorOpenedAt === null ? 0 : clock - doorOpenedAt;
    const lift = THREE.MathUtils.smoothstep(opened / DOOR_SECONDS, 0, 1);
    door.position.y = lift * DOOR_RISE;
    countdown.show(
      left === null
        ? NO_RACE_YET
        : `0:${String(Math.ceil(left / MS_PER_SECOND)).padStart(2, "0")}`
    );

    revving = Math.max(0, revving - seconds * 0.8);
    spinAt += seconds * ((Math.PI * 2) / TURN_SECONDS);
    bikes.spin(0, revving * seconds * 60);
    glowMaterial.color.setScalar(neonNow);
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
    garageBike.rotation.y =
      GARAGE_BIKE_YAW + Math.sin(clock * 0.25) * GARAGE_BIKE_SWAY;
    bikes.show(1);
    members?.step(seconds, clock);
    const ticks = player.advance(
      seconds,
      lift > 0 ? noControl : input.control(),
      eye.viewYaw(),
      clock
    );
    bikes.commit(anchor);

    puffs.update(seconds);
    outside.tick(seconds);
    const sweepPhase = (clock % 9) / 9;
    pools.sweep(
      -9,
      THREE.MathUtils.lerp(-14, 22, sweepPhase),
      sweepPhase < 0.5 ? cycle * 0.8 : 0
    );

    eye.aim(seconds, player.view, lift, input.dragging());

    viewSize.width = canvas.clientWidth;
    viewSize.height = canvas.clientHeight;
    cast.update(seconds, clock, camera, lift, viewSize, ticks);
    members?.draw(seconds, camera, viewSize);
    const you = yourSlot();
    you.walker.rename(members?.myLabel() ?? "YOU");
    you.walker.show(true);
    you.walker.update(
      player.stance(),
      player.view,
      you.bike,
      clock,
      seconds,
      camera,
      viewSize
    );
    speech.update(clock, camera, viewSize);
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
    openDoor,
    player: () => ({
      bikeFound: rider.bikeFound,
      camera: eye.mode(),
      heading: rider.heading,
      lean: rider.lean,
      pace: rider.pace,
      place: rider.place,
      target: rider.target,
      x: rider.x,
      z: rider.z,
    }),
    presence: () => members?.presence() ?? [],
    rev,
    triangles: () => renderer.info.render.triangles,
    walkTo: player.walkTo,
  });
  owners.push(() => {
    Reflect.deleteProperty(globalThis, "__rushlineBar");
  });

  return {
    dispose() {
      releaseAll(owners);
    },
    setCamera(mode) {
      eye.setMode(mode, rider.heading);
    },
    setDoor(open) {
      if (open) {
        openDoor();
      } else if (seat === null) {
        closeDoor();
      }
    },
    setSeat,
  };
};

export const createBar = (
  canvas: HTMLCanvasElement,
  assets: Decoded<Assets>,
  startCamera: BarCamera
): BarScene => {
  const owners = [assets.release];
  try {
    return openRoom(canvas, assets.value, startCamera, owners);
  } catch (error) {
    releaseAll(owners);
    throw error;
  }
};
