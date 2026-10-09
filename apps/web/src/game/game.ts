import { nearestRival } from "@racer/sim/combat";
import { pilotInput } from "@racer/sim/pilot";
import { createRace, standings, stepRace } from "@racer/sim/race";
import { MAX_STAMINA, TICK_RATE, TICK_SECONDS } from "@racer/sim/state";
import type {
  RaceEvent,
  RaceState,
  RiderInput,
  RiderState,
} from "@racer/sim/state";
import { strikeOf, weapons } from "@racer/sim/weapons";
import { compileTrack } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import * as THREE from "three";

import {
  createBike,
  createFleet,
  HIP_HEIGHT,
  HIP_SETBACK,
  poseOnTrack,
} from "./actors.ts";
import type { BikeModel, Fleet } from "./actors.ts";
import { createSound } from "./audio.ts";
import { createChaseCamera } from "./chase-camera.ts";
import type { Subject } from "./chase-camera.ts";
import type {
  GameHandle,
  GamePhase,
  HudState,
  Notice,
  Placing,
} from "./hud.ts";
import { createControls } from "./input.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, RiderPose } from "./rider-figure.ts";
import { createWorld } from "./world.ts";

const COUNTDOWN_SECONDS = 3;
const HUD_INTERVAL = 1 / 15;
const NOTICE_SECONDS = 1.4;
const MAX_FRAME_SECONDS = 0.1;
const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 0.6;
const SLOW_FRAME_SECONDS = 0.0195;
const WRAP_JUMP = 30;
const LYING_PITCH = -Math.PI / 2;
const LYING_HEIGHT = 0.22;
const STANDING_HEIGHT = 0.98;
const RISE_SECONDS = 0.45;
const LIFT_TICKS = 14;
const RUN_HZ = 2.6;
const BUSTED_SECONDS = 2.2;
const COP_WARNING_RANGE = 80;

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
  if (rider.attackTicks <= strike.ticks * 0.2) {
    return undefined;
  }
  if (rider.attack === "swing") {
    return rider.attackTicks > strike.strikeTick ? "windup" : "swing";
  }
  return rider.attack;
};

const weaponName = (rider: RiderState): string =>
  rider.weapon === "none" ? "" : weapons[rider.weapon].name;

