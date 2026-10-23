import type {
  FrameRate,
  GovernReason,
  ResizeSource,
} from "@racer/telemetry/limits";
import { governReasons } from "@racer/telemetry/limits";

import { emptyQuality } from "../diagnostics/recorder.ts";
import type { QualityState, Recorder } from "../diagnostics/recorder.ts";
import type { ChaseCamera, Subject } from "./chase-camera.ts";
import type { FrameSample } from "./fps-meter.ts";
import { BASE_RATE, createGovernor } from "./governor.ts";
import type { Governor, Verdict } from "./governor.ts";
import { createPacer, createRefreshMeter } from "./pacer.ts";
import type { Pacer } from "./pacer.ts";
import { BLOOM_SCALE, SAMPLES } from "./post.ts";
import type { Pipeline } from "./post.ts";
import { SHADOW_MAP } from "./world.ts";
import type { World } from "./world.ts";

const EXCUSED_FRAMES = 2;
const MAX_PIXEL_RATIO = 2;
const PIXEL_RATIO_STEP = 0.1;
const LOWEST_RATIO_SHARE = 0.75;
const LEAN_SHADOW_MAP = 2048;
const LEAN_BLOOM_SCALE = 1;

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

const nativePixelRatio = (readDpr: () => number): number =>
  Math.min(readDpr(), MAX_PIXEL_RATIO);

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

interface Pins {
  readonly pinnedPixelRatio: number;
  readonly pinnedRefresh: number;
  readonly pinnedRung: number;
}

export interface QualityRenderer {
  readonly setPixelRatio: (ratio: number) => void;
  readonly setSize: (
    width: number,
    height: number,
    updateStyle?: boolean
  ) => void;
}

export interface Quality extends Pins {
  readonly display: { refresh: number };
  ladder: readonly Rung[];
  readonly governor: Governor;
  rung: number;
  pixelRatio: number;
  readonly qualityBefore: QualityState;
  readonly qualityAfter: QualityState;
  sizeEpoch: number;
  excuseFrames: number;
  appliedWidth: number;
  appliedHeight: number;
  appliedRatio: number;
  drawnEpoch: number;
  drawnFrame: number;
  drawnRung: number;
  rendering: boolean;
  pace: number;
  readonly pacer: Pacer;
  readonly readDpr: () => number;
  readonly readRefresh: (now: number) => number;
  renderedLast: boolean;
  pendingQuality: (() => void) | null;
  pendingRate: FrameRate | null;
}

export const createQuality = (
  renderer: Pick<QualityRenderer, "setPixelRatio">,
  { pinnedPixelRatio, pinnedRefresh, pinnedRung }: Pins,
  readDpr: () => number
): Quality => {
  const display = { refresh: pinnedRefresh > 0 ? pinnedRefresh : 60 };
  const ladder = ladderFor(nativePixelRatio(readDpr));
  const governor = createGovernor(ladder.length);
  const pixelRatio =
    pinnedPixelRatio > 0 ? pinnedPixelRatio : nativePixelRatio(readDpr);
  renderer.setPixelRatio(pixelRatio);
  return {
    appliedHeight: -1,
    appliedRatio: -1,
    appliedWidth: -1,
    display,
    drawnEpoch: 0,
    drawnFrame: -1,
    drawnRung: 0,
    excuseFrames: 0,
    governor,
    ladder,
    pace: BASE_RATE,
    pacer: createPacer(),
    pendingQuality: null,
    pendingRate: null,
    pinnedPixelRatio,
    pinnedRefresh,
    pinnedRung,
    pixelRatio,
    qualityAfter: emptyQuality(),
    qualityBefore: emptyQuality(),
    readDpr,
    readRefresh: createRefreshMeter(display.refresh),
    renderedLast: false,
    rendering: false,
    rung: 0,
    sizeEpoch: 0,
  };
};

interface QualityParts {
  readonly canvas: Pick<
    HTMLCanvasElement,
    "clientHeight" | "clientWidth" | "height" | "width"
  >;
  readonly chase: Pick<ChaseCamera, "camera" | "resize">;
  readonly frame: { readonly frameId: number; readonly sample: FrameSample };
  readonly halted: () => boolean;
  readonly pipeline: Pick<
    Pipeline,
    "render" | "resize" | "setBloomScale" | "setSamples"
  >;
  readonly quality: Quality;
  readonly readGpu: () => string;
  readonly recorder: Pick<
    Recorder,
    "canvas" | "governor" | "incompletePass" | "invalidated"
  >;
  readonly renderer: QualityRenderer;
  readonly stage: {
    readonly world: Pick<World, "follow" | "scene" | "setShadowMap">;
    readonly warming: boolean;
  };
  readonly subject: Subject;
}

