import type { RiderView } from "@racer/sim/race-view";
import { clamp, TICK_SECONDS } from "@racer/sim/state";
import type { FrameRate } from "@racer/telemetry/limits";
import type * as THREE from "three";

import type { Diagnostics } from "../diagnostics/hub.ts";
import type { Recorder } from "../diagnostics/recorder.ts";
import type { Part } from "../profile-parts.ts";
import type { Sound } from "./audio.ts";
import { createFixedTick } from "./fixed-tick.ts";
import { createFrameMeter, emptySample, wantsFrameMeter } from "./fps-meter.ts";
import type { FrameMeter, FrameSample } from "./fps-meter.ts";
import { advanceHud } from "./hud-cadence.ts";
import type { GamePhase } from "./hud.ts";
import { createProfiler, profileModeOf } from "./profile.ts";
import type { FrameEnd, ProfileMode, Profiler } from "./profile.ts";
import type { Quality } from "./quality-ladder.ts";
import type { Feedback } from "./race-feedback.ts";
import type { Stage } from "./scene-lifecycle.ts";

const MAX_FRAME_SECONDS = 0.1;

export interface FrameLoop {
  readonly profileMode: ProfileMode;
  profiler: Profiler | null;
  readonly meterFlag: boolean;
  meter: FrameMeter | null;
  readonly sample: FrameSample;
  readonly frameEnd: FrameEnd;
  frameId: number;
  rendererLabel: string;
  overlayNoted: boolean | null;
  accumulator: number;
  clockReset: boolean;
  hudClock: number;
  lastBusyMs: number;
  lastGear: number;
  last: number;
  lastCallback: number;
}

export const frameLoopOf = (
  profileMode: ProfileMode,
  profiler: Profiler | null,
  meterFlag: boolean
): FrameLoop => ({
  accumulator: 0,
  clockReset: false,
  frameEnd: {
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
  },
  frameId: 0,
  hudClock: 0,
  last: 0,
  lastBusyMs: 0,
  lastCallback: Number.NaN,
  lastGear: 1,
  meter: null,
  meterFlag,
  overlayNoted: null,
  profileMode,
  profiler,
  rendererLabel: "",
  sample: emptySample(),
});

export const createFrameLoop = (renderer: THREE.WebGLRenderer): FrameLoop => {
  const profileMode = profileModeOf(globalThis.location.search);
  return frameLoopOf(
    profileMode,
    profileMode === "off"
      ? null
      : createProfiler(renderer, profileMode === "gpu"),
    wantsFrameMeter()
  );
};

export const lapOf = (frame: FrameLoop) => (part: Part) => {
  frame.profiler?.lap(part);
};

interface SettingsParts {
  readonly applyFrameRate: (next: FrameRate) => void;
  readonly canvas: HTMLCanvasElement;
  readonly frame: FrameLoop;
  readonly hub: Diagnostics;
  readonly recorder: Recorder;
  readonly renderer: THREE.WebGLRenderer;
}

export const bindSettings = ({
  applyFrameRate,
  canvas,
  frame,
  hub,
  recorder,
  renderer,
}: SettingsParts) => {
  const ensureProfiler = () => {
    frame.profiler ??= createProfiler(renderer, frame.profileMode === "gpu");
    frame.rendererLabel = frame.profiler.reader.info().renderer;
  };

  return () => {
    const settings = hub.settings.read();
    applyFrameRate(settings.frameRate);
    const wantsMeter = frame.meterFlag || settings.overlay;
    if (wantsMeter && !frame.meter) {
      frame.meter = createFrameMeter(canvas, hub.view().session);
    } else if (!wantsMeter && frame.meter) {
      frame.meter.dispose();
      frame.meter = null;
    }
    if (settings.recording) {
      ensureProfiler();
    }
    const showing = frame.meter !== null;
    if (!settings.recording) {
      frame.overlayNoted = null;
    } else if (frame.overlayNoted !== showing) {
      recorder.overlay(showing);
      frame.overlayNoted = showing;
    }
  };
};

export interface FrameRenderer {
  readonly info: {
    readonly render: { readonly calls: number; readonly triangles: number };
    readonly reset: () => void;
  };
  readonly setAnimationLoop: (callback: ((now: number) => void) | null) => void;
}

