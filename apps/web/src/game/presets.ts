import type { FrameRate, PresetId } from "@racer/telemetry/limits";

import type { QualityState, Recorder } from "../diagnostics/recorder.ts";
import type { ChaseCamera, Subject } from "./chase-camera.ts";
import { createPacer, createRefreshMeter } from "./pacer.ts";
import type { Pacer } from "./pacer.ts";
import { BLOOM_SCALE, SAMPLES } from "./post.ts";
import type { Picture, Pipeline } from "./post.ts";
import { SHADOW_MAP } from "./world.ts";
import type { World } from "./world.ts";

const MAX_PIXEL_RATIO = 2;
const LEAN_SHADOW_MAP = 2048;
const BALANCED_BLOOM_SCALE = 1;
const LEAN_BLOOM_SCALE = 0.5;
const BALANCED_PIXELS = 2560 * 1440;
const LEAN_PIXELS = 1344 * 756;

export interface Preset extends Picture {
  readonly farRiders: boolean;
  readonly id: PresetId;
  readonly maxPixels: number | null;
  readonly shadowMap: number;
}

export const presets = {
  balanced: {
    bloomScale: BALANCED_BLOOM_SCALE,
    farRiders: false,
    id: "balanced",
    maxPixels: BALANCED_PIXELS,
    samples: 0,
    shadowMap: LEAN_SHADOW_MAP,
  },
  full: {
    bloomScale: BLOOM_SCALE,
    farRiders: false,
    id: "full",
    maxPixels: null,
    samples: SAMPLES,
    shadowMap: SHADOW_MAP,
  },
  lean: {
    bloomScale: LEAN_BLOOM_SCALE,
    farRiders: true,
    id: "lean",
    maxPixels: LEAN_PIXELS,
    samples: 0,
    shadowMap: LEAN_SHADOW_MAP,
  },
} as const satisfies Readonly<Record<PresetId, Preset>>;

const deviceRows: readonly {
  readonly gpu: RegExp;
  readonly preset: PresetId;
}[] = [
  { gpu: /Apple M\d+ (?:Pro|Max|Ultra)/u, preset: "full" },
  { gpu: /GeForce (?:GTX|RTX)|Radeon (?:RX|Pro)/u, preset: "full" },
  { gpu: /Apple/u, preset: "balanced" },
];

export const presetFor = (gpu: string): Preset => {
  const row = deviceRows.find((each) => each.gpu.test(gpu));
  return presets[row?.preset ?? "lean"];
};

const paces = {
  30: 30,
  60: 60,
} as const satisfies Readonly<Record<FrameRate, number>>;

export const pixelRatioFor = (
  { maxPixels }: Pick<Preset, "maxPixels">,
  dpr: number,
  width: number,
  height: number
): number => {
  const native = Math.min(dpr, MAX_PIXEL_RATIO);
  const area = width * height;
  if (maxPixels === null || area === 0) {
    return native;
  }
  return Math.min(native, Math.sqrt(maxPixels / area));
};

interface Pins {
  readonly pinnedPixelRatio: number;
  readonly pinnedPreset: PresetId | null;
  readonly pinnedRefresh: number;
}

export interface QualityRenderer {
  readonly setPixelRatio: (ratio: number) => void;
  readonly setSize: (
    width: number,
    height: number,
    updateStyle?: boolean
  ) => void;
}

export interface Quality {
  readonly display: { refresh: number };
  readonly preset: Preset;
  readonly pacer: Pacer;
  readonly pinnedPixelRatio: number;
  readonly pinnedRefresh: number;
  readonly readDpr: () => number;
  readonly readRefresh: (now: number) => number;
  appliedDpr: number;
  appliedHeight: number;
  appliedRatio: number;
  appliedWidth: number;
  drawnEpoch: number;
  drawnFrame: number;
  frameRate: FrameRate;
  pace: number;
  pixelRatio: number;
  rendering: boolean;
  sizeEpoch: number;
}