export function createGame(
  canvas: HTMLCanvasElement,
  onHud: (hud: HudState) => void
): GameHandle {
  const track = compileTrack(ridgeRoad);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);

  const world = createWorld(track);
  const chase = createChaseCamera();
  const sound = createSound();

  let seed = 1;
  let race: RaceState = createRace(track, seed);
  let fleet: Fleet = createFleet(race.cars);
  world.scene.add(fleet.group);
  let previousCars = new Float64Array(race.cars.length);
  let views: RiderView[] = [];
  let inputs: RiderInput[] = [];

  let phase: GamePhase = "attract";
  let countdown = 0;
  let raceTicks = 0;
  let topSpeed = 0;
  let notice: Notice = "";
  let noticeDetail = "";
  let noticeLeft = 0;
  let bustedLeft = 0;
  let fine = 0;
  let muted = false;
  let accumulator = 0;
  let hudClock = 0;
  let slowFrames = 0;
  let calmSeconds = 0;
  let raisesLeft = 2;
  let clock = 0;

  const subject: Subject = { air: 0, lean: 0, rough: 0, s: 0, speed: 0, x: 0 };

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
      world.scene.remove(view.bike.root, view.bike.shadow, view.figure.root);
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
    views = race.riders.map((rider) => {
      const bike = createBike(
        rider.profile.paint,
        rider.profile.role === "police"
      );
      const figure = createRiderFigure(rider.profile.paint);
      world.scene.add(bike.root, bike.shadow, figure.root);
      const view: RiderView = {
        after: emptyPose(),
        before: emptyPose(),
        bike,
        figure,
        lift: STANDING_HEIGHT,
        pitch: 0,
        tumbleAngle: 0,
        yaw: 0,
      };
      capture(rider, view.before);
      capture(rider, view.after);
      return view;
    });
    inputs = race.riders.map(() => freshInput());
  };

  const loadRace = (nextPhase: GamePhase) => {
    dropFleet();
    seed += 1;
    race = createRace(track, seed);
    fleet = createFleet(race.cars);
    world.scene.add(fleet.group);
    previousCars = new Float64Array(race.cars.length);
    for (const [index, car] of race.cars.entries()) {
      previousCars[index] = car.s;
    }
    buildViews();
    phase = nextPhase;
    countdown = nextPhase === "countdown" ? COUNTDOWN_SECONDS : 0;
    raceTicks = 0;
    topSpeed = 0;
    notice = "";
    bustedLeft = 0;
    fine = 0;
    accumulator = 0;
    chase.snap();
  };

  const startRace = () => {
    sound.unlock();
    loadRace("countdown");
  };

  const toggleMute = () => {
    muted = !muted;
    sound.setMuted(muted);
  };

  const controls = createControls((code) => {
    if (code === "KeyM") {
      toggleMute();
    }
    if (code === "KeyR" && phase !== "attract") {
      startRace();
    }
    if (code === "Enter" && (phase === "attract" || phase === "finished")) {
      startRace();
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
        say("knockdown", victim.profile.name);
      }
    } else if (target === 0) {
      strikeSound(armed);
      chase.jolt(armed ? 0.8 : 0.5);
      say("hit", race.riders[attacker]?.profile.name ?? "");
    }
  };

  const reactToOwn = (event: RaceEvent) => {
    if (event.kind === "crash") {
      chase.jolt(1);
      sound.crash();
      say("wipeout");
    } else if (event.kind === "nearMiss") {
      sound.whoosh();
      say("close");
    } else if (event.kind === "land" && event.airSeconds > 0.35) {
      chase.jolt(Math.min(0.8, Math.abs(event.impact) * 0.07));
      sound.thump(Math.abs(event.impact) / 10);
      say("air", `${event.airSeconds.toFixed(1)} s`);
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
      ({ fine } = event);
      bustedLeft = BUSTED_SECONDS;
      say("busted");
    } else if (event.kind === "finish" && phase === "racing") {
      phase = "finished";
    }
  };

  const reactToOthers = (event: RaceEvent) => {
    if (event.kind === "riderContact" && event.other === 0) {
      chase.jolt(0.3);
      sound.thump(0.35);
    } else if (event.kind === "weaponTaken" && event.target === 0) {
      say("disarmed", race.riders[event.rider]?.profile.name ?? "");
    } else if (event.kind === "pursuit" && event.target === 0) {
      sound.siren();
      say("police");
    } else if (event.kind === "crash" && event.cause === "combat") {
      const fallen = race.riders[event.rider];
      if (fallen && Math.abs(fallen.s - player().s) < 30) {
        sound.thump(0.6);
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

  const attractOver = (): boolean =>
    player().finishTick >= 0 || player().mode === "busted";

  const advanceClock = () => {
    const me = player();
    if (phase === "racing" && me.mode !== "busted") {
      raceTicks += 1;
      topSpeed = Math.max(topSpeed, me.speed);
    }
    if (bustedLeft > 0) {
      bustedLeft -= TICK_SECONDS;
      if (bustedLeft <= 0 && phase === "racing") {
        phase = "finished";
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
    if (phase === "countdown") {
      countdown -= TICK_SECONDS;
      if (countdown <= 0) {
        phase = "racing";
      }
      for (const [index, rider] of race.riders.entries()) {
        const view = views[index];
        if (view) {
          capture(rider, view.after);
        }
      }
      return;
    }
    for (const [index, input] of inputs.entries()) {
      if (index === 0 && phase !== "attract") {
        controls.read(TICK_SECONDS, input);
      } else {
        pilotInput(race, track, index, input);
      }
    }
    if (phase === "attract" && attractOver()) {
      loadRace("attract");
      return;
    }
    stepRace(race, track, inputs);
    advanceClock();
    if (phase !== "attract") {
      react();
    }
    for (const [index, rider] of race.riders.entries()) {
      const view = views[index];
      if (view) {
        capture(rider, view.after);
      }
    }
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
      figure.root.translateY(HIP_HEIGHT);
      figure.root.translateZ(HIP_SETBACK);
      view.tumbleAngle = 0;
      view.pitch = 0;
      view.lift = STANDING_HEIGHT;
      view.yaw = 0;
    } else if (rider.mode === "thrown") {
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
      view.lift = STANDING_HEIGHT;
      poseOnTrack(figure.root, track, bodyS, bodyX, view.lift, view.yaw, 0, 0);
    } else {
      pose = "run";
      const rise = Math.min(1, rider.modeTicks / TICK_RATE / RISE_SECONDS);
      const eased = rise * rise * (3 - 2 * rise);
      view.pitch = LYING_PITCH * (1 - eased);
      const bob =
        rise >= 1 ? Math.abs(Math.sin(clock * Math.PI * 2 * RUN_HZ)) * 0.05 : 0;
      view.lift = LYING_HEIGHT + (STANDING_HEIGHT - LYING_HEIGHT) * eased + bob;
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
    poseOnTrack(bike.shadow, track, s, x, 0.03, heading, 0, -Math.PI / 2);
    bike.spin(rider.speed * seconds);
    placeFigure(rider, view, seated, bodyS, bodyX, bodyAir, seconds);
    return { air, bodyAir, bodyS, bodyX, lean, s, seated, x };
  };

  const draw = (blend: number, seconds: number) => {
    clock += seconds;
    for (const [index, rider] of race.riders.entries()) {
      const view = views[index];
      if (!view) {
        continue;
      }
      const placed = drawRider(rider, view, blend, seconds);
      if (index === 0) {
        subject.s = placed.seated ? placed.s : placed.bodyS;
        subject.x = placed.seated ? placed.x : placed.bodyX;
        subject.air = placed.seated ? placed.air : Math.min(placed.bodyAir, 2);
        subject.speed = placed.seated ? rider.speed : rider.bodySpeed;
        subject.lean = placed.seated ? placed.lean : 0;
        subject.rough =
          placed.seated && rider.offRoad ? Math.min(1, rider.speed / 20) : 0;
      }
    }

    for (const [index, car] of race.cars.entries()) {
      const from = previousCars[index] ?? car.s;
      const wrapped = Math.abs(car.s - from) > WRAP_JUMP;
      fleet.place(track, index, wrapped ? car.s : mix(from, car.s, blend));
    }
    fleet.commit();

    chase.update(track, subject, seconds);
    world.follow(chase.camera);
    renderer.render(world.scene, chase.camera);
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
      renderer.setPixelRatio(pixelRatio);
      slowFrames = 0;
    } else if (calmSeconds > 20 && raisesLeft > 0 && pixelRatio < ceiling) {
      pixelRatio = Math.min(ceiling, pixelRatio + 0.15);
      renderer.setPixelRatio(pixelRatio);
      raisesLeft -= 1;
      calmSeconds = 0;
    }
  };

  const placings = (): Placing[] =>
    standings(race).map((index) => {
      const rider = race.riders[index];
      return {
        busted: rider?.mode === "busted",
        name: rider?.profile.name ?? "",
        seconds:
          rider && rider.finishTick >= 0 ? rider.finishTick / TICK_RATE : -1,
        you: index === 0,
      };
    });

  const copChasing = (): boolean =>
    race.riders.some(
      (rider) =>
        rider.profile.role === "police" &&
        rider.chase === 0 &&
        Math.abs(rider.s - player().bodyS) < COP_WARNING_RANGE
    );

  const report = () => {
    const me = player();
    const order = standings(race);
    const rivalIndex = Math.max(
      nearestRival(race, 0, -1),
      nearestRival(race, 0, 1)
    );
    const rival = rivalIndex >= 0 ? race.riders[rivalIndex] : undefined;
    onHud({
      busted: me.mode === "busted",
      copChasing: copChasing(),
      countdown: Math.ceil(countdown),
      crashes: me.crashes,
      fine,
      muted,
      notice: noticeLeft > 0 ? notice : "",
      noticeDetail,
      phase,
      placings: phase === "finished" ? placings() : [],
      position: order.indexOf(0) + 1,
      progress: Math.min(1, Math.max(0, me.bodyS / track.length)),
      riderCount: order.length,
      rivalName: rival?.profile.name ?? "",
      rivalStamina: rival ? rival.stamina / MAX_STAMINA : 0,
      seconds:
        (me.finishTick >= 0 && phase === "finished"
          ? me.finishTick
          : raceTicks) / TICK_RATE,
      speedKmh: me.speed * 3.6,
      stamina: me.stamina / MAX_STAMINA,
      topSpeedKmh: topSpeed * 3.6,
      weaponHits: me.weaponHits,
      weaponName: weaponName(me),
    });
  };

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    chase.resize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  buildViews();

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const seconds = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    accumulator += seconds;
    while (accumulator >= TICK_SECONDS) {
      tick();
      accumulator -= TICK_SECONDS;
    }
    const me = player();
    const riding = me.mode === "riding" && phase !== "attract";
    const [own] = inputs;
    sound.drive(
      riding ? me.speed : 0,
      riding && phase === "racing" ? (own?.throttle ?? 0) : 0,
      riding && me.offRoad
    );
    draw(accumulator / TICK_SECONDS, seconds);
    govern(seconds);
    noticeLeft -= seconds;
    hudClock += seconds;
    if (hudClock >= HUD_INTERVAL) {
      hudClock = 0;
      report();
    }
  });

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      sound.dispose();
      dropViews();
      dropFleet();
      world.dispose();
      renderer.dispose();
    },
    startRace,
    toggleMute,
  };
}
