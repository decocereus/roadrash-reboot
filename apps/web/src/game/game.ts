import { createRaceLog, outcomeOf, recordTick } from "@racer/career/outcome";
import type { RaceOutcome } from "@racer/career/outcome";
import { controlOf } from "@racer/sim/control";
import {
  defaultSetup,
  distanceLeft,
  emptyFrame,
  neutralInput,
  noHandovers,
} from "@racer/sim/race";
import type { RaceView } from "@racer/sim/race-view";
import { TICK_SECONDS } from "@racer/sim/state";
import type {
  Control,
  InputFrame,
  RiderId,
  RiderInput,
} from "@racer/sim/state";
import { presetIds } from "@racer/telemetry/limits";
import { roadIds } from "@racer/track/road";
import { trackFor } from "@racer/track/roads";
import type { Track } from "@racer/track/track";
import * as THREE from "three";

import { benchOf } from "../career/bench.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import type { AcquiredAssets } from "./assets.ts";
import { createSound } from "./audio.ts";
import { createBenchProfile } from "./bench-profile.ts";
import { createChaseCamera } from "./chase-camera.ts";
import { devRideFrom } from "./dev-ride.ts";
import { createWardrobe, undressed } from "./figure-wardrobe.ts";
import type { Dressing } from "./figure-wardrobe.ts";
import { wearingFrom, wearingNothing, wornBy } from "./figure-wear.ts";
import {
  bindSettings,
  createFrameLoop,
  installFrameLoop,
  lapOf,
} from "./frame-loop.ts";
import {
  attractAfter,
  attractOn,
  builtFrom,
  countDown,
  countdownFor,
  dressingFor,
  heldFrom,
  liveRaceOf,
  pausedFrom,
  preparationFor,
  raceOf,
  racingFrom,
  releasedFrom,
  resumedFrom,
  roomOf,
  settledFrom,
  spendConsequence,
  spendResumeHold,
  stoodDownFrom,
  throttleOpen,
  ticksHalted,
  unprepared,
} from "./game-session.ts";
import type { Attract, Countdown, InRace, Session } from "./game-session.ts";
import type { GameEvents, GameHandle, RacePlan } from "./hud.ts";
import { createControls } from "./input.ts";
import { createPipeline } from "./post.ts";
import { nativeClock } from "./preparation.ts";
import { bindQuality, createQuality } from "./presets.ts";
import { rendererOf } from "./profile.ts";
import { bindFeedback, createFeedback, out } from "./race-feedback.ts";
import { bindCast, createCast, pickFarRiders } from "./rider-views.ts";
import { bindStage, createStage } from "./scene-lifecycle.ts";

const LAST_STRETCH = 1000;
const MARKER_KEY = "KeyB";

const autopilot =
  (import.meta.env.DEV &&
    new URLSearchParams(globalThis.location.search).has("autopilot")) ||
  benchOf(globalThis.location.search) !== null;

const devRide = import.meta.env.DEV
  ? devRideFrom(globalThis.location.search)
  : undefined;

const wearing = import.meta.env.DEV
  ? wearingFrom(globalThis.location.search)
  : wearingNothing;

const firstRoad = import.meta.env.DEV
  ? Number(new URLSearchParams(globalThis.location.search).get("road") ?? 0)
  : 0;

const pinnedPixelRatio = Number(
  new URLSearchParams(globalThis.location.search).get("ratio") ?? 0
);

const pinnedPreset =
  presetIds.find(
    (id) => id === new URLSearchParams(globalThis.location.search).get("preset")
  ) ?? null;

const pinnedRefresh = Number(
  new URLSearchParams(globalThis.location.search).get("hz") ?? 0
);

const roadForTurn = (turn: number): Track =>
  trackFor(roadIds[turn % roadIds.length] ?? "ridge-road");

export { assetParsers } from "./assets.ts";

const notPrepared: PrepareOutcome = { kind: "cancelled" };

const errorOf = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const createRenderer = (
  canvas: HTMLCanvasElement
): THREE.WebGLRenderer => {
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
  return renderer;
};

const releaseAll = (owners: (() => void)[]): void => {
  for (const release of owners.splice(0).toReversed()) {
    release();
  }
};