export const createQuality = (
  renderer: Pick<QualityRenderer, "setPixelRatio">,
  { pinnedPixelRatio, pinnedPreset, pinnedRefresh }: Pins,
  readDpr: () => number,
  readGpu: () => string
): Quality => {
  const display = { refresh: pinnedRefresh > 0 ? pinnedRefresh : 60 };
  const preset = pinnedPreset ? presets[pinnedPreset] : presetFor(readGpu());
  const pixelRatio =
    pinnedPixelRatio > 0
      ? pinnedPixelRatio
      : Math.min(readDpr(), MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  return {
    appliedDpr: -1,
    appliedHeight: -1,
    appliedRatio: -1,
    appliedWidth: -1,
    display,
    drawnEpoch: 0,
    drawnFrame: -1,
    frameRate: "60",
    pace: paces[60],
    pacer: createPacer(),
    pinnedPixelRatio,
    pinnedRefresh,
    pixelRatio,
    preset,
    readDpr,
    readRefresh: createRefreshMeter(display.refresh),
    rendering: false,
    sizeEpoch: 0,
  };
};

interface QualityParts {
  readonly canvas: Pick<
    HTMLCanvasElement,
    "clientHeight" | "clientWidth" | "height" | "width"
  >;
  readonly chase: Pick<ChaseCamera, "camera" | "resize">;
  readonly frame: { readonly frameId: number };
  readonly halted: () => boolean;
  readonly pipeline: Pick<Pipeline, "render" | "resize">;
  readonly quality: Quality;
  readonly recorder: Pick<
    Recorder,
    "canvas" | "incompletePass" | "invalidated"
  >;
  readonly renderer: QualityRenderer;
  readonly stage: {
    readonly world: Pick<World, "follow" | "scene">;
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
  recorder,
  renderer,
  stage,
  subject,
}: QualityParts) => {
  const {
    display,
    pacer,
    pinnedPixelRatio,
    pinnedRefresh,
    preset,
    readRefresh,
  } = quality;

  const present = () => {
    quality.rendering = true;
    pipeline.render(stage.world.scene, chase.camera);
    quality.rendering = false;
    quality.drawnEpoch = quality.sizeEpoch;
    quality.drawnFrame = frame.frameId;
  };

  const applySize = () => {
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
    recorder.canvas(
      "observer",
      quality.sizeEpoch,
      canvas.clientWidth,
      canvas.clientHeight,
      canvas.width,
      canvas.height
    );
  };

  const stateOf = (): QualityState => ({
    bloomScale: preset.bloomScale,
    frameRate: quality.frameRate,
    pace: quality.pace,
    pixelRatio: quality.pixelRatio,
    preset: preset.id,
    samples: preset.samples,
    shadowMap: preset.shadowMap,
  });

  const checkPresented = () => {
    if (quality.rendering) {
      quality.rendering = false;
      recorder.incompletePass(quality.drawnFrame + 1);
    }
    if (quality.drawnFrame >= 0 && quality.drawnEpoch !== quality.sizeEpoch) {
      recorder.invalidated(
        quality.drawnFrame,
        quality.drawnEpoch,
        quality.sizeEpoch
      );
      quality.drawnEpoch = quality.sizeEpoch;
    }
  };

  const resize = () => {
    const dpr = quality.readDpr();
    quality.appliedDpr = dpr;
    if (pinnedPixelRatio <= 0) {
      quality.pixelRatio = pixelRatioFor(
        preset,
        dpr,
        canvas.clientWidth,
        canvas.clientHeight
      );
    }
    if (
      canvas.clientWidth === quality.appliedWidth &&
      canvas.clientHeight === quality.appliedHeight &&
      quality.pixelRatio === quality.appliedRatio
    ) {
      return;
    }
    applySize();
    chase.resize(canvas.clientWidth, canvas.clientHeight);
    if (halted() && !stage.warming) {
      stage.world.follow(chase.camera, subject.s);
      present();
    }
  };

  const noteDisplay = (now: number) => {
    if (pinnedRefresh <= 0) {
      display.refresh = readRefresh(now);
    }
    if (quality.readDpr() !== quality.appliedDpr) {
      resize();
    }
  };

  const skipsVsync = (now: number): boolean =>
    pinnedPixelRatio <= 0 && !pacer.due(now, display.refresh, quality.pace);

  const applyFrameRate = (next: FrameRate) => {
    quality.frameRate = next;
    quality.pace = paces[next];
  };

  return {
    applyFrameRate,
    checkPresented,
    noteDisplay,
    present,
    resize,
    skipsVsync,
    stateOf,
  };
};