interface LoopParts {
  readonly applyPending: () => void;
  readonly checkPresented: () => void;
  readonly draw: (blend: number, seconds: number) => void;
  readonly feedback: Pick<Feedback, "noticeLeft" | "speechLeft">;
  readonly frame: FrameLoop;
  readonly govern: (seconds: number, busyMs: number) => void;
  readonly halted: () => boolean;
  readonly noteRefresh: (now: number) => void;
  readonly player: () => RiderView;
  readonly quality: Quality;
  readonly recorder: Pick<
    Recorder,
    "beginFrame" | "frame" | "raceId" | "recording"
  >;
  readonly renderer: FrameRenderer;
  readonly report: () => void;
  readonly session: { readonly phase: GamePhase; readonly holdLeft: number };
  readonly skipsVsync: (now: number) => boolean;
  readonly sound: Pick<Sound, "drive" | "shift">;
  readonly stage: Pick<Stage, "race">;
  readonly tick: () => void;
}

export const installFrameLoop = ({
  applyPending,
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
}: LoopParts): void => {
  const { frameEnd, sample } = frame;

  const advance = createFixedTick(frame, halted, tick);

  const noteCallback = (now: number) => {
    noteRefresh(now);
    const callbackMs = now - frame.lastCallback;
    frame.lastCallback = now;
    if (callbackMs >= 0 && !halted()) {
      govern(clamp(callbackMs / 1000, 0, MAX_FRAME_SECONDS), frame.lastBusyMs);
    }
    quality.renderedLast = false;
  };
  renderer.setAnimationLoop((now) => {
    checkPresented();
    noteCallback(now);
    if (skipsVsync(now)) {
      return;
    }
    const entered = performance.now();
    const interval = now - frame.last;
    const seconds = clamp(interval / 1000, 0, MAX_FRAME_SECONDS);
    frame.last = now;
    if (halted()) {
      return;
    }
    recorder.beginFrame(frame.frameId);
    frame.profiler?.start(frame.frameId);
    const ticks = advance(seconds);
    frame.profiler?.lap("sim");
    const me = player();
    const riding = me.mode === "riding" && session.phase !== "attract";
    if (riding && me.gear > frame.lastGear) {
      sound.shift();
    }
    frame.lastGear = me.gear;
    sound.drive(
      riding ? me.speed : 0,
      riding && session.phase === "racing" && session.holdLeft <= 0
        ? me.input.throttle
        : 0,
      riding ? me.revs : 0,
      riding && me.offRoad
    );
    renderer.info.reset();
    applyPending();
    frame.profiler?.lap("other");
    draw(clamp(frame.accumulator / TICK_SECONDS, 0, 1), seconds);
    quality.renderedLast = true;
    const discarded = Math.max(0, interval - MAX_FRAME_SECONDS * 1000);
    if (frame.meter) {
      sample.calls = renderer.info.render.calls;
      sample.discardedMs = discarded;
      sample.intervalMs = interval;
      sample.pace = quality.pace;
      sample.pixelRatio = quality.pixelRatio;
      sample.recording = recorder.recording;
      sample.refresh = quality.display.refresh;
      sample.rung = quality.rung;
      sample.rungs = quality.ladder.length;
      sample.triangles = renderer.info.render.triangles;
      frame.meter.frame(sample);
    }
    feedback.noticeLeft -= seconds;
    feedback.speechLeft -= seconds;
    advanceHud(frame, seconds, report);
    if (frame.profiler) {
      frameEnd.discarded = discarded;
      frameEnd.drawRung = quality.drawnRung;
      frameEnd.drawnEpoch = quality.drawnEpoch;
      frameEnd.interval = interval;
      frameEnd.pixelRatio = quality.pixelRatio;
      frameEnd.race = recorder.raceId();
      frameEnd.rung = quality.rung;
      frameEnd.sizeEpoch = quality.sizeEpoch;
      frameEnd.tick = stage.race.view.tick;
      frameEnd.ticks = ticks;
      frame.profiler.finish(frameEnd);
    }
    recorder.frame(frame.frameId, interval, discarded);
    frame.frameId += 1;
    frame.lastBusyMs = performance.now() - entered;
  });
};
