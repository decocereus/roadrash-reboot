import { createRaceLog, outcomeOf, recordTick } from "@racer/career/outcome";
import type { RaceLog, RaceOutcome } from "@racer/career/outcome";
import { defaultSetup, distanceLeft } from "@racer/sim/race";
import { TICK_SECONDS } from "@racer/sim/state";
import type { RaceSetup } from "@racer/sim/state";
import { roadIds, trackFor } from "@racer/track/roads";
import type { Track } from "@racer/track/track";
import * as THREE from "three";

import { benchOf } from "../career/bench.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import type { AcquiredAssets } from "./assets.ts";
import { createSound } from "./audio.ts";
import { createChaseCamera } from "./chase-camera.ts";
import { devRideFrom } from "./dev-ride.ts";
import {
  bindSettings,
  createFrameLoop,
  installFrameLoop,
  lapOf,
} from "./frame-loop.ts";
import type { GameEvents, GameHandle, GamePhase, RacePlan } from "./hud.ts";
import { createControls } from "./input.ts";
import { createPipeline } from "./post.ts";
import { rendererOf } from "./profile.ts";
import { bindQuality, createQuality } from "./quality-ladder.ts";
import { bindFeedback, createFeedback, out } from "./race-feedback.ts";
import { bindCast, createCast } from "./rider-views.ts";
import { bindStage, createStage } from "./scene-lifecycle.ts";

const COUNTDOWN_SECONDS = 3;
const RESUME_SECONDS = 3;
const LAST_STRETCH = 1000;
const BUSTED_SECONDS = 0.8;
const WRECKED_SECONDS = 1.2;
const ROAD_LEVEL = 1;
const MARKER_KEY = "KeyB";

interface Session {
  roadTurn: number;
  seed: number;
  phase: GamePhase;
  plan: RacePlan | null;
  log: RaceLog | null;
  settled: RaceOutcome | null;
  overLeft: number;
  frozen: boolean;
  holdLeft: number;
  countdown: number;
  lastStretchSaid: boolean;
  prepared: RaceSetup | null;
  preparing: Promise<void>;
}

const consequenceSeconds = (outcome: RaceOutcome): number => {
  if (outcome.result === "busted") {
    return BUSTED_SECONDS;
  }
  return outcome.result === "wrecked" ? WRECKED_SECONDS : 0;
};

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

const roadForTurn = (turn: number): Track =>
  trackFor(roadIds[turn % roadIds.length] ?? "ridge-road", ROAD_LEVEL);

export { assetParsers } from "./assets.ts";

