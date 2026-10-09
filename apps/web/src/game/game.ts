import { pilotInput } from "@racer/sim/pilot";
import { createRace, stepRace } from "@racer/sim/race";
import { TICK_RATE, TICK_SECONDS } from "@racer/sim/state";
import type { RaceState, RiderInput, RiderState } from "@racer/sim/state";
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
import type { Fleet } from "./actors.ts";
import { createSound } from "./audio.ts";
import { createChaseCamera } from "./chase-camera.ts";
import type { Subject } from "./chase-camera.ts";
import type { GameHandle, GamePhase, HudState, Notice } from "./hud.ts";
import { createControls } from "./input.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderPose } from "./rider-figure.ts";
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

function capture(rider: RiderState, pose: Pose): void {
  pose.s = rider.s;
  pose.x = rider.x;
  pose.heading = rider.heading;
  pose.lean = rider.lean;
  pose.air = rider.air;
  pose.bodyS = rider.bodyS;
  pose.bodyX = rider.bodyX;
  pose.bodyAir = rider.bodyAir;
}

function emptyPose(): Pose {
  return {
    air: 0,
    bodyAir: 0,
    bodyS: 0,
    bodyX: 0,
    heading: 0,
    lean: 0,
    s: 0,
    x: 0,
  };
}

function mix(from: number, to: number, blend: number): number {
  return from + (to - from) * blend;
}

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
  const bike = createBike();
  const figure = createRiderFigure();
  world.scene.add(bike.root, figure.root, bike.shadow);
  const sound = createSound();

  let seed = 1;
  let race: RaceState = createRace(track, seed);
  let fleet: Fleet = createFleet(race.cars);
  world.scene.add(fleet.group);
  let previousCars = new Float64Array(race.cars.length);

  let phase: GamePhase = "attract";
  let countdown = 0;
  let raceTicks = 0;
  let topSpeed = 0;
  let notice: Notice = "";
  let noticeDetail = "";
  let noticeLeft = 0;
  let muted = false;
  let accumulator = 0;
  let hudClock = 0;
  let slowFrames = 0;
  let calmSeconds = 0;
  let raisesLeft = 2;
  let tumbleAngle = 0;
  let clock = 0;
  let figurePitch = 0;
  let figureLift = 0;
  let figureYaw = 0;

  const input: RiderInput = { brake: 0, steer: 0, throttle: 0 };
  const before = emptyPose();
  const after = emptyPose();
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

  const loadRace = (nextPhase: GamePhase) => {
    world.scene.remove(fleet.group);
    seed += 1;
    race = createRace(track, seed);
    fleet = createFleet(race.cars);
    world.scene.add(fleet.group);
    previousCars = new Float64Array(race.cars.length);
    for (const [index, car] of race.cars.entries()) {
      previousCars[index] = car.s;
    }
    capture(player(), before);
    capture(player(), after);
    phase = nextPhase;
    countdown = nextPhase === "countdown" ? COUNTDOWN_SECONDS : 0;
    raceTicks = 0;
    topSpeed = 0;
    notice = "";
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

  const react = () => {
    for (const event of race.events) {
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
      } else if (event.kind === "finish" && phase === "racing") {
        phase = "finished";
      }
    }
  };

  const tick = () => {
    const rider = player();
    capture(rider, before);
    for (const [index, car] of race.cars.entries()) {
      previousCars[index] = car.s;
    }
    if (phase === "countdown") {
      countdown -= TICK_SECONDS;
      if (countdown <= 0) {
        phase = "racing";
      }
      capture(rider, after);
      return;
    }
    if (phase === "attract") {
      pilotInput(race, track, 0, input);
      if (rider.finishTick >= 0) {
        loadRace("attract");
        return;
      }
    } else {
      controls.read(TICK_SECONDS, input);
    }
    stepRace(race, track, [input]);
    if (phase === "racing") {
      raceTicks += 1;
      topSpeed = Math.max(topSpeed, rider.speed);
    }
    if (phase !== "attract") {
      react();
    }
    capture(rider, after);
  };

  const placeFigure = (
    rider: RiderState,
    seated: boolean,
    bodyS: number,
    bodyX: number,
    bodyAir: number,
    seconds: number
  ) => {
    clock += seconds;
    let pose: RiderPose = "seated";
    if (seated) {
      pose =
        rider.mode === "mounting" && rider.modeTicks < LIFT_TICKS
          ? "lift"
          : "seated";
      figure.root.position.copy(bike.root.position);
      figure.root.quaternion.copy(bike.root.quaternion);
      figure.root.translateY(HIP_HEIGHT);
      figure.root.translateZ(HIP_SETBACK);
      tumbleAngle = 0;
      figurePitch = 0;
      figureLift = STANDING_HEIGHT;
      figureYaw = 0;
    } else if (rider.mode === "thrown") {
      const resting = rider.bodySpeed < 0.5 && rider.bodyAir === 0;
      pose = resting ? "lying" : "tumble";
      if (resting) {
        figurePitch += (LYING_PITCH - figurePitch) * Math.min(1, seconds * 6);
        figureLift += (LYING_HEIGHT - figureLift) * Math.min(1, seconds * 6);
      } else {
        tumbleAngle -= (5 + rider.bodySpeed * 0.4) * seconds;
        figurePitch = tumbleAngle;
        figureLift = 0.5;
      }
      poseOnTrack(
        figure.root,
        track,
        bodyS,
        bodyX,
        bodyAir + figureLift,
        figureYaw,
        0,
        figurePitch
      );
    } else {
      pose = "run";
      const rise = Math.min(1, rider.modeTicks / TICK_RATE / RISE_SECONDS);
      const eased = rise * rise * (3 - 2 * rise);
      figurePitch = LYING_PITCH * (1 - eased);
      const bob =
        rise >= 1 ? Math.abs(Math.sin(clock * Math.PI * 2 * 2.6)) * 0.05 : 0;
      figureLift =
        LYING_HEIGHT + (STANDING_HEIGHT - LYING_HEIGHT) * eased + bob;
      if (rise >= 0.5) {
        figureYaw = Math.atan2(rider.x - rider.bodyX, rider.s - rider.bodyS);
      }
      poseOnTrack(
        figure.root,
        track,
        bodyS,
        bodyX,
        figureLift,
        figureYaw,
        0,
        figurePitch
      );
    }
    figure.animate(pose, clock, seconds);
  };

  const draw = (blend: number, seconds: number) => {
    const rider = player();
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

    placeFigure(rider, seated, bodyS, bodyX, bodyAir, seconds);

    for (const [index, car] of race.cars.entries()) {
      const from = previousCars[index] ?? car.s;
      const wrapped = Math.abs(car.s - from) > WRAP_JUMP;
      fleet.place(track, index, wrapped ? car.s : mix(from, car.s, blend));
    }
    fleet.commit();

    subject.s = seated ? s : bodyS;
    subject.x = seated ? x : bodyX;
    subject.air = seated ? air : Math.min(bodyAir, 2);
    subject.speed = seated ? rider.speed : rider.bodySpeed;
    subject.lean = seated ? lean : 0;
    subject.rough = seated && rider.offRoad ? Math.min(1, rider.speed / 20) : 0;
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

  const report = () => {
    const rider = player();
    onHud({
      countdown: Math.ceil(countdown),
      crashes: rider.crashes,
      muted,
      notice: noticeLeft > 0 ? notice : "",
      noticeDetail,
      phase,
      progress: Math.min(1, Math.max(0, rider.bodyS / track.length)),
      seconds:
        (rider.finishTick >= 0 && phase === "finished"
          ? rider.finishTick
          : raceTicks) / TICK_RATE,
      speedKmh: rider.speed * 3.6,
      topSpeedKmh: topSpeed * 3.6,
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

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const seconds = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    accumulator += seconds;
    while (accumulator >= TICK_SECONDS) {
      tick();
      accumulator -= TICK_SECONDS;
    }
    const rider = player();
    const riding = rider.mode === "riding" && phase !== "attract";
    sound.drive(
      riding ? rider.speed : 0,
      riding && phase === "racing" ? input.throttle : 0,
      riding && rider.offRoad
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
      renderer.dispose();
    },
    startRace,
    toggleMute,
  };
}
