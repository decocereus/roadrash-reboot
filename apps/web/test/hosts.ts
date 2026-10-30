import { defaultSetup, neutralInput } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import type { InputFrame, RiderInput } from "@racer/sim/state";
import type { FrameRate } from "@racer/telemetry/limits";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";

import { createChaseCamera } from "../src/game/chase-camera.ts";
import { frameLoopOf, installFrameLoop } from "../src/game/frame-loop.ts";
import type { FrameLoop, FrameRenderer } from "../src/game/frame-loop.ts";
import type { InputHost, KeyEvent, Pad } from "../src/game/input.ts";
import type { Profiler } from "../src/game/profile.ts";
import { bindQuality, createQuality } from "../src/game/quality-ladder.ts";
import type { Quality, QualityRenderer } from "../src/game/quality-ladder.ts";
import { hasherFor } from "./race-hash.ts";

export const VSYNC_MS = 1000 / 60;

const scriptedInput = (tick: number, input: RiderInput): void => {
  const phase = Math.floor(tick / 45) % 4;
  input.throttle = phase === 3 ? 0 : 1;
  input.brake = phase === 3 ? 0.6 : 0;
  input.steer = [0, 0.5, -0.4, 0][phase] ?? 0;
  input.punch = tick % 90 === 30;
  input.kick = tick % 90 === 60;
};

export interface HostOptions {
  readonly dpr?: number;
  readonly pinnedPixelRatio?: number;
  readonly pinnedRefresh?: number;
  readonly pinnedRung?: number;
  readonly profiled?: boolean;
  readonly sounded?: boolean;
}

interface Seen {
  bloomScales: number[];
  calls: number;
  drives: number;
  laps: number;
  pixelRatios: number[];
  presents: number;
  profiled: number;
  reports: number;
  resizes: string[];
  samples: number[];
  shadowMaps: number[];
  sizes: string[];
}

export interface Host {
  readonly canvas: { clientHeight: number; clientWidth: number };
  readonly digests: string[];
  readonly frame: FrameLoop;
  readonly quality: Quality;
  readonly run: RaceRun;
  readonly seen: Seen;
  readonly at: (now: number) => void;
  readonly frameRate: (rate: FrameRate) => void;
  readonly halt: (halted: boolean) => void;
  readonly resize: () => void;
  readonly setDpr: (dpr: number) => void;
}

const recordingProfiler = (seen: Seen): Profiler => ({
  dispose: () => {
    seen.profiled = 0;
  },
  finish: () => {
    seen.profiled += 1;
  },
  lap: () => {
    seen.laps += 1;
  },
  reader: {
    frameAt: () => null,
    info: () => ({
      frames: 0,
      gpuTimer: false,
      parts: [],
      renderer: "test",
      tick: 0,
    }),
    window: () => [],
  },
  start: () => {
    seen.calls += 1;
  },
});

const quietSound = (seen: Seen) => ({
  drive: () => {
    seen.calls += 1;
  },
  shift: () => {
    seen.calls += 1;
  },
});

const heardSound = (seen: Seen) => ({
  drive: () => {
    seen.drives += 1;
  },
  shift: () => {
    seen.drives += 1;
  },
});

interface Ticker {
  readonly digests: string[];
  readonly run: RaceRun;
  readonly tick: () => void;
}

export const createTicker = (): Ticker => {
  const track = trackFor("ridge-road", 1);
  const run = createRaceRun(defaultSetup(track, 7));
  const input: RiderInput = { ...neutralInput };
  const frame: InputFrame = new Map([[PLAYER_RIDER, input]]);
  const digests: string[] = [];
  const hasher = hasherFor(run.view, track);
  const tick = () => {
    scriptedInput(run.view.tick, input);
    run.step(frame);
    digests.push(hasher.hash(run.view));
  };
  return { digests, run, tick };
};