export const createGame = (
  canvas: HTMLCanvasElement,
  events: GameEvents,
  acquired: AcquiredAssets
): GameHandle => {
  const { assets } = acquired;
  const session: Session = {
    countdown: 0,
    frozen: false,
    holdLeft: 0,
    lastStretchSaid: false,
    log: null,
    overLeft: 0,
    phase: "attract",
    plan: null,
    prepared: null,
    preparing: Promise.resolve(),
    roadTurn: firstRoad,
    seed: 1,
    settled: null,
  };
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
  const quality = createQuality(
    renderer,
    { pinnedPixelRatio, pinnedRefresh, pinnedRung },
    () => window.devicePixelRatio
  );
  const hub = diagnostics();
  const { recorder } = hub;
  const frame = createFrameLoop(renderer);
  const lap = lapOf(frame);
  const pipeline = createPipeline(renderer, lap);

  const stage = createStage(
    assets,
    roadForTurn(session.roadTurn),
    session.seed
  );
  pipeline.setLook(stage.world.shading.look);
  stage.world.scene.add(stage.fleet.group);
  const chase = createChaseCamera();
  const sound = createSound();
  const cast = createCast(stage.world.shading);
  const feedback = createFeedback();

  const {
    buildViews,
    captureAll,
    drawRider,
    dropFleet,
    dropViews,
    followPlayer,
    holdStill,
    placeFleet,
    touchDown,
  } = bindCast({ assets, cast, stage });
  const { abandonCompiles, build, player, warmNow, warmSoon, warmUp } =
    bindStage({
      assets,
      buildViews,
      cast,
      chase,
      devRide,
      pipeline,
      quality,
      stage,
    });
  const { placeTag, quiet, react, report, say, toggleMute } = bindFeedback({
    canvas,
    cast,
    chase,
    events,
    feedback,
    player,
    recorder,
    session,
    sound,
    stage,
  });

  const begin = (nextPhase: GamePhase) => {
    session.phase = nextPhase;
    session.countdown = nextPhase === "countdown" ? COUNTDOWN_SECONDS : 0;
    session.settled = null;
    session.overLeft = 0;
    session.frozen = false;
    session.holdLeft = 0;
    session.lastStretchSaid = false;
    feedback.notice = "";
    feedback.noticeLeft = 0;
    feedback.speech = "";
    feedback.speechLeft = 0;
    feedback.tagRider = -1;
    frame.clockReset = true;
  };

  const loadRace = (setup: RaceSetup, nextPhase: GamePhase) => {
    session.prepared = null;
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
    session.plan = null;
    session.log = null;
    recorder.leaveRace();
    session.seed += 1;
    if (nextRoad) {
      session.roadTurn += 1;
    }
    loadRace(
      defaultSetup(roadForTurn(session.roadTurn), session.seed),
      "attract"
    );
  };
  const startRace = (next: RacePlan) => {
    sound.unlock();
    session.plan = next;
    session.log = createRaceLog(next.setup);
    recorder.enterRace();
    if (session.prepared === next.setup && session.phase === "idle") {
      session.prepared = null;
      if (stage.warming) {
        warmNow();
      }
      begin("countdown");
    } else {
      loadRace(next.setup, "countdown");
    }
    recorder.race("start", stage.race.view.tick);
  };

  const halted = (): boolean =>
    session.frozen || stage.warming || session.phase === "idle";

  const live = (): boolean =>
    !session.frozen &&
    (session.phase === "countdown" || session.phase === "racing");

  const controls = createControls((code) => {
    if (code === "KeyM") {
      toggleMute();
    }
    if (
      code === MARKER_KEY &&
      live() &&
      recorder.marker(stage.race.view.tick)
    ) {
      say("marked");
    }
    if (code === "KeyR" && session.plan?.mode === "quick" && live()) {
      startRace(session.plan);
    }
  });

  const attractOver = (): boolean => player().finishTick >= 0 || out(player());

  const record = () => {
    if (!(session.plan && session.log) || session.settled) {
      return;
    }
    recordTick(session.log, stage.race.view, session.plan.setup);
    if (!session.log.outcome) {
      return;
    }
    session.settled = session.log.outcome;
    session.phase = "settled";
    recorder.race("end", stage.race.view.tick);
    session.overLeft = consequenceSeconds(session.settled);
    events.onSettle(session.plan, session.settled);
    if (session.overLeft <= 0) {
      events.onOver(session.plan, session.settled);
    }
  };

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
    if (session.plan && session.settled && session.overLeft > 0) {
      session.overLeft -= TICK_SECONDS;
      if (session.overLeft <= 0) {
        events.onOver(session.plan, session.settled);
      }
    }
  };

  const readInputs = () => {
    for (let index = 0; index < cast.inputs.length; index += 1) {
      const input = cast.inputs[index];
      if (!input) {
        continue;
      }
      if (index === 0 && session.phase !== "attract" && !autopilot) {
        controls.read(TICK_SECONDS, input);
      } else {
        stage.race.pilot(index, input);
      }
    }
    devRide?.steer(stage.race.view, stage.track, cast.inputs[0]);
  };

  const tick = () => {
    captureAll("before");
    const { cars } = stage.race.view;
    for (let index = 0; index < cars.length; index += 1) {
      stage.previousCars[index] = cars[index]?.s ?? 0;
    }
    if (session.holdLeft > 0) {
      session.holdLeft -= TICK_SECONDS;
      holdStill();
      return;
    }
    if (session.phase === "countdown") {
      session.countdown -= TICK_SECONDS;
      if (session.countdown <= 0 && session.plan) {
        session.phase = "racing";
        recorder.race("green", stage.race.view.tick);
        events.onStart(session.plan);
      }
      holdStill();
      return;
    }
    readInputs();
    if (session.phase === "attract" && attractOver()) {
      loadAttract(true);
      return;
    }
    stage.race.step(cast.inputs);
    for (const event of stage.race.view.events) {
      touchDown(event);
    }
    if (session.phase !== "attract") {
      react();
    }
    if (
      session.phase === "racing" &&
      devRide?.holds(stage.race.view) === true
    ) {
      session.frozen = true;
    }
    record();
    advanceClock();
    holdStill();
  };

  const {
    applyDeviceStart,
    applyFrameRate,
    applyPending,
    checkPresented,
    forgetHiddenTime,
    govern,
    noteQuality,
    noteRefresh,
    present,
    resize,
    skipsVsync,
  } = bindQuality({
    canvas,
    chase,
    frame,
    halted,
    pipeline,
    quality,
    readGpu: () => rendererOf(renderer),
    recorder,
    renderer,
    stage,
    subject: cast.subject,
  });

  const draw = (blend: number, seconds: number) => {
    if (stage.warming) {
      return;
    }
    cast.clock += seconds;
    let index = -1;
    for (const rider of stage.race.view.riders) {
      index += 1;
      const view = cast.views[index];
      if (!view) {
        continue;
      }
      drawRider(index, rider, view, blend, seconds);
      if (index === 0) {
        followPlayer(rider);
      }
    }
    const [lead] = cast.views;
    if (cast.bikes && lead) {
      cast.bikes.commit(lead.bike.position);
    }
    cast.puffs?.update(seconds);
    frame.profiler?.lap("riders");

    placeFleet(blend);
    frame.profiler?.lap("fleet");

    chase.update(stage.track, cast.subject, seconds);
    frame.profiler?.lap("camera");
    stage.world.showHazards(stage.race.view.hazards, cast.subject.s);
    stage.world.follow(chase.camera, cast.subject.s);
    frame.profiler?.lap("world");
    present();
    placeTag();
  };

  const applySettings = bindSettings({
    applyFrameRate,
    canvas,
    frame,
    hub,
    recorder,
    renderer,
  });

  const unwatchCanvas = hub.watchCanvas(canvas);
  const unsubscribeSettings = hub.settings.subscribe(applySettings);
  applySettings();
  const detachProbe = hub.attachGame({
    frameAt: (index) => frame.profiler?.reader.frameAt(index) ?? null,
    latestFrame: () => frame.frameId - 1,
    get renderer() {
      return frame.rendererLabel;
    },
    snapshot() {
      noteQuality(quality.qualityAfter);
      return {
        phase: session.phase,
        quality: { ...quality.qualityAfter },
        race: recorder.raceId(),
        tick: stage.race.view.tick,
      };
    },
  });
  applyDeviceStart();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("webglcontextlost", abandonCompiles);
  document.addEventListener("visibilitychange", forgetHiddenTime);
  resize();
  buildViews();
  warmUp();

  frame.last = performance.now();
  devRide?.whenReleased(() => {
    session.frozen = false;
    frame.clockReset = true;
    frame.last = performance.now();
  });
  installFrameLoop({
    applyPending,
    cast,
    checkPresented,
    draw,
    feedback,
    frame,
    govern,
    halted,
    noteRefresh,
    player,
    quality,
    recorder,
    renderer,
    report,
    session,
    skipsVsync,
    sound,
    stage,
    tick,
  });

  const showStartWhenWarm = async (): Promise<void> => {
    if (await warmSoon()) {
      draw(0, 0);
    }
  };

  const prepare = async (next: RacePlan): Promise<void> => {
    if (session.prepared === next.setup) {
      await session.preparing;
      return;
    }
    session.plan = null;
    session.log = null;
    session.phase = "idle";
    quiet();
    const release = build(next.setup, true);
    session.prepared = next.setup;
    begin("idle");
    session.preparing = showStartWhenWarm();
    release();
    report();
    await session.preparing;
  };

  return {
    attract() {
      if (session.phase !== "attract") {
        loadAttract(false);
        report();
      }
    },
    dispose() {
      stage.alive = false;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", abandonCompiles);
      document.removeEventListener("visibilitychange", forgetHiddenTime);
      unsubscribeSettings();
      unwatchCanvas();
      detachProbe();
      frame.meter?.dispose();
      frame.profiler?.dispose();
      controls.dispose();
      sound.dispose();
      abandonCompiles();
      dropViews();
      dropFleet();
      stage.world.dispose();
      pipeline.dispose();
      renderer.dispose();
      acquired.release();
    },
    followRival(element) {
      feedback.tag = element;
    },
    pause() {
      if (session.frozen || session.phase !== "racing") {
        return false;
      }
      session.frozen = true;
      quiet();
      return true;
    },
    prepare,
    quit() {
      if (session.plan && !session.settled) {
        recorder.race("quit", stage.race.view.tick);
      }
      const outcome =
        session.plan && session.log
          ? outcomeOf(stage.race.view, session.plan.setup, session.log)
          : null;
      session.plan = null;
      session.log = null;
      session.frozen = false;
      session.phase = "idle";
      quiet();
      report();
      return outcome;
    },
    resume() {
      if (!session.frozen) {
        return;
      }
      session.frozen = false;
      session.holdLeft = RESUME_SECONDS;
      frame.clockReset = true;
      frame.last = performance.now();
    },
    sleep() {
      if (session.phase === "idle") {
        return;
      }
      session.plan = null;
      session.log = null;
      session.frozen = false;
      session.phase = "idle";
      quiet();
      report();
    },
    startRace,
    toggleMute() {
      toggleMute();
      report();
    },
  };
};