export const bindQuality = ({
  canvas,
  chase,
  frame,
  halted,
  pipeline,
  quality,
  readGpu,
  recorder,
  renderer,
  stage,
  subject,
}: QualityParts) => {
  const {
    display,
    governor,
    pacer,
    pinnedPixelRatio,
    pinnedRefresh,
    pinnedRung,
    qualityAfter,
    qualityBefore,
    readRefresh,
  } = quality;
  const { sample } = frame;

  const present = () => {
    quality.rendering = true;
    pipeline.render(stage.world.scene, chase.camera);
    quality.rendering = false;
    quality.drawnEpoch = quality.sizeEpoch;
    quality.drawnFrame = frame.frameId;
    quality.drawnRung = quality.rung;
  };

  const applySize = (source: ResizeSource) => {
    quality.appliedWidth = canvas.clientWidth;
    quality.appliedHeight = canvas.clientHeight;
    quality.appliedRatio = quality.pixelRatio;
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    pipeline.resize(
      canvas.clientWidth,
      canvas.clientHeight,
      quality.pixelRatio
    );
    quality.sizeEpoch += 1;
    quality.excuseFrames = EXCUSED_FRAMES;
    recorder.canvas(
      source,
      quality.sizeEpoch,
      canvas.clientWidth,
      canvas.clientHeight,
      canvas.width,
      canvas.height
    );
  };

  const noteQuality = (into: QualityState) => {
    const chosen = quality.ladder[quality.rung] ?? quality.ladder[0];
    into.rung = quality.rung;
    into.pixelRatio = quality.pixelRatio;
    into.bloomScale = chosen?.bloomScale ?? 0;
    into.shadowMap = chosen?.shadowMap ?? 0;
    into.samples = chosen?.samples ?? 0;
    into.pace = quality.pace;
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
    const chosen = quality.ladder[quality.rung] ?? quality.ladder[0];
    if (!chosen) {
      return;
    }
    stage.world.setShadowMap(chosen.shadowMap);
    pipeline.setBloomScale(chosen.bloomScale);
    pipeline.setSamples(chosen.samples);
    quality.excuseFrames = EXCUSED_FRAMES;
    const next = pinnedPixelRatio > 0 ? pinnedPixelRatio : chosen.pixelRatio;
    const resized = next !== quality.pixelRatio;
    quality.pixelRatio = next;
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
    pinnedPixelRatio <= 0 && !pacer.due(now, display.refresh, quality.pace);

  const commitVerdict = (verdict: Verdict) => {
    changeQuality(verdict.reason, () => {
      governor.commit(verdict);
      quality.pace = governor.pace;
      if (governor.rung !== quality.rung) {
        quality.rung = governor.rung;
        applyRung("rung");
      }
    });
  };

  const govern = (seconds: number, busyMs: number) => {
    if (pinnedPixelRatio > 0 || pinnedRung >= 0) {
      return;
    }
    const excused = quality.excuseFrames > 0;
    if (excused && quality.renderedLast) {
      quality.excuseFrames -= 1;
    }
    if (quality.pendingQuality) {
      return;
    }
    const ceiling = nativePixelRatio(quality.readDpr);
    if (ceiling !== quality.ladder[0]?.pixelRatio) {
      quality.pendingQuality = () => {
        changeQuality("native-dpr", () => {
          quality.ladder = ladderFor(ceiling);
          governor.resize(quality.ladder.length);
          quality.rung = governor.rung;
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
      quality.pendingQuality = () => {
        commitVerdict(verdict);
      };
    }
  };

  const checkPresented = () => {
    if (quality.rendering) {
      quality.rendering = false;
      recorder.incompletePass(quality.drawnFrame + 1);
    }
    if (quality.drawnFrame >= 0 && quality.drawnEpoch !== quality.sizeEpoch) {
      recorder.invalidated(
        quality.drawnFrame,
        quality.drawnEpoch,
        quality.sizeEpoch,
        quality.drawnRung,
        quality.rung
      );
      quality.drawnEpoch = quality.sizeEpoch;
    }
  };

  const resize = () => {
    if (
      canvas.clientWidth === quality.appliedWidth &&
      canvas.clientHeight === quality.appliedHeight &&
      quality.pixelRatio === quality.appliedRatio
    ) {
      return;
    }
    applySize("observer");
    chase.resize(canvas.clientWidth, canvas.clientHeight);
    if (halted() && !stage.warming) {
      stage.world.follow(chase.camera, subject.s);
      present();
    }
  };

  const applyRateSetting = (next: FrameRate) => {
    changeQuality("rate-setting", () => {
      governor.setRate(next);
      quality.pace = governor.pace;
      if (governor.rung !== quality.rung) {
        quality.rung = governor.rung;
        applyRung("rung");
      }
    });
  };

  const applyFrameRate = (next: FrameRate) => {
    quality.pendingRate = next === governor.rate ? null : next;
  };

  const applyPending = () => {
    const pending = quality.pendingQuality;
    const rate = quality.pendingRate;
    quality.pendingQuality = null;
    quality.pendingRate = null;
    pending?.();
    if (rate) {
      applyRateSetting(rate);
    }
  };

  const applyDeviceStart = () => {
    const startRung = pinnedRung >= 0 ? pinnedRung : startRungFor(readGpu());
    if (startRung > 0) {
      changeQuality("device-start", () => {
        governor.startAt(startRung);
        quality.rung = governor.rung;
        applyRung("rung");
      });
    }
  };

  const forgetHiddenTime = () => {
    governor.interrupt();
    quality.excuseFrames = EXCUSED_FRAMES;
  };

  return {
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
  };
};
