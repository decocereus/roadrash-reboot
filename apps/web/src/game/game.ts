import { rivalLines } from "@racer/career/lines";
import { createRaceLog, outcomeOf, recordTick } from "@racer/career/outcome";
import type { RaceLog, RaceOutcome } from "@racer/career/outcome";
import { pilotInput } from "@racer/sim/pilot";
import { chaserDistance } from "@racer/sim/police";
import {
  createRace,
  defaultSetup,
  distanceLeft,
  standings,
  stepRace,
} from "@racer/sim/race";
import {
  clamp,
  FULL_CONDITION,
  MAX_STAMINA,
  TICK_RATE,
  TICK_SECONDS,
} from "@racer/sim/state";
import type {
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import { strikeOf, weapons } from "@racer/sim/weapons";
import { roadIds, trackFor } from "@racer/track/roads";
import type { Track } from "@racer/track/track";
import * as THREE from "three";

import { bikeColour } from "../career/colours.ts";
import { createBike, createFleet, poseOnTrack } from "./actors.ts";
import type { BikeModel, Fleet } from "./actors.ts";
import { loadAssets } from "./assets.ts";
import { createSound } from "./audio.ts";
import { createChaseCamera } from "./chase-camera.ts";
import type { Subject } from "./chase-camera.ts";
import type {
  GameEvents,
  GameHandle,
  GamePhase,
  Notice,
  RacePlan,
} from "./hud.ts";
import { createControls } from "./input.ts";
import { createPipeline } from "./post.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, RiderPose } from "./rider-figure.ts";
import { createWorld } from "./world.ts";

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
const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 0.6;
const SLOW_FRAME_SECONDS = 0.0195;
const WRAP_JUMP = 30;
const LYING_PITCH = -Math.PI / 2;
const LYING_HEIGHT = 0.22;
const RISE_SECONDS = 0.45;
const LIFT_TICKS = 14;
const RUN_HZ = 2.6;
const BUSTED_SECONDS = 0.8;
const WRECKED_SECONDS = 1.2;
const ROAD_LEVEL = 1;

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
  readonly bike: BikeModel;
  readonly figure: RiderFigure;
  readonly before: Pose;
  readonly after: Pose;
  tumbleAngle: number;
  pitch: number;
  lift: number;
  yaw: number;
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

const attackPose = (rider: RiderState): RiderPose | undefined => {
  if (rider.attack === "none") {
    return undefined;
  }
  const strike = strikeOf(rider.attack, rider.weapon);
  if (rider.attackTicks <= strike.ticks * 0.2 && rider.attackCooldown === 0) {
    return undefined;
  }
  if (rider.attack === "swing") {
    return rider.attackTicks > strike.strikeTick ? "windup" : "swing";
  }
  return rider.attack;
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
  import.meta.env.DEV &&
  new URLSearchParams(globalThis.location.search).has("autopilot");

const firstRoad = import.meta.env.DEV
  ? Number(new URLSearchParams(globalThis.location.search).get("road") ?? 0)
  : 0;

const roadForTurn = (turn: number): Track =>
  trackFor(roadIds[turn % roadIds.length] ?? "ridge-road", ROAD_LEVEL);

export async function createGame(
  canvas: HTMLCanvasElement,
  events: GameEvents
): Promise<GameHandle> {
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
  let pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  const pipeline = createPipeline(renderer);

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
  let slowFrames = 0;
  let calmSeconds = 0;
  let raisesLeft = 2;
  let clock = 0;

  const subject: Subject = { air: 0, s: 0, x: 0 };
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
      world.scene.remove(view.bike.root, view.figure.root);
      view.bike.dispose();
      view.figure.dispose();
    }
    views = [];
  };

  const dropFleet = () => {
    world.scene.remove(fleet.group);
    fleet.dispose();
  };

  const buildViews = () => {
    dropViews();
    views = race.riders.map((rider, index) => {
      const bike = createBike(
        assets,
        world.shading,
        rider.profile.paint,
        rider.profile.role === "police"
      );
      const figure = createRiderFigure(
        assets,
        world.shading,
        rider.profile.jacket,
        index
      );
      world.scene.add(bike.root, figure.root);
      const view: RiderView = {
        after: emptyPose(),
        before: emptyPose(),
        bike,
        figure,
        lift: figure.standHeight,
        pitch: 0,
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

  const takeTrack = (next: Track) => {
    if (next === track) {
      return;
    }
    dropViews();
    world.dispose();
    track = next;
    world = createWorld(track);
    pipeline.setLook(world.shading.look);
  };

  const loadRace = (setup: RaceSetup, nextPhase: GamePhase) => {
    dropFleet();
    takeTrack(setup.track);
    race = createRace(setup);
    fleet = createFleet(assets, world.shading, race.cars);
    world.scene.add(fleet.group);
    previousCars = new Float64Array(race.cars.length);
    for (const [index, car] of race.cars.entries()) {
      previousCars[index] = car.s;
    }
    buildViews();
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
    chase.snap();
  };

  const loadAttract = (nextRoad: boolean) => {
    plan = null;
    log = null;
    seed += 1;
    if (nextRoad) {
      roadTurn += 1;
    }
    loadRace(defaultSetup(roadForTurn(roadTurn), seed), "attract");
  };

  const startRace = (next: RacePlan) => {
    sound.unlock();
    plan = next;
    log = createRaceLog(next.setup);
    loadRace(next.setup, "countdown");
  };

  const quiet = () => {
    sound.drive(0, 0, false);
    if (tag) {
      tag.style.visibility = "hidden";
    }
  };

  const toggleMute = () => {
    muted = !muted;
    sound.setMuted(muted);
  };

  const halted = (): boolean => frozen || phase === "idle";

  const live = (): boolean =>
    !frozen && (phase === "countdown" || phase === "racing");

  const controls = createControls((code) => {
    if (code === "KeyM") {
      toggleMute();
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
    } else if (event.kind === "land" && event.airSeconds > 0.35) {
      chase.jolt(Math.min(0.8, Math.abs(event.impact) * 0.07));
      sound.thump(Math.abs(event.impact) / 10);
    } else if (event.kind === "glance" || event.kind === "bump") {
      chase.jolt(0.45);
      sound.thump(0.5);
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

  const holdStill = () => {
    for (const [index, rider] of race.riders.entries()) {
      const view = views[index];
      if (view) {
        capture(rider, view.after);
      }
    }
  };

  const tick = () => {
    for (const [index, rider] of race.riders.entries()) {
      const view = views[index];
      if (view) {
        capture(rider, view.before);
      }
    }
    for (const [index, car] of race.cars.entries()) {
      previousCars[index] = car.s;
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
        events.onStart(plan);
      }
      holdStill();
      return;
    }
    for (const [index, input] of inputs.entries()) {
      if (index === 0 && phase !== "attract" && !autopilot) {
        controls.read(TICK_SECONDS, input);
      } else {
        pilotInput(race, track, index, input);
      }
    }
    if (phase === "attract" && attractOver()) {
      loadAttract(true);
      return;
    }
    stepRace(race, track, inputs);
    if (phase !== "attract") {
      react();
    }
    record();
    advanceClock();
    holdStill();
  };

  const placeFigure = (
    rider: RiderState,
    view: RiderView,
    seated: boolean,
    bodyS: number,
    bodyX: number,
    bodyAir: number,
    seconds: number
  ) => {
    let pose: RiderPose = "seated";
    const { figure, bike } = view;
    if (seated) {
      pose =
        rider.mode === "mounting" && rider.modeTicks < LIFT_TICKS
          ? "lift"
          : (attackPose(rider) ?? "seated");
      figure.root.position.copy(bike.root.position);
      figure.root.quaternion.copy(bike.root.quaternion);
      figure.root.translateY(figure.seat.y);
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
      pose = "run";
      const rise = Math.min(1, rider.modeTicks / TICK_RATE / RISE_SECONDS);
      const eased = rise * rise * (3 - 2 * rise);
      view.pitch = LYING_PITCH * (1 - eased);
      const bob =
        rise >= 1 ? Math.abs(Math.sin(clock * Math.PI * 2 * RUN_HZ)) * 0.05 : 0;
      view.lift =
        LYING_HEIGHT + (figure.standHeight - LYING_HEIGHT) * eased + bob;
      if (rise >= 0.5) {
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
    figure.animate(pose, clock, seconds, rider.attackSide, rider.weapon);
  };

  const drawRider = (
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
    const flightPitch = rider.airborne
      ? Math.atan2(rider.verticalSpeed, Math.max(rider.speed, 1)) * 0.6
      : 0;

    poseOnTrack(bike.root, track, s, x, air, heading, lean, flightPitch);
    bike.spin(rider.speed * seconds);
    placeFigure(rider, view, seated, bodyS, bodyX, bodyAir, seconds);
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
    tagPoint.copy(view.bike.root.position);
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

  const draw = (blend: number, seconds: number) => {
    clock += seconds;
    for (const [index, rider] of race.riders.entries()) {
      const view = views[index];
      if (!view) {
        continue;
      }
      drawRider(rider, view, blend, seconds);
      if (index === 0) {
        subject.s = placed.seated ? placed.s : placed.bodyS;
        subject.x = placed.seated ? placed.x : placed.bodyX;
        subject.air = placed.seated ? placed.air : Math.min(placed.bodyAir, 2);
      }
    }

    for (const [index, car] of race.cars.entries()) {
      const from = previousCars[index] ?? car.s;
      const wrapped = Math.abs(car.s - from) > WRAP_JUMP;
      fleet.place(track, index, wrapped ? car.s : mix(from, car.s, blend));
    }
    fleet.commit();

    chase.update(track, subject, seconds);
    world.follow(chase.camera, subject.s);
    pipeline.render(world.scene, chase.camera);
    placeTag();
  };

  const applySize = () => {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    pipeline.resize(canvas.clientWidth, canvas.clientHeight, pixelRatio);
  };

  const govern = (seconds: number) => {
    const ceiling = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    if (seconds > SLOW_FRAME_SECONDS) {
      slowFrames += 1;
      calmSeconds = 0;
    } else {
      calmSeconds += seconds;
      slowFrames = Math.max(0, slowFrames - 0.25);
    }
    if (slowFrames > 20 && pixelRatio > MIN_PIXEL_RATIO) {
      pixelRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio - 0.15);
      applySize();
      slowFrames = 0;
    } else if (calmSeconds > 20 && raisesLeft > 0 && pixelRatio < ceiling) {
      pixelRatio = Math.min(ceiling, pixelRatio + 0.15);
      applySize();
      raisesLeft -= 1;
      calmSeconds = 0;
    }
  };

  const nearestRacer = (me: RiderState): number => {
    let best = -1;
    let bestGap = TAG_RANGE;
    for (const [index, other] of race.riders.entries()) {
      if (index === 0 || other.profile.role !== "racer" || out(other)) {
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

  const resize = () => {
    applySize();
    chase.resize(canvas.clientWidth, canvas.clientHeight);
    if (halted()) {
      world.follow(chase.camera, subject.s);
      pipeline.render(world.scene, chase.camera);
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  buildViews();

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const seconds = clamp((now - last) / 1000, 0, MAX_FRAME_SECONDS);
    last = now;
    if (halted()) {
      return;
    }
    if (clockReset) {
      accumulator = 0;
      clockReset = false;
    }
    accumulator += seconds;
    while (accumulator >= TICK_SECONDS && !halted()) {
      tick();
      accumulator -= TICK_SECONDS;
      if (clockReset) {
        break;
      }
    }
    const me = player();
    const riding = me.mode === "riding" && phase !== "attract";
    const [own] = inputs;
    sound.drive(
      riding ? me.speed : 0,
      riding && phase === "racing" && holdLeft <= 0 ? (own?.throttle ?? 0) : 0,
      riding && me.offRoad
    );
    draw(clamp(accumulator / TICK_SECONDS, 0, 1), seconds);
    govern(seconds);
    noticeLeft -= seconds;
    speechLeft -= seconds;
    hudClock += seconds;
    if (hudClock >= HUD_INTERVAL) {
      hudClock = 0;
      report();
    }
  });

  return {
    attract() {
      if (phase !== "attract") {
        loadAttract(false);
        report();
      }
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      sound.dispose();
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
    quit() {
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