const startGame = (
  canvas: HTMLCanvasElement,
  events: GameEvents,
  { assets, loadCelebrity }: AcquiredAssets,
  makeRenderer: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer,
  owners: (() => void)[]
): GameHandle => {
  const wardrobe = createWardrobe(loadCelebrity);
  owners.push(wardrobe.dispose);
  const firstAttract = attractOn(firstRoad);
  let session: Session = firstAttract;
  const renderer = makeRenderer(canvas);
  owners.push(() => {
    renderer.dispose();
  });
  const quality = createQuality(
    renderer,
    { pinnedPixelRatio, pinnedPreset, pinnedRefresh },
    () => window.devicePixelRatio,
    () => rendererOf(renderer)
  );
  const hub = diagnostics();
  const { recorder } = hub;
  const frame = createFrameLoop(renderer);
  owners.push(() => {
    frame.meter?.dispose();
    frame.profiler?.dispose();
  });
  const bench = createBenchProfile(
    benchOf(globalThis.location.search),
    recorder.raceId
  );
  owners.push(() => {
    bench?.dispose();
  });
  const lap = lapOf(frame);
  const pipeline = createPipeline(renderer, lap, quality.preset);
  owners.push(() => {
    pipeline.dispose();
  });

  const stage = createStage(
    assets,
    roadForTurn(firstAttract.roadTurn),
    firstAttract.seed,
    quality.preset.shadowMap
  );
  owners.push(() => {
    stage.world.dispose();
  });
  pipeline.setLook(stage.world.shading.look);
  stage.world.scene.add(stage.fleet.group);
  const chase = createChaseCamera();
  const sound = createSound();
  owners.push(() => {
    sound.dispose();
  });
  const cast = createCast(stage.world.shading);
  const feedback = createFeedback();

  const {
    buildViews,
    captureAll,
    drawRider,
    dropFleet,
    dropViews,
    fightsTick,
    followPlayer,
    holdStill,
    placeFleet,
    takeCorrections,
    touchDown,
  } = bindCast({ assets, cast, stage });
  owners.push(() => {
    dropViews();
    dropFleet();
  });
  const {
    build,
    cancelPreparation,
    loseContext,
    player,
    restoreContext,
    warmNow,
    warmSoon,
    warmUp,
  } = bindStage({
    assets,
    autopilot,
    buildViews,
    cast,
    chase,
    clock: nativeClock,
    devRide,
    pipeline,
    quality,
    stage,
  });
  owners.push(cancelPreparation);
  const { quiet, react, report, say, toggleMute } = bindFeedback({
    chase,
    events,
    feedback,
    player,
    recorder,
    session: () => session,
    sound,
    stage,
  });

  const clearNoticeAndClock = () => {
    feedback.notice = "";
    feedback.noticeLeft = 0;
    frame.clockReset = true;
  };

  const loadAttract = (current: Attract) => {
    recorder.leaveRace();
    const next = attractAfter(current);
    session = next;
    const release = build(
      defaultSetup(roadForTurn(next.roadTurn), next.seed),
      undressed,
      false
    );
    try {
      clearNoticeAndClock();
      void warmSoon();
    } finally {
      release();
      wardrobe.keep(undressed);
    }
  };

  const record = (view: RaceView) => {
    if (session.phase !== "countdown" && session.phase !== "racing") {
      return;
    }
    recordTick(session.log, view, session.plan.setup);
    const { outcome } = session.log;
    if (!outcome) {
      return;
    }
    const over = settledFrom(session, outcome);
    session = over;
    recorder.race("end", stage.race.view.tick);
    events.onSettle(over.plan, outcome);
    if (over.overLeft <= 0) {
      events.onOver(over.plan, outcome);
    }
  };

  const go = (next: RacePlan, dressing: Dressing) => {
    const log = createRaceLog(next.setup, stage.me);
    next.room?.listen(record);
    recorder.enterRace();
    session = countdownFor(next, log, dressing);
    clearNoticeAndClock();
    recorder.race("start", stage.race.view.tick);
  };

  const standDown = () => {
    roomOf(session)?.leave();
    session = stoodDownFrom(session);
    quiet();
    report();
  };

  const restart = ({ dressing, plan }: InRace) => {
    events.onRestart();
    const release = build(plan.setup, dressing, true, plan.room);
    try {
      warmNow();
      go(plan, dressing);
    } finally {
      release();
    }
  };

  const halted = (): boolean => ticksHalted(session) || stage.warming;

  const controls = createControls((code) => {
    if (code === "KeyM") {
      toggleMute();
    }
    const race = liveRaceOf(session);
    if (code === MARKER_KEY && race && recorder.marker(stage.race.view.tick)) {
      say("marked");
    }
    if (code === "KeyR" && race?.plan.mode === "quick" && !race.plan.room) {
      restart(race);
    }
  });
  owners.push(() => {
    controls.dispose();
  });

  const attractOver = (): boolean => player().finishTick >= 0 || out(player());

  const advanceClock = () => {
    if (
      session.phase === "racing" &&
      !session.lastStretchSaid &&
      stage.track.length > LAST_STRETCH * 2 &&
      distanceLeft(stage.track, player()) < LAST_STRETCH
    ) {
      session.lastStretchSaid = true;
      say("lastKm");
    }
    if (session.phase === "settled" && spendConsequence(session)) {
      events.onOver(session.plan, session.outcome);
    }
  };

  const playerInput: RiderInput = { ...neutralInput };
  const playerControls = new Map<RiderId, Control>();
  const playerFrame: InputFrame = {
    controls: playerControls,
    handovers: noHandovers,
  };

  const frameOf = (): InputFrame =>
    roomOf(session) || player().controller === "human"
      ? playerFrame
      : emptyFrame;

  const readInputs = () => {
    if (frameOf() === playerFrame) {
      controls.read(TICK_SECONDS, playerInput);
      devRide?.steer(stage.race.view, stage.track, playerInput);
      playerControls.clear();
      playerControls.set(stage.me, controlOf(playerInput));
    }
  };

  const countDownTick = (state: Countdown) => {
    if (countDown(state)) {
      session = racingFrom(state);
      recorder.race("green", stage.race.view.tick);
      events.onStart(state.plan);
    }
    holdStill();
  };

  const stepOnce = () => {
    stage.race.step(frameOf());
    bench?.record(stage.race.view);
    fightsTick();
    takeCorrections();
    const heard = stage.race.events();
    for (const event of heard) {
      touchDown(event);
    }
    if (session.phase !== "attract") {
      react(heard);
    }
  };

  const rememberCars = () => {
    const { cars, crossCars } = stage.race.view;
    for (let index = 0; index < cars.length; index += 1) {
      stage.previousCars[index] = cars[index]?.s ?? 0;
    }
    for (let index = 0; index < crossCars.length; index += 1) {
      stage.previousCrossCars[index] = crossCars[index]?.travel ?? 0;
    }
  };

  const tick = () => {
    captureAll("before");
    rememberCars();
    if (spendResumeHold(session)) {
      holdStill();
      return;
    }
    if (session.phase === "countdown") {
      countDownTick(session);
      return;
    }
    readInputs();
    if (session.phase === "attract" && attractOver()) {
      loadAttract(session);
      return;
    }
    const room = roomOf(session);
    const steps = room && autopilot ? 0 : (room?.stepsDue() ?? 1);
    for (let step = 0; step < steps; step += 1) {
      stepOnce();
    }
    if (
      session.phase === "racing" &&
      devRide?.holds(stage.race.view) === true
    ) {
      session = heldFrom(session);
    }
    if (!room) {
      record(stage.race.view);
    }
    advanceClock();
    holdStill();
  };

  const {
    applyFrameRate,
    checkPresented,
    noteDisplay,
    present,
    resize,
    skipsVsync,
    stateOf,
  } = bindQuality({
    canvas,
    chase,
    frame,
    halted,
    pipeline,
    quality,
    recorder,
    renderer,
    stage,
    subject: cast.subject,
  });

  const draw = (blend: number, seconds: number) => {
    if (stage.warming) {
      return;
    }
    roomOf(session)?.frameDrawn();
    cast.clock += seconds;
    let index = -1;
    for (const rider of stage.race.view.riders) {
      index += 1;
      const view = cast.views[index];
      if (!view) {
        continue;
      }
      drawRider(index, rider, view, blend, seconds);
      if (index === stage.me) {
        followPlayer(rider);
      }
    }
    const lead = cast.views[stage.me];
    if (cast.bikes && lead) {
      cast.bikes.commit(lead.bike.position);
    }
    cast.puffs?.update(seconds);
    frame.profiler?.lap("riders");

    placeFleet(blend);
    frame.profiler?.lap("fleet");

    chase.update(stage.track, cast.subject, seconds);
    if (quality.preset.farRiders) {
      pickFarRiders(cast.views, stage.me, chase.camera, canvas.clientHeight);
    }
    frame.profiler?.lap("camera");
    stage.world.showRoadLife(stage.race.view, cast.subject.s);
    stage.world.follow(chase.camera, cast.subject.s);
    frame.profiler?.lap("world");
    present();
  };

  const applySettings = bindSettings({
    applyFrameRate,
    canvas,
    frame,
    hub,
    recorder,
    renderer,
  });

  owners.push(hub.watchCanvas(canvas), hub.settings.subscribe(applySettings));
  applySettings();
  const detachProbe = hub.attachGame({
    frameAt: (index) => frame.profiler?.reader.frameAt(index) ?? null,
    latestFrame: () => frame.frameId - 1,
    get renderer() {
      return frame.rendererLabel;
    },
    snapshot() {
      return {
        phase: session.phase,
        quality: stateOf(),
        race: recorder.raceId(),
        tick: stage.race.view.tick,
      };
    },
  });
  owners.push(detachProbe);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("webglcontextlost", loseContext);
  canvas.addEventListener("webglcontextrestored", restoreContext);
  owners.push(() => {
    observer.disconnect();
    canvas.removeEventListener("webglcontextlost", loseContext);
    canvas.removeEventListener("webglcontextrestored", restoreContext);
  });
  resize();
  buildViews(undressed);
  warmUp();

  frame.last = performance.now();
  devRide?.whenReleased(() => {
    session = releasedFrom(session);
    frame.clockReset = true;
    frame.last = performance.now();
  });
  installFrameLoop({
    attracting: () => session.phase === "attract",
    checkPresented,
    draw,
    feedback,
    frame,
    halted,
    noteDisplay,
    player,
    quality,
    recorder,
    renderer,
    report,
    skipsVsync,
    sound,
    stage,
    throttleHeard: () => throttleOpen(session),
    tick,
  });
  owners.push(() => {
    renderer.setAnimationLoop(null);
  });

  const showStartWhenWarm = async (): Promise<PrepareOutcome> => {
    const outcome = await warmSoon();
    if (outcome.kind !== "cancelled" && outcome.kind !== "lost") {
      draw(0, 0);
    }
    return outcome;
  };

  const buildPrepared = async (next: RacePlan): Promise<PrepareOutcome> => {
    const { room, setup } = next;
    let dressing: Dressing | null;
    try {
      dressing = await wardrobe.dress(wornBy(wearing, setup));
    } catch (error) {
      if (preparationFor(session, setup)?.kind !== "dressing") {
        return notPrepared;
      }
      session = unprepared;
      return { cause: errorOf(error), kind: "failed", stage: "dress" };
    }
    const preparation = preparationFor(session, setup);
    if (dressing === null || preparation?.kind !== "dressing") {
      return notPrepared;
    }
    let release: () => void;
    try {
      release = build(setup, dressing, true, room);
    } catch (error) {
      session = unprepared;
      return { cause: errorOf(error), kind: "failed", stage: "build" };
    }
    session = builtFrom(preparation, dressing);
    clearNoticeAndClock();
    const warming = showStartWhenWarm();
    release();
    wardrobe.keep(dressing);
    report();
    return await warming;
  };

  const prepare = async (next: RacePlan): Promise<PrepareOutcome> => {
    const underway = preparationFor(session, next.setup);
    if (underway) {
      return await underway.preparing;
    }
    const { promise, resolve } = Promise.withResolvers<PrepareOutcome>();
    session = dressingFor(next.setup, promise);
    quiet();
    resolve(buildPrepared(next));
    const outcome = await promise;
    if (outcome.kind === "failed") {
      recorder.fault(
        "error",
        outcome.cause.message,
        `prepare ${outcome.stage}`
      );
    }
    return outcome;
  };

  const startWhenPrepared = async (next: RacePlan): Promise<void> => {
    const outcome = await prepare(next);
    const built = preparationFor(session, next.setup);
    if (outcome.kind !== "cancelled" && built?.kind === "built") {
      go(next, built.dressing);
    }
  };

  const startRace = (next: RacePlan) => {
    sound.unlock();
    const built = preparationFor(session, next.setup);
    const race = raceOf(session);
    if (built?.kind === "built") {
      if (stage.warming) {
        warmNow();
      }
      go(next, built.dressing);
    } else if (race?.plan === next) {
      restart(race);
    } else {
      void startWhenPrepared(next);
    }
  };

  const quitOutcome = (state: Session): RaceOutcome | null => {
    switch (state.phase) {
      case "attract":
      case "idle": {
        return null;
      }
      case "countdown":
      case "racing": {
        recorder.race("quit", stage.race.view.tick);
        return outcomeOf(
          state.plan.room?.confirmed ?? stage.race.view,
          state.plan.setup,
          state.log
        );
      }
      case "settled": {
        return state.outcome;
      }
      default: {
        return state satisfies never;
      }
    }
  };

  return {
    dispose() {
      releaseAll(owners);
    },
    pause() {
      const next = pausedFrom(session);
      if (next === session) {
        return false;
      }
      session = next;
      quiet();
      return true;
    },
    prepare,
    quit() {
      const outcome = quitOutcome(session);
      standDown();
      return outcome;
    },
    resume() {
      const next = resumedFrom(session);
      if (next === session) {
        return;
      }
      session = next;
      frame.clockReset = true;
      frame.last = performance.now();
    },
    riderFacts: () => ({
      crashes: player().crashes,
      roadMetres: player().s,
      seconds: stage.race.view.tick * TICK_SECONDS,
    }),
    sleep() {
      if (session.phase === "idle") {
        return;
      }
      standDown();
    },
    startRace,
    toggleMute() {
      toggleMute();
      report();
    },
  };
};

export const createGame = (
  canvas: HTMLCanvasElement,
  events: GameEvents,
  acquired: AcquiredAssets,
  makeRenderer = createRenderer
): GameHandle => {
  const owners = [acquired.release];
  try {
    return startGame(canvas, events, acquired, makeRenderer, owners);
  } catch (error) {
    releaseAll(owners);
    throw error;
  }
};
