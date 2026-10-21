import { rivalLines } from "@racer/career/lines";
import { createRaceLog, outcomeOf, recordTick } from "@racer/career/outcome";
import type { RaceLog, RaceOutcome } from "@racer/career/outcome";
import { HIT_STUN_TICKS } from "@racer/sim/combat";
import { pilotInput } from "@racer/sim/pilot";
import { chaserDistance } from "@racer/sim/police";
import {
  createRace,
  defaultSetup,
  distanceLeft,
  standings,
  stepRace,
} from "@racer/sim/race";
import { RUN_SPEED } from "@racer/sim/rider";
import {
  clamp,
  FULL_CONDITION,
  MAX_STAMINA,
  TICK_RATE,
  TICK_SECONDS,
} from "@racer/sim/state";
import type {
  AttackKind,
  HazardEffect,
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import { strikeOf, weapons } from "@racer/sim/weapons";
import type {
  FrameRate,
  GovernReason,
  ResizeSource,
} from "@racer/telemetry/limits";
import { governReasons } from "@racer/telemetry/limits";
import { emptySupport, supportAt } from "@racer/track/features";
import { roadIds, trackFor } from "@racer/track/roads";
import type { Track } from "@racer/track/track";
import * as THREE from "three";

import { benchOf } from "../career/bench.ts";
import { bikeColour } from "../career/colours.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import { emptyQuality } from "../diagnostics/recorder.ts";
import type { QualityState } from "../diagnostics/recorder.ts";
import { createBikes, createFleet, poseOnTrack, reachOf } from "./actors.ts";
import type { Bikes, Fleet, Reach } from "./actors.ts";
import { loadAssets } from "./assets.ts";
import { createSound } from "./audio.ts";
import { createChaseCamera } from "./chase-camera.ts";
import type { Subject } from "./chase-camera.ts";
import { devRideFrom } from "./dev-ride.ts";
import { createFrameMeter, emptySample, wantsFrameMeter } from "./fps-meter.ts";
import type { FrameMeter } from "./fps-meter.ts";
import { BASE_RATE, createGovernor } from "./governor.ts";
import type { Verdict } from "./governor.ts";
import type {
  GameEvents,
  GameHandle,
  GamePhase,
  Notice,
  RacePlan,
} from "./hud.ts";
import { createControls } from "./input.ts";
import { isMesh } from "./meshes.ts";
import { createPacer, createRefreshMeter } from "./pacer.ts";
import { BLOOM_SCALE, createPipeline, SAMPLES } from "./post.ts";
import type { Compiling } from "./post.ts";
import { createProfiler, profileModeOf, rendererOf } from "./profile.ts";
import type { FrameEnd, Part, Profiler } from "./profile.ts";
import { createPuffs } from "./puffs.ts";
import type { Puffs } from "./puffs.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, RiderPose, Stance } from "./rider-figure.ts";
import { createWorld, SHADOW_MAP } from "./world.ts";

const COUNTDOWN_SECONDS = 3;
const HUD_INTERVAL = 1 / 15;
const NOTICE_SECONDS = 0.8;
const SPEECH_SECONDS = 2;
const RESUME_SECONDS = 3;
const LAST_STRETCH = 1000;
const TAG_RANGE = 25;
const TAG_HEIGHT = 2.2;
const TAG_MARGIN = 0.82;
const MAX_FRAME_SECONDS = 0.1;
const EXCUSED_FRAMES = 2;
const COMPILE_TIMEOUT_MS = 5000;
const MAX_PIXEL_RATIO = 2;
const PIXEL_RATIO_STEP = 0.1;
const LOWEST_RATIO_SHARE = 0.75;
const LEAN_SHADOW_MAP = 2048;
const LEAN_BLOOM_SCALE = 1;
const WRAP_JUMP = 30;
const LYING_PITCH = -Math.PI / 2;
const LYING_HEIGHT = 0.22;
const RISE_SECONDS = 0.3;
const LIFT_TICKS = 14;
const RUN_HZ = 2.6;
const WALKING = 0.3;
const WINDUP_TICKS = 3;
const SWING_LEAD_TICKS = 3;
const HOLD_TICKS = 4;
const RETURN_TICKS = 5;
const KICK_RISE_TICKS = 2.5;
const SAG_PER_IMPACT = 0.45;
const MOST_SAG_KICK = 3.2;
const SAG_STIFFNESS = 260;
const SAG_DAMPING = 16;
const SAG_STEP = 1 / 240;
const MOST_SAG = 0.16;
const PUFF_AIR_SECONDS = 0.2;
const PUFF_PER_IMPACT = 0.1;
const POTHOLE_SAG_KICK = 1.6;
const HAZARD_PUFF = 0.6;
const HAZARD_JOLT = {
  bump: 0.55,
  jolt: 0.35,
  slip: 0.15,
  stagger: 0.6,
} as const satisfies Record<HazardEffect, number>;
const BUMP_PER_IMPACT = 1 / 9;
const KICK_HOLD_TICKS = 2;
const KICK_RETRACT_TICKS = 3;
const KICK_DROP_FROM = 8;
const KICK_DROP_TICKS = 5;
const BUSTED_SECONDS = 0.8;
const WRECKED_SECONDS = 1.2;
const ROAD_LEVEL = 1;
const MARKER_KEY = "KeyB";

interface Pose {
  s: number;
  x: number;
  heading: number;
  lean: number;
  air: number;
  bodyS: number;
  bodyX: number;
  bodyAir: number;
}

interface RiderView {
  readonly bike: THREE.Object3D;
  readonly figure: RiderFigure;
  readonly before: Pose;
  readonly after: Pose;
  tumbleAngle: number;
  pitch: number;
  lift: number;
  yaw: number;
  stride: number;
  sag: number;
  sagSpeed: number;
}

const capture = (rider: RiderState, pose: Pose): void => {
  pose.s = rider.s;
  pose.x = rider.x;
  pose.heading = rider.heading;
  pose.lean = rider.lean;
  pose.air = rider.air;
  pose.bodyS = rider.bodyS;
  pose.bodyX = rider.bodyX;
  pose.bodyAir = rider.bodyAir;
};

const emptyPose = (): Pose => ({
  air: 0,
  bodyAir: 0,
  bodyS: 0,
  bodyX: 0,
  heading: 0,
  lean: 0,
  s: 0,
  x: 0,
});

const mix = (from: number, to: number, blend: number): number =>
  from + (to - from) * blend;

const freshInput = (): RiderInput => ({
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0,
});

interface StrikeFrame {
  pose: RiderPose;
  reach: number;
  rise: number;
}

const strikeAt = (
  frame: StrikeFrame,
  pose: RiderPose,
  reach: number,
  rise = 0
): true => {
  frame.pose = pose;
  frame.reach = reach;
  frame.rise = rise;
  return true;
};

const windingUp = (
  attack: AttackKind,
  elapsed: number,
  land: number,
  frame: StrikeFrame
): true => {
  if (attack !== "swing") {
    return strikeAt(frame, attack, elapsed / land);
  }
  const lead = land - SWING_LEAD_TICKS;
  if (elapsed < lead) {
    return strikeAt(frame, "windup", Math.min(1, elapsed / WINDUP_TICKS));
  }
  return strikeAt(frame, "swing", (elapsed - lead) / SWING_LEAD_TICKS);
};

const kickFrame = (
  elapsed: number,
  land: number,
  frame: StrikeFrame
): boolean => {
  const dropped = (elapsed - KICK_DROP_FROM) / KICK_DROP_TICKS;
  if (dropped >= 1) {
    return false;
  }
  const rising = 1 - Math.max(0, 1 - elapsed / KICK_RISE_TICKS) ** 2;
  const rise = dropped > 0 ? 1 - dropped * dropped : rising;
  const snap = (elapsed - KICK_RISE_TICKS) / (land - KICK_RISE_TICKS);
  const retract = (elapsed - land - KICK_HOLD_TICKS) / KICK_RETRACT_TICKS;
  return strikeAt(
    frame,
    "kick",
    clamp(Math.min(snap, 1 - retract), 0, 1),
    rise
  );
};

const flinchOf = (rider: RiderState, subTick: number): number =>
  Math.max(0, rider.hitStun - subTick) / HIT_STUN_TICKS;

const strikeFrame = (
  rider: RiderState,
  subTick: number,
  frame: StrikeFrame
): boolean => {
  if (rider.attack === "none") {
    return false;
  }
  const strike = strikeOf(rider.attack, rider.weapon);
  const land = strike.ticks - strike.strikeTick;
  const elapsed = strike.ticks - rider.attackTicks + subTick;
  if (rider.attack === "kick") {
    return kickFrame(elapsed, land, frame);
  }
  const out = rider.attack === "swing" ? "swung" : rider.attack;
  if (elapsed < land) {
    return windingUp(rider.attack, elapsed, land, frame);
  }
  if (elapsed < land + HOLD_TICKS) {
    return strikeAt(frame, out, 1);
  }
  const back = (elapsed - land - HOLD_TICKS) / RETURN_TICKS;
  return back < 1 && strikeAt(frame, out, 1 - back);
};

const weaponName = (rider: RiderState): string =>
  rider.weapon === "none" ? "" : weapons[rider.weapon].name;

const weaponCapacity = (rider: RiderState): number =>
  rider.weapon === "none" ? 0 : weapons[rider.weapon].hits;

const consequenceSeconds = (outcome: RaceOutcome): number => {
  if (outcome.result === "busted") {
    return BUSTED_SECONDS;
  }
  return outcome.result === "wrecked" ? WRECKED_SECONDS : 0;
};

interface Placed {
  s: number;
  x: number;
  air: number;
  lean: number;
  bodyS: number;
  bodyX: number;
  bodyAir: number;
  seated: boolean;
}

const out = (rider: RiderState): boolean =>
  rider.mode === "busted" || rider.mode === "wrecked";

const autopilot =
  (import.meta.env.DEV &&
    new URLSearchParams(globalThis.location.search).has("autopilot")) ||
  benchOf(globalThis.location.search) !== null;

const devRide = import.meta.env.DEV
  ? devRideFrom(globalThis.location.search)
  : undefined;

const firstRoad = import.meta.env.DEV
  ? Number(new URLSearchParams(globalThis.location.search).get("road") ?? 0)
  : 0;

const pinnedPixelRatio = Number(
  new URLSearchParams(globalThis.location.search).get("ratio") ?? 0
);

const pinnedRung = Number(
  new URLSearchParams(globalThis.location.search).get("rung") ?? -1
);

const pinnedRefresh = Number(
  new URLSearchParams(globalThis.location.search).get("hz") ?? 0
);

interface Compile {
  readonly load: number;
  readonly compiling: Compiling;
  readonly done: (current: boolean) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface Rung {
  readonly shadowMap: number;
  readonly bloomScale: number;
  readonly samples: number;
  readonly pixelRatio: number;
}

const MODEST_GPU =
  /Apple GPU|Apple M\d(?!\d|\s*(?:Pro|Max|Ultra))|Intel|Mali|Adreno|PowerVR/u;
const MODEST_START_RUNG = 3;

const startRungFor = (gpu: string): number =>
  MODEST_GPU.test(gpu) ? MODEST_START_RUNG : 0;

const nativePixelRatio = (): number =>
  Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);

const ladderFor = (ceiling: number): readonly Rung[] => {
  const rungs: Rung[] = [
    {
      bloomScale: BLOOM_SCALE,
      pixelRatio: ceiling,
      samples: SAMPLES,
      shadowMap: SHADOW_MAP,
    },
    {
      bloomScale: BLOOM_SCALE,
      pixelRatio: ceiling,
      samples: SAMPLES,
      shadowMap: LEAN_SHADOW_MAP,
    },
    {
      bloomScale: LEAN_BLOOM_SCALE,
      pixelRatio: ceiling,
      samples: SAMPLES,
      shadowMap: LEAN_SHADOW_MAP,
    },
    {
      bloomScale: LEAN_BLOOM_SCALE,
      pixelRatio: ceiling,
      samples: 0,
      shadowMap: LEAN_SHADOW_MAP,
    },
  ];
  const floor = ceiling * LOWEST_RATIO_SHARE;
  for (let step = 1; ; step += 1) {
    const pixelRatio =
      Math.round((ceiling - step * PIXEL_RATIO_STEP) * 100) / 100;
    if (pixelRatio < floor) {
      return rungs;
    }
    rungs.push({
      bloomScale: LEAN_BLOOM_SCALE,
      pixelRatio,
      samples: 0,
      shadowMap: LEAN_SHADOW_MAP,
    });
  }
};

const revealAll = (root: THREE.Object3D): (() => void) => {
  const hidden: THREE.Object3D[] = [];
  const culled: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (!node.visible) {
      hidden.push(node);
      node.visible = true;
    }
    if (node.frustumCulled) {
      culled.push(node);
      node.frustumCulled = false;
    }
  });
  return () => {
    for (const node of hidden) {
      node.visible = false;
    }
    for (const node of culled) {
      node.frustumCulled = true;
    }
  };
};