export const createHost = (options: HostOptions = {}): Host => {
  const { digests, run, tick } = createTicker();
  const player = riderOf(run.view.riders, PLAYER_RIDER);
  if (!player) {
    throw new Error("The race has no player.");
  }
  const seen: Seen = {
    bloomScales: [],
    calls: 0,
    drives: 0,
    laps: 0,
    pixelRatios: [],
    presents: 0,
    profiled: 0,
    reports: 0,
    resizes: [],
    samples: [],
    shadowMaps: [],
    sizes: [],
  };
  const canvas = { clientHeight: 720, clientWidth: 1280, height: 0, width: 0 };
  const control = { dpr: options.dpr ?? 1, halted: false };
  const loops: ((now: number) => void)[] = [];
  const renderer = {
    info: {
      render: { calls: 0, triangles: 0 },
      reset: () => {
        seen.calls += 1;
      },
    },
    setAnimationLoop: (loop: ((now: number) => void) | null) => {
      loops.length = 0;
      if (loop) {
        loops.push(loop);
      }
    },
    setPixelRatio: (ratio: number) => {
      seen.pixelRatios.push(ratio);
    },
    setSize: (width: number, height: number) => {
      seen.sizes.push(`${width}x${height}`);
      canvas.width = width;
      canvas.height = height;
    },
  } satisfies FrameRenderer & QualityRenderer;
  const note = () => {
    seen.calls += 1;
  };
  const recorder = {
    beginFrame: note,
    canvas: note,
    frame: note,
    governor: note,
    incompletePass: note,
    invalidated: note,
    raceId: () => 1,
    recording: false,
  };
  const halted = () => control.halted;
  const frame = frameLoopOf(
    options.profiled === true ? "cpu" : "off",
    options.profiled === true ? recordingProfiler(seen) : null,
    false
  );
  const quality = createQuality(
    renderer,
    {
      pinnedPixelRatio: options.pinnedPixelRatio ?? 0,
      pinnedRefresh: options.pinnedRefresh ?? 0,
      pinnedRung: options.pinnedRung ?? -1,
    },
    () => control.dpr
  );
  const bound = bindQuality({
    canvas,
    chase: createChaseCamera(),
    frame,
    halted,
    pipeline: {
      render: () => {
        seen.presents += 1;
      },
      resize: (width, height, ratio) => {
        seen.resizes.push(`${width}x${height}@${ratio}`);
      },
      setBloomScale: (scale) => {
        seen.bloomScales.push(scale);
      },
      setSamples: (samples) => {
        seen.samples.push(samples);
      },
    },
    quality,
    readGpu: () => "test",
    recorder,
    renderer,
    stage: {
      warming: false,
      world: {
        follow: note,
        scene: new THREE.Scene(),
        setShadowMap: (size) => {
          seen.shadowMaps.push(size);
        },
      },
    },
    subject: { air: 0, s: 0, speed: 0, tuck: 0, x: 0 },
  });
  bound.applyDeviceStart();
  bound.resize();
  installFrameLoop({
    applyPending: bound.applyPending,
    checkPresented: bound.checkPresented,
    draw: () => {
      bound.present();
    },
    feedback: { noticeLeft: 0, speechLeft: 0 },
    frame,
    govern: bound.govern,
    halted,
    noteRefresh: bound.noteRefresh,
    player: () => player,
    quality,
    recorder,
    renderer,
    report: () => {
      seen.reports += 1;
    },
    session: { holdLeft: 0, phase: "racing" },
    skipsVsync: bound.skipsVsync,
    sound: options.sounded === true ? heardSound(seen) : quietSound(seen),
    stage: { race: run },
    tick,
  });
  return {
    at: (now) => {
      for (const loop of loops) {
        loop(now);
      }
    },
    canvas,
    digests,
    frame,
    frameRate: bound.applyFrameRate,
    halt: (next) => {
      control.halted = next;
    },
    quality,
    resize: bound.resize,
    run,
    seen,
    setDpr: (next) => {
      control.dpr = next;
    },
  };
};

export interface Keyboard {
  readonly commands: string[];
  readonly host: InputHost;
  readonly pads: (Pad | null)[];
  readonly blur: () => void;
  readonly listeners: () => number;
  readonly prevented: () => number;
  readonly press: (code: string, repeat?: boolean) => void;
  readonly release: (code: string) => void;
}

export const createKeyboard = (): Keyboard => {
  const presses: ((event: KeyEvent) => void)[] = [];
  const releases: ((event: KeyEvent) => void)[] = [];
  const blurs: (() => void)[] = [];
  const pads: (Pad | null)[] = [];
  const count = { prevented: 0 };
  const eventOf = (code: string, repeat: boolean): KeyEvent => ({
    code,
    preventDefault: () => {
      count.prevented += 1;
    },
    repeat,
  });
  return {
    blur: () => {
      for (const blur of blurs) {
        blur();
      }
    },
    commands: [],
    host: {
      listen: (press, release, blur) => {
        presses.push(press);
        releases.push(release);
        blurs.push(blur);
        return () => {
          presses.length = 0;
          releases.length = 0;
          blurs.length = 0;
        };
      },
      pads: () => pads,
    },
    listeners: () => presses.length + releases.length + blurs.length,
    pads,
    press: (code, repeat = false) => {
      for (const press of presses) {
        press(eventOf(code, repeat));
      }
    },
    prevented: () => count.prevented,
    release: (code) => {
      for (const release of releases) {
        release(eventOf(code, false));
      }
    },
  };
};