const dropGeometry = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.geometry.dispose();
    }
  });
};

const roadForTurn = (turn: number): Track =>
  trackFor(roadIds[turn % roadIds.length] ?? "ridge-road", ROAD_LEVEL);

export async function createGame(
  canvas: HTMLCanvasElement,
  events: GameEvents
): Promise<GameHandle> {
  const display = { refresh: pinnedRefresh > 0 ? pinnedRefresh : 60 };

  const assets = await loadAssets();
  let roadTurn = firstRoad;
  let track = roadForTurn(roadTurn);
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    canvas,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  let ladder = ladderFor(nativePixelRatio());
  const governor = createGovernor(ladder.length);
  let rung = 0;
  let pixelRatio = pinnedPixelRatio > 0 ? pinnedPixelRatio : nativePixelRatio();
  renderer.setPixelRatio(pixelRatio);
  const hub = diagnostics();
  const { recorder } = hub;
  const profileMode = profileModeOf(globalThis.location.search);
  let profiler: Profiler | null =
    profileMode === "off"
      ? null
      : createProfiler(renderer, profileMode === "gpu");
  const lap = (part: Part) => {
    profiler?.lap(part);
  };
  const pipeline = createPipeline(renderer, lap);
  const meterFlag = wantsFrameMeter();
  let meter: FrameMeter | null = null;
  const sample = emptySample();
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
    ticks: 0,
  };
  const qualityBefore: QualityState = emptyQuality();
  const qualityAfter: QualityState = emptyQuality();
  let frameId = 0;
  let sizeEpoch = 0;
  let excuseFrames = 0;
  let appliedWidth = -1;
  let appliedHeight = -1;
  let appliedRatio = -1;
  let drawnEpoch = 0;
  let drawnFrame = -1;
  let drawnRung = 0;
  let rendering = false;
  let rendererLabel = "";
  let overlayNoted: boolean | null = null;

  let world = createWorld(track);
  pipeline.setLook(world.shading.look);
  const chase = createChaseCamera();
  const sound = createSound();

  let seed = 1;
  let race: RaceState = createRace(defaultSetup(track, seed));
  let fleet: Fleet = createFleet(assets, world.shading, race.cars);
  world.scene.add(fleet.group);
  let previousCars = new Float64Array(race.cars.length);
  let views: RiderView[] = [];
  let bikes: Bikes | null = null;
  let puffs: Puffs | null = null;
  const deck = emptySupport();
  let riderReach: Reach = reachOf(world.shading);
  let inputs: RiderInput[] = [];

  let phase: GamePhase = "attract";
  let plan: RacePlan | null = null;
  let log: RaceLog | null = null;
  let settled: RaceOutcome | null = null;
  let overLeft = 0;
  let frozen = false;
  let holdLeft = 0;
  let countdown = 0;
  let lastStretchSaid = false;
  let notice: Notice = "";
  let noticeDetail = "";
  let noticeLeft = 0;
  let speech = "";
  let speechRider = -1;
  let speechLeft = 0;
  let tagRider = -1;
  let tag: HTMLElement | null = null;
  let plates: string[] = [];
  let muted = false;
  let accumulator = 0;
  let clockReset = false;
  let hudClock = 0;
  let pace = BASE_RATE;
  const pacer = createPacer();
  const readRefresh = createRefreshMeter(display.refresh);
  let lastBusyMs = 0;
  let clock = 0;

  const subject: Subject = { air: 0, s: 0, speed: 0, tuck: 0, x: 0 };
  const stance: Stance = {
    flinch: 0,
    flinchSide: 1,
    lean: 0,
    pose: "seated",
    reach: 0,
    rise: 0,
    side: 1,
    time: 0,
    tuck: 0,
    weapon: "none",
  };
  const strike: StrikeFrame = { pose: "seated", reach: 0, rise: 0 };
  let lastGear = 1;
  const placed: Placed = {
    air: 0,
    bodyAir: 0,
    bodyS: 0,
    bodyX: 0,
    lean: 0,
    s: 0,
    seated: true,
    x: 0,
  };
  const tagPoint = new THREE.Vector3();

  const player = (): RiderState => {
    const [rider] = race.riders;
    if (!rider) {
      throw new Error("The race has no rider.");
    }
    return rider;
  };

  const say = (next: Notice, detail = "") => {
    notice = next;
    noticeDetail = detail;
    noticeLeft = NOTICE_SECONDS;
  };

  const dropViews = () => {
    for (const view of views) {
      world.scene.remove(view.figure.root);
      view.figure.dispose();
    }
    views = [];
    if (bikes) {
      world.scene.remove(bikes.group);
      bikes.dispose();
      bikes = null;
    }
    if (puffs) {
      world.scene.remove(puffs.group);
      puffs.dispose();
      puffs = null;
    }
  };

  const dropFleet = () => {
    world.scene.remove(fleet.group);
    fleet.dispose();
  };

  const buildViews = () => {
    dropViews();
    const fleetOfBikes = createBikes(
      assets,
      world.shading,
      race.riders.map((rider) => ({
        paint: rider.profile.paint,
        police: rider.profile.role === "police",
      }))
    );
    bikes = fleetOfBikes;
    riderReach = reachOf(world.shading);
    world.scene.add(fleetOfBikes.group);
    puffs = createPuffs(world.shading);
    world.scene.add(puffs.group);
    views = race.riders.map((rider, index) => {
      const bike = fleetOfBikes.roots[index] ?? new THREE.Object3D();
      const figure = createRiderFigure(
        assets,
        world.shading,
        rider.profile.jacket,
        index
      );
      world.scene.add(figure.root);
      const view: RiderView = {
        after: emptyPose(),
        before: emptyPose(),
        bike,
        figure,
        lift: figure.standHeight,
        pitch: 0,
        sag: 0,
        sagSpeed: 0,
        stride: 0,
        tumbleAngle: 0,
        yaw: 0,
      };
      capture(rider, view.before);
      capture(rider, view.after);
      return view;
    });
    inputs = race.riders.map(() => freshInput());
    plates = race.riders.map((rider) => bikeColour(rider.profile.paint));
  };

  const retire = (): (() => void) => {
    const { scene } = world;
    const oldViews = views;
    const oldBikes = bikes;
    const oldPuffs = puffs;
    const oldFleet = fleet;
    for (const view of oldViews) {
      scene.remove(view.figure.root);
    }
    if (oldBikes) {
      scene.remove(oldBikes.group);
    }
    if (oldPuffs) {
      scene.remove(oldPuffs.group);
    }
    scene.remove(oldFleet.group);
    views = [];
    bikes = null;
    puffs = null;
    return () => {
      for (const view of oldViews) {
        view.figure.dispose();
      }
      oldBikes?.dispose();
      oldPuffs?.dispose();
      oldFleet.dispose();
    };
  };

  const takeTrack = (next: Track) => {
    if (next === track) {
      return;
    }
    track = next;
    world = createWorld(track, (ladder[rung] ?? ladder[0])?.shadowMap);
    pipeline.setLook(world.shading.look);
  };

  const stageEverything = (): (() => void) => {
    world.follow(chase.camera, player().s);
    const samples = world.samples();
    world.scene.add(samples);
    const unarm = views.map((view) => view.figure.holdEveryWeapon());
    const unprime = puffs?.prime();
    pipeline.prepare(world.scene);
    const restore = revealAll(world.scene);
    return () => {
      restore();
      unprime?.();
      for (const each of unarm) {
        each();
      }
      world.scene.remove(samples);
      dropGeometry(samples);
    };
  };

  const warmUp = () => {
    const unstage = stageEverything();
    pipeline.render(world.scene, chase.camera);
    unstage();
  };

  let loads = 0;
  let warming = false;
  let alive = true;
  const compiles = new Set<Compile>();
  let prepared: RaceSetup | null = null;
  let preparing: Promise<void> = Promise.resolve();

  const finishCompile = (job: Compile) => {
    if (!compiles.delete(job)) {
      return;
    }
    clearTimeout(job.timer);
    job.compiling.stop?.();
    if (!alive || job.load !== loads) {
      job.done(false);
      return;
    }
    warming = false;
    try {
      warmUp();
    } finally {
      job.done(true);
    }
  };

  const abandonCompiles = () => {
    for (const job of compiles) {
      finishCompile(job);
    }
  };

  const warmNow = () => {
    loads += 1;
    abandonCompiles();
    warming = false;
    warmUp();
  };

  const warmSoon = async (): Promise<boolean> => {
    loads += 1;
    abandonCompiles();
    warming = true;
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const unstage = stageEverything();
    const compiling = pipeline.compile(world.scene, chase.camera);
    unstage();
    const job: Compile = {
      compiling,
      done: resolve,
      load: loads,
      timer: undefined,
    };
    job.timer = setTimeout(() => {
      finishCompile(job);
    }, COMPILE_TIMEOUT_MS);
    compiles.add(job);
    void compiling.ready.then(() => {
      finishCompile(job);
    });
    return await promise;
  };

  const build = (setup: RaceSetup, forRace: boolean): (() => void) => {
    const releaseActors = retire();
    const previous = world;
    takeTrack(setup.track);
    const replaced = world === previous ? null : previous;
    race = createRace(setup);
    if (forRace) {
      devRide?.place(race);
    }
    fleet = createFleet(assets, world.shading, race.cars);
    world.scene.add(fleet.group);
    previousCars = new Float64Array(race.cars.length);
    for (const [index, car] of race.cars.entries()) {
      previousCars[index] = car.s;
    }
    buildViews();
    chase.snap();
    return () => {
      releaseActors();
      replaced?.dispose();
    };
  };

  const begin = (nextPhase: GamePhase) => {
    phase = nextPhase;
    countdown = nextPhase === "countdown" ? COUNTDOWN_SECONDS : 0;
    settled = null;
    overLeft = 0;
    frozen = false;
    holdLeft = 0;
    lastStretchSaid = false;
    notice = "";
    noticeLeft = 0;
    speech = "";
    speechLeft = 0;
    tagRider = -1;
    clockReset = true;
  };

  const loadRace = (setup: RaceSetup, nextPhase: GamePhase) => {
    prepared = null;
    const release = build(setup, nextPhase === "countdown");
    begin(nextPhase);
    if (nextPhase === "attract") {
      void warmSoon();
    } else {
      warmNow();
    }
    release();
  };

  const loadAttract = (nextRoad: boolean) => {
    plan = null;
    log = null;
    recorder.leaveRace();
    seed += 1;
    if (nextRoad) {
      roadTurn += 1;
    }
    loadRace(defaultSetup(roadForTurn(roadTurn), seed), "attract");
  };

  const showStart = () => {
    draw(0, 0);
  };

  const prepare = async (next: RacePlan): Promise<void> => {
    if (prepared === next.setup) {
      await preparing;
      return;
    }
    plan = null;
    log = null;
    phase = "idle";
    quiet();
    const release = build(next.setup, true);
    prepared = next.setup;
    begin("idle");
    preparing = warmSoon().then((current) => {
      if (current) {
        showStart();
      }
    });
    release();
    report();
    await preparing;
  };

  const startRace = (next: RacePlan) => {
    sound.unlock();
    plan = next;
    log = createRaceLog(next.setup);
    recorder.enterRace();
    if (prepared === next.setup && phase === "idle") {
      prepared = null;
      if (warming) {
        warmNow();
      }
      begin("countdown");
    } else {
      loadRace(next.setup, "countdown");
    }
    recorder.race("start", race.tick);
  };

  const quiet = () => {
    sound.drive(0, 0, 0, false);
    if (tag) {
      tag.style.visibility = "hidden";
    }
  };

  const toggleMute = () => {
    muted = !muted;
    sound.setMuted(muted);
  };

  const halted = (): boolean => frozen || warming || phase === "idle";

  const live = (): boolean =>
    !frozen && (phase === "countdown" || phase === "racing");

  const controls = createControls((code) => {
    if (code === "KeyM") {
      toggleMute();
    }
    if (code === MARKER_KEY && live() && recorder.marker(race.tick)) {
      say("marked");
    }
    if (code === "KeyR" && plan?.mode === "quick" && live()) {
      startRace(plan);
    }
  });

  const strikeSound = (armed: boolean) => {
    if (armed) {
      sound.weaponHit();
    } else {
      sound.hit();
    }
  };

  const reactToHit = (attacker: number, target: number, armed: boolean) => {
    if (attacker === 0) {
      strikeSound(armed);
      const victim = race.riders[target];
      if (victim && victim.stamina <= 0) {
        say("knockdown");
      }
    } else if (target === 0) {
      strikeSound(armed);
      chase.jolt(armed ? 0.8 : 0.5);
    }
  };

  const speak = (rider: number, line: "knocksYouDown" | "youKnockThemDown") => {
    const rival = plan?.setup.field[rider - 1];
    if (rival === undefined) {
      return;
    }
    speech = rivalLines[rival][line];
    speechRider = rider;
    speechLeft = SPEECH_SECONDS;
  };

  const reactToOwn = (event: RaceEvent) => {
    if (event.kind === "crash") {
      recorder.race("crash", race.tick);
      chase.jolt(1);
      sound.crash();
      say("wipeout");
      if (event.cause !== "rider") {
        speak(event.by, "knocksYouDown");
      }
    } else if (event.kind === "knockedDown") {
      chase.jolt(0.7);
      sound.thump(0.8);
    } else if (event.kind === "nearMiss") {
      sound.whoosh();
    } else if (event.kind === "land") {
      chase.bump(-event.impact * BUMP_PER_IMPACT);
      if (event.airSeconds > 0.35) {
        chase.jolt(Math.min(0.8, Math.abs(event.impact) * 0.07));
        sound.thump(Math.abs(event.impact) / 10);
      }
    } else if (event.kind === "glance" || event.kind === "bump") {
      chase.jolt(0.45);
      sound.thump(0.5);
    } else if (event.kind === "hazard") {
      chase.jolt(HAZARD_JOLT[event.effect]);
      sound.thump(HAZARD_JOLT[event.effect]);
    } else if (event.kind === "attack") {
      sound.swing();
    } else if (event.kind === "riderContact") {
      chase.jolt(0.3);
      sound.thump(0.35);
    } else if (event.kind === "weaponTaken") {
      say("armed", weapons[event.weapon].name);
    } else if (event.kind === "weaponBroken") {
      say("broken", weapons[event.weapon].name);
    } else if (event.kind === "busted") {
      chase.jolt(0.4);
    }
  };

  const reactToOthers = (event: RaceEvent) => {
    if (event.kind === "riderContact" && event.other === 0) {
      chase.jolt(0.3);
      sound.thump(0.35);
    } else if (event.kind === "weaponTaken" && event.target === 0) {
      say("disarmed");
    } else if (event.kind === "pursuit" && event.target === 0) {
      sound.siren();
      say("police");
    } else if (event.kind === "crash") {
      const fallen = race.riders[event.rider];
      if (
        event.cause === "combat" &&
        fallen &&
        Math.abs(fallen.s - player().s) < 30
      ) {
        sound.thump(0.6);
      }
      if (event.by === 0 && event.cause !== "rider") {
        speak(event.rider, "youKnockThemDown");
      }
    }
  };

  const touchHazard = (
    effect: HazardEffect,
    view: RiderView,
    speed: number,
    near: boolean
  ) => {
    if (effect === "jolt" || effect === "bump") {
      view.sagSpeed += POTHOLE_SAG_KICK;
    }
    if ((effect === "stagger" || effect === "bump") && near) {
      puffs?.burst(view.bike, HAZARD_PUFF, speed);
    }
  };

  const touchDown = (event: RaceEvent) => {
    const view = views[event.rider];
    const rider = race.riders[event.rider];
    if (!(view && rider)) {
      return;
    }
    const near = event.rider === 0 || withinReach(rider.s);
    if (event.kind === "land") {
      view.sagSpeed += Math.min(MOST_SAG_KICK, -event.impact * SAG_PER_IMPACT);
      if (near && event.airSeconds > PUFF_AIR_SECONDS) {
        puffs?.burst(view.bike, -event.impact * PUFF_PER_IMPACT, rider.speed);
      }
    } else if (
      event.kind === "crash" &&
      (event.cause === "landing" || event.cause === "hazard") &&
      near
    ) {
      puffs?.burst(view.bike, 1, rider.speed);
    } else if (event.kind === "hazard") {
      touchHazard(event.effect, view, rider.speed, near);
    }
  };

  const react = () => {
    for (const event of race.events) {
      if (event.kind === "hit") {
        reactToHit(event.rider, event.target, event.weapon !== "none");
      } else if (event.rider === 0) {
        reactToOwn(event);
      } else {
        reactToOthers(event);
      }
    }
  };

  const attractOver = (): boolean => player().finishTick >= 0 || out(player());

  const record = () => {
    if (!(plan && log) || settled) {
      return;
    }
    recordTick(log, race, plan.setup);
    if (!log.outcome) {
      return;
    }
    settled = log.outcome;
    phase = "settled";
    recorder.race("end", race.tick);
    overLeft = consequenceSeconds(settled);
    events.onSettle(plan, settled);
    if (overLeft <= 0) {
      events.onOver(plan, settled);
    }
  };

  const advanceClock = () => {
    if (
      phase === "racing" &&
      !lastStretchSaid &&
      track.length > LAST_STRETCH * 2 &&
      distanceLeft(track, player()) < LAST_STRETCH
    ) {
      lastStretchSaid = true;
      say("lastKm");
    }
    if (plan && settled && overLeft > 0) {
      overLeft -= TICK_SECONDS;
      if (overLeft <= 0) {
        events.onOver(plan, settled);
      }
    }
  };

  const captureAll = (into: "before" | "after") => {
    const { riders } = race;
    for (let index = 0; index < riders.length; index += 1) {
      const rider = riders[index];
      const view = views[index];
      if (rider && view) {
        capture(rider, view[into]);
      }
    }
  };

  const holdStill = () => {
    captureAll("after");
  };

  const readInputs = () => {
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      if (!input) {
        continue;
      }
      if (index === 0 && phase !== "attract" && !autopilot) {
        controls.read(TICK_SECONDS, input);
      } else {
        pilotInput(race, track, index, input);
      }
    }
    devRide?.steer(race, track, inputs[0]);
  };

  const tick = () => {
    captureAll("before");
    const { cars } = race;
    for (let index = 0; index < cars.length; index += 1) {
      previousCars[index] = cars[index]?.s ?? 0;
    }
    if (holdLeft > 0) {
      holdLeft -= TICK_SECONDS;
      holdStill();
      return;
    }
    if (phase === "countdown") {
      countdown -= TICK_SECONDS;
      if (countdown <= 0 && plan) {
        phase = "racing";
        recorder.race("green", race.tick);
        events.onStart(plan);
      }
      holdStill();
      return;
    }
    readInputs();
    if (phase === "attract" && attractOver()) {
      loadAttract(true);
      return;
    }
    stepRace(race, track, inputs);
    for (const event of race.events) {
      touchDown(event);
    }
    if (phase !== "attract") {
      react();
    }
    if (phase === "racing" && devRide?.holds(race) === true) {
      frozen = true;
    }
    record();
    advanceClock();
    holdStill();
  };

  const flinchSideOf = (rider: RiderState): number => {
    const hitter = race.riders[rider.lastHitBy];
    return hitter ? Math.sign(rider.x - hitter.x) || 1 : 1;
  };

  const placeFigure = (
    rider: RiderState,
    view: RiderView,
    seated: boolean,
    bodyS: number,
    bodyX: number,
    bodyAir: number,
    lean: number,
    subTick: number,
    seconds: number
  ) => {
    let pose: RiderPose = "seated";
    let reach = 0;
    let rise = 0;
    let time = clock;
    const { figure, bike } = view;
    if (seated) {
      if (rider.mode === "mounting" && rider.modeTicks < LIFT_TICKS) {
        pose = "lift";
      } else if (strikeFrame(rider, subTick, strike)) {
        ({ pose, reach, rise } = strike);
      }
      figure.root.position.copy(bike.position);
      figure.root.quaternion.copy(bike.quaternion);
      figure.root.translateY(figure.seat.y - view.sag);
      figure.root.translateZ(figure.seat.z);
      view.tumbleAngle = 0;
      view.pitch = 0;
      view.lift = figure.standHeight;
      view.yaw = 0;
    } else if (
      rider.mode === "thrown" ||
      rider.mode === "lying" ||
      rider.mode === "wrecked"
    ) {
      const resting = rider.bodySpeed < 0.5 && rider.bodyAir === 0;
      pose = resting ? "lying" : "tumble";
      if (resting) {
        view.pitch += (LYING_PITCH - view.pitch) * Math.min(1, seconds * 6);
        view.lift += (LYING_HEIGHT - view.lift) * Math.min(1, seconds * 6);
      } else {
        view.tumbleAngle -= (5 + rider.bodySpeed * 0.4) * seconds;
        view.pitch = view.tumbleAngle;
        view.lift = 0.5;
      }
      poseOnTrack(
        figure.root,
        track,
        bodyS,
        bodyX,
        bodyAir + view.lift,
        view.yaw,
        0,
        view.pitch
      );
    } else if (rider.mode === "busted") {
      pose = "surrender";
      view.pitch = 0;
      view.lift = figure.standHeight;
      poseOnTrack(figure.root, track, bodyS, bodyX, view.lift, view.yaw, 0, 0);
    } else {
      const pace =
        Math.hypot(rider.bodySpeed, rider.bodyLateralSpeed) / RUN_SPEED;
      const moving = pace > WALKING / RUN_SPEED;
      pose = moving ? "run" : "stand";
      time = view.stride;
      view.stride += pace * seconds;
      const rise = Math.min(1, rider.modeTicks / TICK_RATE / RISE_SECONDS);
      const eased = rise * rise * (3 - 2 * rise);
      view.pitch = LYING_PITCH * (1 - eased);
      const bob = moving
        ? Math.abs(Math.sin(view.stride * Math.PI * 2 * RUN_HZ)) * 0.05
        : 0;
      view.lift =
        LYING_HEIGHT + (figure.standHeight - LYING_HEIGHT) * eased + bob;
      if (moving) {
        view.yaw = Math.atan2(rider.bodyLateralSpeed, rider.bodySpeed);
      } else if (rise >= 0.5 && rise < 1) {
        view.yaw = Math.atan2(rider.x - rider.bodyX, rider.s - rider.bodyS);
      }
      poseOnTrack(
        figure.root,
        track,
        bodyS,
        bodyX,
        view.lift,
        view.yaw,
        0,
        view.pitch
      );
    }
    stance.pose = pose;
    stance.time = time;
    stance.side = rider.attackSide;
    stance.weapon = rider.weapon;
    stance.tuck = seated ? rider.tuck : 0;
    stance.lean = seated ? lean / rider.bike.visualLean : 0;
    stance.reach = reach;
    stance.rise = rise;
    stance.flinch = seated ? flinchOf(rider, subTick) : 0;
    stance.flinchSide = flinchSideOf(rider);
  };

  const withinReach = (s: number): boolean =>
    s >= subject.s - riderReach.behind && s <= subject.s + riderReach.ahead;

  const settleSag = (view: RiderView, seconds: number) => {
    for (let left = seconds; left > 0; left -= SAG_STEP) {
      const step = Math.min(SAG_STEP, left);
      view.sagSpeed -=
        (SAG_STIFFNESS * view.sag + SAG_DAMPING * view.sagSpeed) * step;
      view.sag = clamp(
        view.sag + view.sagSpeed * step,
        -MOST_SAG / 2,
        MOST_SAG
      );
    }
  };

  const drawRider = (
    index: number,
    rider: RiderState,
    view: RiderView,
    blend: number,
    seconds: number
  ) => {
    const { before, after, bike } = view;
    const s = mix(before.s, after.s, blend);
    const x = mix(before.x, after.x, blend);
    const air = mix(before.air, after.air, blend);
    const lean = mix(before.lean, after.lean, blend);
    const heading = mix(before.heading, after.heading, blend);
    const bodyS = mix(before.bodyS, after.bodyS, blend);
    const bodyX = mix(before.bodyX, after.bodyX, blend);
    const bodyAir = mix(before.bodyAir, after.bodyAir, blend);
    const seated = rider.mode === "riding" || rider.mode === "mounting";
    const pitch = rider.airborne
      ? Math.atan2(rider.verticalSpeed, Math.max(rider.speed, 1)) * 0.6
      : Math.atan(supportAt(track, s, x, deck).slope);

    poseOnTrack(bike, track, s, x, air, heading, lean, pitch);
    bikes?.spin(index, rider.speed * seconds);
    settleSag(view, seconds);
    bikes?.sag(index, view.sag);
    if (index === 0 || withinReach(s)) {
      bikes?.show(index);
    }
    placeFigure(
      rider,
      view,
      seated,
      bodyS,
      bodyX,
      bodyAir,
      lean,
      blend,
      seconds
    );
    if (index === 0 || withinReach(seated ? s : bodyS)) {
      view.figure.animate(stance, seconds);
    } else {
      view.figure.rest();
    }
    placed.air = air;
    placed.bodyAir = bodyAir;
    placed.bodyS = bodyS;
    placed.bodyX = bodyX;
    placed.lean = lean;
    placed.s = s;
    placed.seated = seated;
    placed.x = x;
  };

  const placeTag = () => {
    if (!tag) {
      return;
    }
    const view = views[tagRider];
    if (!view || phase === "attract" || phase === "idle") {
      tag.style.visibility = "hidden";
      return;
    }
    tagPoint.copy(view.bike.position);
    tagPoint.y += TAG_HEIGHT;
    tagPoint.project(chase.camera);
    if (tagPoint.z > 1) {
      tag.style.visibility = "hidden";
      return;
    }
    const across = clamp(tagPoint.x, -TAG_MARGIN, TAG_MARGIN) * 0.5 + 0.5;
    const down = 0.5 - clamp(tagPoint.y, -TAG_MARGIN, TAG_MARGIN) * 0.5;
    tag.style.visibility = "visible";
    tag.style.transform = `translate3d(${(across * canvas.clientWidth).toFixed(1)}px, ${(down * canvas.clientHeight).toFixed(1)}px, 0) translate(-50%, -100%)`;
  };

  const followPlayer = (rider: RiderState) => {
    const onBike = placed.seated || placed.s < placed.bodyS;
    subject.s = onBike ? placed.s : placed.bodyS;
    subject.x = onBike ? placed.x : placed.bodyX;
    subject.air = onBike ? placed.air : Math.min(placed.bodyAir, 2);
    subject.speed = placed.seated ? rider.speed : 0;
    subject.tuck = placed.seated ? rider.tuck : 0;
  };

  const placeFleet = (blend: number) => {
    const { cars } = race;
    for (let index = 0; index < cars.length; index += 1) {
      const s = cars[index]?.s ?? 0;
      const from = previousCars[index] ?? s;
      const wrapped = Math.abs(s - from) > WRAP_JUMP;
      fleet.place(track, index, wrapped ? s : mix(from, s, blend));
    }
    fleet.commit(subject.s);
  };

  const draw = (blend: number, seconds: number) => {
    if (warming) {
      return;
    }
    clock += seconds;
    let index = -1;
    for (const rider of race.riders) {
      index += 1;
      const view = views[index];
      if (!view) {
        continue;
      }
      drawRider(index, rider, view, blend, seconds);
      if (index === 0) {
        followPlayer(rider);
      }
    }
    const [lead] = views;
    if (bikes && lead) {
      bikes.commit(lead.bike.position);
    }
    puffs?.update(seconds);
    profiler?.lap("riders");

    placeFleet(blend);
    profiler?.lap("fleet");

    chase.update(track, subject, seconds);
    profiler?.lap("camera");
    world.showHazards(race.hazards, subject.s);
    world.follow(chase.camera, subject.s);
    profiler?.lap("world");
    present();
    placeTag();
  };

  const applySize = (source: ResizeSource) => {
    appliedWidth = canvas.clientWidth;
    appliedHeight = canvas.clientHeight;
    appliedRatio = pixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    pipeline.resize(canvas.clientWidth, canvas.clientHeight, pixelRatio);
    sizeEpoch += 1;
    excuseFrames = EXCUSED_FRAMES;
    recorder.canvas(
      source,
      sizeEpoch,
      canvas.clientWidth,
      canvas.clientHeight,
      canvas.width,
      canvas.height
    );
  };

  const noteQuality = (into: QualityState) => {
    const chosen = ladder[rung] ?? ladder[0];
    into.rung = rung;
    into.pixelRatio = pixelRatio;
    into.bloomScale = chosen?.bloomScale ?? 0;
    into.shadowMap = chosen?.shadowMap ?? 0;
    into.samples = chosen?.samples ?? 0;
    into.pace = pace;
    into.frameRate = governor.rate;
  };

  const changeQuality = (reason: GovernReason, change: () => void) => {
    noteQuality(qualityBefore);
    const lateCredit = governor.lateCredit();
    const calmMs = governor.calmSeconds() * 1000;
    change();
    noteQuality(qualityAfter);
    recorder.governor(reason, qualityBefore, qualityAfter, lateCredit, calmMs);
    sample.changeFrom = qualityBefore.rung;
    sample.changeTo = qualityAfter.rung;
    sample.changeReason = governReasons.indexOf(reason);
    sample.changeAt = performance.now();
  };

  const applyRung = (source: ResizeSource) => {
    const chosen = ladder[rung] ?? ladder[0];
    if (!chosen) {
      return;
    }
    world.setShadowMap(chosen.shadowMap);
    pipeline.setBloomScale(chosen.bloomScale);
    pipeline.setSamples(chosen.samples);
    excuseFrames = EXCUSED_FRAMES;
    const next = pinnedPixelRatio > 0 ? pinnedPixelRatio : chosen.pixelRatio;
    const resized = next !== pixelRatio;
    pixelRatio = next;
    if (resized) {
      applySize(source);
    }
  };

  const noteRefresh = (now: number) => {
    if (pinnedRefresh <= 0) {
      display.refresh = readRefresh(now);
    }
  };

  const skipsVsync = (now: number): boolean =>
    pinnedPixelRatio <= 0 && !pacer.due(now, display.refresh, pace);

  const commitVerdict = (verdict: Verdict) => {
    changeQuality(verdict.reason, () => {
      governor.commit(verdict);
      ({ pace } = governor);
      if (governor.rung !== rung) {
        ({ rung } = governor);
        applyRung("rung");
      }
    });
  };

  let renderedLast = false;
  let pendingQuality: (() => void) | null = null;
  let pendingRate: FrameRate | null = null;

  const govern = (seconds: number, busyMs: number) => {
    if (pinnedPixelRatio > 0 || pinnedRung >= 0) {
      return;
    }
    const excused = excuseFrames > 0;
    if (excused && renderedLast) {
      excuseFrames -= 1;
    }
    if (pendingQuality) {
      return;
    }
    const ceiling = nativePixelRatio();
    if (ceiling !== ladder[0]?.pixelRatio) {
      pendingQuality = () => {
        changeQuality("native-dpr", () => {
          ladder = ladderFor(ceiling);
          governor.resize(ladder.length);
          ({ rung } = governor);
          applyRung("ladder");
        });
      };
      return;
    }
    const verdict = governor.judge({
      busyMs,
      excused,
      refresh: display.refresh,
      seconds,
    });
    if (verdict) {
      pendingQuality = () => {
        commitVerdict(verdict);
      };
    }
  };

  const nearestRacer = (me: RiderState): number => {
    let best = -1;
    let bestGap = TAG_RANGE;
    const { riders } = race;
    for (let index = 1; index < riders.length; index += 1) {
      const other = riders[index];
      if (!other || other.profile.role !== "racer" || out(other)) {
        continue;
      }
      const gap = Math.abs(other.s - me.s) + Math.abs(other.x - me.x);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    }
    return best;
  };

  const report = () => {
    const me = player();
    const order = standings(race);
    tagRider = speechLeft > 0 ? speechRider : nearestRacer(me);
    const rival = tagRider >= 0 ? race.riders[tagRider] : undefined;
    events.onHud({
      bikeName: me.bike.name,
      condition: me.condition / FULL_CONDITION,
      copDistance: chaserDistance(race, 0),
      countdown: Math.max(0, Math.ceil(holdLeft > 0 ? holdLeft : countdown)),
      distanceLeft: distanceLeft(track, me),
      gear: me.gear,
      muted,
      notice: noticeLeft > 0 ? notice : "",
      noticeDetail,
      offBike: me.mode !== "riding",
      phase,
      position: settled?.place ?? order.indexOf(0) + 1,
      progress: clamp(me.bodyS / track.length, 0, 1),
      riderCount: order.length,
      rivalColour: plates[tagRider] ?? "",
      rivalName: rival?.profile.name ?? "",
      rivalStamina: rival ? rival.stamina / MAX_STAMINA : 0,
      roadLength: track.length,
      roadName: track.plan.name,
      speech: speechLeft > 0 ? speech : "",
      speedKmh: me.speed * 3.6,
      stamina: me.stamina / MAX_STAMINA,
      weaponCapacity: weaponCapacity(me),
      weaponHits: me.weaponHits,
      weaponName: weaponName(me),
    });
  };

  const present = () => {
    rendering = true;
    pipeline.render(world.scene, chase.camera);
    rendering = false;
    drawnEpoch = sizeEpoch;
    drawnFrame = frameId;
    drawnRung = rung;
  };

  const checkPresented = () => {
    if (rendering) {
      rendering = false;
      recorder.incompletePass(drawnFrame + 1);
    }
    if (drawnFrame >= 0 && drawnEpoch !== sizeEpoch) {
      recorder.invalidated(drawnFrame, drawnEpoch, sizeEpoch, drawnRung, rung);
      drawnEpoch = sizeEpoch;
    }
  };

  const resize = () => {
    if (
      canvas.clientWidth === appliedWidth &&
      canvas.clientHeight === appliedHeight &&
      pixelRatio === appliedRatio
    ) {
      return;
    }
    applySize("observer");
    chase.resize(canvas.clientWidth, canvas.clientHeight);
    if (halted() && !warming) {
      world.follow(chase.camera, subject.s);
      present();
    }
  };

  const ensureProfiler = () => {
    profiler ??= createProfiler(renderer, profileMode === "gpu");
    rendererLabel = profiler.reader.info().renderer;
  };

  const applyRateSetting = (next: FrameRate) => {
    changeQuality("rate-setting", () => {
      governor.setRate(next);
      ({ pace } = governor);
      if (governor.rung !== rung) {
        ({ rung } = governor);
        applyRung("rung");
      }
    });
  };

  const applyFrameRate = (next: FrameRate) => {
    pendingRate = next === governor.rate ? null : next;
  };

  const applyPending = () => {
    const quality = pendingQuality;
    const rate = pendingRate;
    pendingQuality = null;
    pendingRate = null;
    quality?.();
    if (rate) {
      applyRateSetting(rate);
    }
  };

  const applySettings = () => {
    const settings = hub.settings.read();
    applyFrameRate(settings.frameRate);
    const wantsMeter = meterFlag || settings.overlay;
    if (wantsMeter && !meter) {
      meter = createFrameMeter(canvas, hub.view().session);
    } else if (!wantsMeter && meter) {
      meter.dispose();
      meter = null;
    }
    if (settings.recording) {
      ensureProfiler();
    }
    const showing = meter !== null;
    if (!settings.recording) {
      overlayNoted = null;
    } else if (overlayNoted !== showing) {
      recorder.overlay(showing);
      overlayNoted = showing;
    }
  };

  const unwatchCanvas = hub.watchCanvas(canvas);
  const unsubscribeSettings = hub.settings.subscribe(applySettings);
  applySettings();
  const detachProbe = hub.attachGame({
    frameAt: (index) => profiler?.reader.frameAt(index) ?? null,
    latestFrame: () => frameId - 1,
    get renderer() {
      return rendererLabel;
    },
    snapshot() {
      noteQuality(qualityAfter);
      return {
        phase,
        quality: { ...qualityAfter },
        race: recorder.raceId(),
        tick: race.tick,
      };
    },
  });
  const startRung =
    pinnedRung >= 0 ? pinnedRung : startRungFor(rendererOf(renderer));
  if (startRung > 0) {
    changeQuality("device-start", () => {
      governor.startAt(startRung);
      ({ rung } = governor);
      applyRung("rung");
    });
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("webglcontextlost", abandonCompiles);
  const forgetHiddenTime = () => {
    governor.interrupt();
    excuseFrames = EXCUSED_FRAMES;
  };
  document.addEventListener("visibilitychange", forgetHiddenTime);
  resize();
  buildViews();
  warmUp();

  const advance = (seconds: number): number => {
    if (clockReset) {
      accumulator = 0;
      clockReset = false;
    }
    accumulator += seconds;
    let ticks = 0;
    while (accumulator >= TICK_SECONDS && !halted()) {
      tick();
      ticks += 1;
      accumulator -= TICK_SECONDS;
      if (clockReset) {
        break;
      }
    }
    return ticks;
  };

  let last = performance.now();
  devRide?.whenReleased(() => {
    frozen = false;
    clockReset = true;
    last = performance.now();
  });
  let lastCallback = Number.NaN;
  const noteCallback = (now: number) => {
    noteRefresh(now);
    const callbackMs = now - lastCallback;
    lastCallback = now;
    if (callbackMs >= 0 && !halted()) {
      govern(clamp(callbackMs / 1000, 0, MAX_FRAME_SECONDS), lastBusyMs);
    }
    renderedLast = false;
  };
  renderer.setAnimationLoop((now) => {
    checkPresented();
    noteCallback(now);
    if (skipsVsync(now)) {
      return;
    }
    const entered = performance.now();
    const interval = now - last;
    const seconds = clamp(interval / 1000, 0, MAX_FRAME_SECONDS);
    last = now;
    if (halted()) {
      return;
    }
    recorder.beginFrame(frameId);
    profiler?.start(frameId);
    const ticks = advance(seconds);
    profiler?.lap("sim");
    const me = player();
    const riding = me.mode === "riding" && phase !== "attract";
    const [own] = inputs;
    if (riding && me.gear > lastGear) {
      sound.shift();
    }
    lastGear = me.gear;
    sound.drive(
      riding ? me.speed : 0,
      riding && phase === "racing" && holdLeft <= 0 ? (own?.throttle ?? 0) : 0,
      riding ? me.revs : 0,
      riding && me.offRoad
    );
    renderer.info.reset();
    applyPending();
    profiler?.lap("other");
    draw(clamp(accumulator / TICK_SECONDS, 0, 1), seconds);
    renderedLast = true;
    const discarded = Math.max(0, interval - MAX_FRAME_SECONDS * 1000);
    if (meter) {
      sample.calls = renderer.info.render.calls;
      sample.discardedMs = discarded;
      sample.intervalMs = interval;
      sample.pace = pace;
      sample.pixelRatio = pixelRatio;
      sample.recording = recorder.recording;
      sample.refresh = display.refresh;
      sample.rung = rung;
      sample.rungs = ladder.length;
      sample.triangles = renderer.info.render.triangles;
      meter.frame(sample);
    }
    noticeLeft -= seconds;
    speechLeft -= seconds;
    hudClock += seconds;
    if (hudClock >= HUD_INTERVAL) {
      hudClock = 0;
      report();
    }
    if (profiler) {
      frameEnd.discarded = discarded;
      frameEnd.drawRung = drawnRung;
      frameEnd.drawnEpoch = drawnEpoch;
      frameEnd.interval = interval;
      frameEnd.pixelRatio = pixelRatio;
      frameEnd.race = recorder.raceId();
      frameEnd.rung = rung;
      frameEnd.sizeEpoch = sizeEpoch;
      frameEnd.tick = race.tick;
      frameEnd.ticks = ticks;
      profiler.finish(frameEnd);
    }
    recorder.frame(frameId, interval, discarded);
    frameId += 1;
    lastBusyMs = performance.now() - entered;
  });

  return {
    attract() {
      if (phase !== "attract") {
        loadAttract(false);
        report();
      }
    },
    dispose() {
      alive = false;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", abandonCompiles);
      document.removeEventListener("visibilitychange", forgetHiddenTime);
      unsubscribeSettings();
      unwatchCanvas();
      detachProbe();
      meter?.dispose();
      profiler?.dispose();
      controls.dispose();
      sound.dispose();
      abandonCompiles();
      dropViews();
      dropFleet();
      world.dispose();
      pipeline.dispose();
      renderer.dispose();
    },
    followRival(element) {
      tag = element;
    },
    pause() {
      if (frozen || phase !== "racing") {
        return false;
      }
      frozen = true;
      quiet();
      return true;
    },
    prepare,
    quit() {
      if (plan && !settled) {
        recorder.race("quit", race.tick);
      }
      const outcome = plan && log ? outcomeOf(race, plan.setup, log) : null;
      plan = null;
      log = null;
      frozen = false;
      phase = "idle";
      quiet();
      report();
      return outcome;
    },
    resume() {
      if (!frozen) {
        return;
      }
      frozen = false;
      holdLeft = RESUME_SECONDS;
      clockReset = true;
      last = performance.now();
    },
    sleep() {
      if (phase === "idle") {
        return;
      }
      plan = null;
      log = null;
      frozen = false;
      phase = "idle";
      quiet();
      report();
    },
    startRace,
    toggleMute() {
      toggleMute();
      report();
    },
  };
}
