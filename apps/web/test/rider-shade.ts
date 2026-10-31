import { riderPalette } from "@racer/sim/palette";
import type { RegionId } from "@racer/track/regions";
import * as THREE from "three";

import { celebrityLoader } from "../src/asset-load.ts";
import { browserAssetRuntime } from "../src/asset-runtime.ts";
import { createBikes } from "../src/game/actors.ts";
import type { AcquiredAssets, RiderAsset } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { bodyFor } from "../src/game/figure-rig.ts";
import { celebrityIds } from "../src/game/figure-wear.ts";
import { assetParsers, createRenderer } from "../src/game/game.ts";
import { lookOf } from "../src/game/looks.ts";
import { createPipeline } from "../src/game/post.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { Stance } from "../src/game/rider-figure.ts";

const PIXEL_RATIO = 2;
const SETTLE_STEPS = 8;
const CLUSTERS = 16;
const ROUNDS = 16;
const SAMPLE_LIMIT = 24_000;
const BACKGROUND = "#3a3a3a";
const BAND_STEP = 0.02;
const SHEET_COLUMNS = 3;
const HUE_FLOOR = 0.03;
const INK_TOLERANCE = 3;
const RIDER_BIKE_PAINT = 2;

const lookNames = ["dusk", "night", "dawn"] as const;
type LookName = (typeof lookNames)[number];

const looks = {
  dawn: "cinder-flats",
  dusk: "salt-coast",
  night: "lowtown",
} as const satisfies Record<LookName, RegionId>;

const views = {
  bike: {
    eye: new THREE.Vector3(-2.6, 1.5, -2.9),
    fov: 34,
    height: 300,
    target: new THREE.Vector3(0, 0.62, 0.05),
    width: 400,
  },
  chase: {
    eye: new THREE.Vector3(0.4, 2.3, 7.6),
    fov: 48,
    height: 790,
    target: new THREE.Vector3(0, 1.05, 0),
    width: 420,
  },
  portrait: {
    eye: new THREE.Vector3(-1.5, 1.6, -2.3),
    fov: 30,
    height: 300,
    target: new THREE.Vector3(0, 1.15, 0.05),
    width: 360,
  },
} as const;

type View = keyof typeof views;

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

type Lab = readonly [number, number, number];

const linearOf = (byte: number): number => {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const labOf = (red: number, green: number, blue: number): Lab => {
  const r = linearOf(red);
  const g = linearOf(green);
  const b = linearOf(blue);
  const l = Math.cbrt(0.412221471 * r + 0.536332536 * g + 0.051445993 * b);
  const m = Math.cbrt(0.211903498 * r + 0.680699545 * g + 0.107396957 * b);
  const s = Math.cbrt(0.088302462 * r + 0.281718838 * g + 0.629978701 * b);
  return [
    0.210454255 * l + 0.793617785 * m - 0.004072047 * s,
    1.977998495 * l - 2.428592205 * m + 0.45059371 * s,
    0.025904037 * l + 0.782771766 * m - 0.808675766 * s,
  ];
};

const lchOf = (lab: Lab) => ({
  c: Math.hypot(lab[1], lab[2]),
  h: (THREE.MathUtils.radToDeg(Math.atan2(lab[2], lab[1])) + 360) % 360,
  l: lab[0],
});

const hueGap = (from: number, to: number): number => {
  const gap = Math.abs(from - to) % 360;
  return gap > 180 ? 360 - gap : gap;
};

const distance = (a: Lab, b: Lab): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const meanOf = (labs: readonly Lab[]): Lab => {
  let l = 0;
  let a = 0;
  let b = 0;
  for (const lab of labs) {
    l += lab[0];
    a += lab[1];
    b += lab[2];
  }
  const count = Math.max(labs.length, 1);
  return [l / count, a / count, b / count];
};

const round = (value: number, places = 3): number =>
  Math.round(value * 10 ** places) / 10 ** places;

interface Bands {
  readonly valid: Uint8Array;
  readonly lit: readonly Lab[];
  readonly shadow: readonly Lab[];
}

const labAt = (pixels: Uint8Array, pixel: number): Lab =>
  labOf(
    pixels[pixel * 4] ?? 0,
    pixels[pixel * 4 + 1] ?? 0,
    pixels[pixel * 4 + 2] ?? 0
  );

const clearOfInk = (
  lit: Uint8Array,
  inked: Uint8Array,
  pixel: number
): boolean => {
  let gap = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    gap += Math.abs(
      (lit[pixel * 4 + channel] ?? 0) - (inked[pixel * 4 + channel] ?? 0)
    );
  }
  return gap <= INK_TOLERANCE;
};

const quantile = (values: readonly number[], at: number): number | null => {
  const sorted = values.toSorted((a, b) => a - b);
  const value = sorted[Math.floor((sorted.length - 1) * at)];
  return value === undefined ? null : round(value, 1);
};

const backgroundLab = labOf(
  Number.parseInt(BACKGROUND.slice(1, 3), 16),
  Number.parseInt(BACKGROUND.slice(3, 5), 16),
  Number.parseInt(BACKGROUND.slice(5, 7), 16)
);

const bandsOf = (
  lit: Uint8Array,
  inked: Uint8Array,
  shadow: Uint8Array,
  width: number,
  height: number
): Bands => {
  const banded = new Uint8Array(width * height);
  const litLabs: Lab[] = Array.from({ length: width * height });
  const shadowLabs: Lab[] = Array.from({ length: width * height });
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const litLab = labAt(lit, pixel);
    const shadowLab = labAt(shadow, pixel);
    litLabs[pixel] = litLab;
    shadowLabs[pixel] = shadowLab;
    const onSubject =
      clearOfInk(lit, inked, pixel) &&
      distance(litLab, backgroundLab) > BAND_STEP &&
      distance(shadowLab, backgroundLab) > BAND_STEP;
    banded[pixel] = onSubject && litLab[0] - shadowLab[0] > BAND_STEP ? 1 : 0;
  }
  const valid = new Uint8Array(width * height);
  for (let row = 1; row < height - 1; row += 1) {
    for (let column = 1; column < width - 1; column += 1) {
      const pixel = row * width + column;
      valid[pixel] =
        banded[pixel] === 1 &&
        banded[pixel - 1] === 1 &&
        banded[pixel + 1] === 1 &&
        banded[pixel - width] === 1 &&
        banded[pixel + width] === 1
          ? 1
          : 0;
    }
  }
  return { lit: litLabs, shadow: shadowLabs, valid };
};

const nearestOf = (centres: readonly Lab[], lab: Lab): number => {
  let best = 0;
  let gap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centres.length; index += 1) {
    const centre = centres[index];
    if (centre && distance(centre, lab) < gap) {
      gap = distance(centre, lab);
      best = index;
    }
  }
  return best;
};

const centresOf = (sample: readonly Lab[]): Lab[] => {
  const byLightness = sample.toSorted((a, b) => a[0] - b[0]);
  const first = byLightness[Math.floor(byLightness.length / 2)];
  if (!first) {
    return [];
  }
  const centres: Lab[] = [first];
  while (centres.length < CLUSTERS) {
    let farthest = first;
    let gap = -1;
    for (const lab of sample) {
      const nearest = distance(centres[nearestOf(centres, lab)] ?? first, lab);
      if (nearest > gap) {
        gap = nearest;
        farthest = lab;
      }
    }
    centres.push(farthest);
  }
  for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
    const members: Lab[][] = centres.map(() => []);
    for (const lab of sample) {
      members[nearestOf(centres, lab)]?.push(lab);
    }
    for (let index = 0; index < centres.length; index += 1) {
      const group = members[index];
      if (group && group.length > 0) {
        centres[index] = meanOf(group);
      }
    }
  }
  return centres;
};

interface Identity {
  readonly centres: readonly Lab[];
  readonly flatOf: Int16Array;
  readonly counted: number;
}

const identityOf = (reference: Bands): Identity => {
  const sample: Lab[] = [];
  let counted = 0;
  for (const valid of reference.valid) {
    counted += valid;
  }
  const stride = Math.max(1, Math.floor(counted / SAMPLE_LIMIT));
  let seen = 0;
  for (let pixel = 0; pixel < reference.valid.length; pixel += 1) {
    const lab = reference.lit[pixel];
    if (reference.valid[pixel] === 1 && lab) {
      if (seen % stride === 0) {
        sample.push(lab);
      }
      seen += 1;
    }
  }
  const centres = centresOf(sample);
  const flatOf = new Int16Array(reference.valid.length).fill(-1);
  for (let pixel = 0; pixel < reference.valid.length; pixel += 1) {
    const lab = reference.lit[pixel];
    if (reference.valid[pixel] === 1 && lab) {
      flatOf[pixel] = nearestOf(centres, lab);
    }
  }
  return { centres, counted, flatOf };
};

const lchRounded = (lab: Lab) => {
  const lch = lchOf(lab);
  return {
    c: round(lch.c),
    h: round(lch.h, 1),
    l: round(lch.l),
    lab: lab.map((value) => round(value, 4)),
  };
};

const flatsIn = (identity: Identity, bands: Bands) =>
  identity.centres.map((_centre, flat) => {
    const lit: Lab[] = [];
    const shadow: Lab[] = [];
    const gaps: number[] = [];
    for (let pixel = 0; pixel < bands.valid.length; pixel += 1) {
      const litLab = bands.lit[pixel];
      const shadowLab = bands.shadow[pixel];
      if (
        identity.flatOf[pixel] === flat &&
        bands.valid[pixel] === 1 &&
        litLab &&
        shadowLab
      ) {
        lit.push(litLab);
        shadow.push(shadowLab);
        const litLch = lchOf(litLab);
        const shadowLch = lchOf(shadowLab);
        if (litLch.c >= HUE_FLOOR && shadowLch.c >= HUE_FLOOR) {
          gaps.push(hueGap(litLch.h, shadowLch.h));
        }
      }
    }
    const litMean = meanOf(lit);
    const shadowMean = meanOf(shadow);
    return {
      drift: round(hueGap(lchOf(litMean).h, lchOf(shadowMean).h), 1),
      lit: lchRounded(litMean),
      pixelDrift: {
        counted: gaps.length,
        median: quantile(gaps, 0.5),
        p90: quantile(gaps, 0.9),
      },
      pixels: lit.length,
      shadow: lchRounded(shadowMean),
    };
  });

const acquire = async (
  notes: string[]
): Promise<Pick<AcquiredAssets, "assets" | "release">> => {
  const { promise, reject, resolve } =
    Promise.withResolvers<Pick<AcquiredAssets, "assets" | "release">>();
  browserAssetRuntime().mount({
    failed: reject,
    fontFallback: (error) => {
      notes.push(`fonts: ${error.message}`);
    },
    interrupted: () => {
      reject(new Error("The asset load was interrupted."));
    },
    loaded: (assets, release) => {
      resolve({ assets, release });
    },
    parsers: assetParsers,
    signal: new AbortController().signal,
  });
  return await promise;
};

const sheetCanvas = (
  rows: number,
  width: number,
  height: number
): CanvasRenderingContext2D => {
  const canvas = document.createElement("canvas");
  canvas.width = width * SHEET_COLUMNS;
  canvas.height = height * rows;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The shade sheet has no 2D context.");
  }
  context.font = `${13 * PIXEL_RATIO}px sans-serif`;
  context.fillStyle = "#fff";
  return context;
};

type Subject = "riders" | "bikes";

type Sitter =
  | {
      readonly kind: "rider";
      readonly name: string;
      readonly asset: RiderAsset;
    }
  | {
      readonly kind: "bike";
      readonly name: string;
      readonly model: BikeModelId;
      readonly paint: number;
    };

const releaseEach =
  (held: readonly { readonly release: () => void }[]) => (): void => {
    for (const each of held) {
      each.release();
    }
  };

const castOf = async (
  subject: Subject,
  assets: AcquiredAssets["assets"]
): Promise<{ sitters: Sitter[]; release: () => void }> => {
  if (subject !== "riders") {
    return {
      release: releaseEach([]),
      sitters: riderPalette.flatMap((_colours, paint): Sitter[] => {
        const model = bikeModelIds[paint % bikeModelIds.length];
        return model
          ? [{ kind: "bike", model, name: `${model} paint ${paint}`, paint }]
          : [];
      }),
    };
  }
  const load = celebrityLoader(
    browserAssetRuntime().mountCelebrity,
    Promise.resolve({ assetParsers })
  );
  const aborting = new AbortController();
  const settled = await Promise.allSettled(
    celebrityIds.map(async (id) => ({
      id,
      worn: await load(id, aborting.signal),
    }))
  );
  const held = settled.flatMap((outcome) =>
    outcome.status === "fulfilled" && outcome.value.worn
      ? [{ id: outcome.value.id, worn: outcome.value.worn }]
      : []
  );
  const release = releaseEach(held.map(({ worn }) => worn));
  if (held.length < celebrityIds.length) {
    aborting.abort();
    release();
    throw new Error("A celebrity model did not load.");
  }
  return {
    release,
    sitters: [
      ...held.map(({ id, worn }): Sitter => ({
        asset: worn.value,
        kind: "rider",
        name: id,
      })),
      { asset: bodyFor(assets, 0), kind: "rider", name: "generic" },
    ],
  };
};

interface Frame {
  readonly renderer: THREE.WebGLRenderer;
  readonly pipeline: ReturnType<typeof createPipeline>;
  readonly camera: THREE.PerspectiveCamera;
  readonly width: number;
  readonly height: number;
}

const frameFor = (view: View): Frame => {
  const frame = views[view];
  const renderer = createRenderer(document.createElement("canvas"));
  renderer.shadowMap.autoUpdate = true;
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(frame.width, frame.height, false);
  const pipeline = createPipeline(renderer);
  pipeline.resize(frame.width, frame.height, PIXEL_RATIO);
  const camera = new THREE.PerspectiveCamera(
    frame.fov,
    frame.width / frame.height,
    0.1,
    60
  );
  camera.position.copy(frame.eye);
  camera.lookAt(frame.target);
  camera.updateMatrixWorld();
  return {
    camera,
    height: frame.height * PIXEL_RATIO,
    pipeline,
    renderer,
    width: frame.width * PIXEL_RATIO,
  };
};

interface Shot {
  readonly bands: Bands;
  readonly picture: HTMLCanvasElement;
}

const shoot = (
  frame: Frame,
  assets: AcquiredAssets["assets"],
  sitter: Sitter,
  lookName: LookName
): Shot => {
  const { camera, height, pipeline, renderer, width } = frame;
  const look = lookOf(looks[lookName]);
  const shading = createShading(look);
  shading.aim(camera);
  const bikes = createBikes(
    assets,
    shading,
    bikeModelIds.map((model) => ({
      model,
      paint: sitter.kind === "bike" ? sitter.paint : RIDER_BIKE_PAINT,
      police: false,
    }))
  );
  const figure =
    sitter.kind === "rider"
      ? createRiderFigure(sitter.asset, shading, 0)
      : null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const light = new THREE.DirectionalLight(shading.sun, 1);
  scene.add(
    new THREE.AmbientLight(shading.ambient, 1),
    light,
    light.target,
    bikes.group
  );
  const gl = renderer.getContext();
  const read = () => {
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  try {
    if (figure) {
      scene.add(figure.root);
      figure.root.translateY(figure.seat.y);
      figure.root.translateZ(figure.seat.z);
      for (let step = 0; step < SETTLE_STEPS; step += 1) {
        figure.animate(stance, 1);
      }
      figure.root.updateMatrixWorld(true);
    }
    bikes.show(sitter.kind === "bike" ? bikeModelIds.indexOf(sitter.model) : 1);
    bikes.commit(new THREE.Vector3());
    pipeline.prepare(scene);
    pipeline.setLook(look);
    light.castShadow = true;
    light.position.copy(shading.key).multiplyScalar(8);
    pipeline.render(scene, camera);
    const picture = document.createElement("canvas");
    picture.width = width;
    picture.height = height;
    picture.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
    bikes.group.visible = sitter.kind === "bike";
    light.castShadow = false;
    light.position.copy(camera.position);
    pipeline.setLook({ ...look, bloom: 0, ink: "#ffffff" });
    pipeline.render(scene, camera);
    const inked = read();
    pipeline.setLook({ ...look, bloom: 0, ink: "#000000" });
    pipeline.render(scene, camera);
    const lit = read();
    light.intensity = 0;
    pipeline.render(scene, camera);
    const shadow = read();
    return { bands: bandsOf(lit, inked, shadow, width, height), picture };
  } finally {
    light.dispose();
    figure?.dispose();
    bikes.dispose();
    shading.dispose();
  }
};

export const run = async (view: View, subject: Subject = "riders") => {
  const notes: string[] = [];
  const { assets, release } = await acquire(notes);
  const frame = frameFor(view);
  try {
    const cast = await castOf(subject, assets);
    try {
      const sheet = sheetCanvas(cast.sitters.length, frame.width, frame.height);
      const results: Record<
        string,
        {
          counted: number;
          flats: {
            share: number;
            looks: Partial<
              Record<LookName, ReturnType<typeof flatsIn>[number]>
            >;
          }[];
        }
      > = {};
      for (let row = 0; row < cast.sitters.length; row += 1) {
        const sitter = cast.sitters[row];
        if (!sitter) {
          continue;
        }
        let identity: Identity | null = null;
        const perLook: Partial<Record<LookName, ReturnType<typeof flatsIn>>> =
          {};
        for (let column = 0; column < lookNames.length; column += 1) {
          const lookName = lookNames[column];
          if (!lookName) {
            continue;
          }
          const shot = shoot(frame, assets, sitter, lookName);
          identity ??= identityOf(shot.bands);
          perLook[lookName] = flatsIn(identity, shot.bands);
          sheet.drawImage(
            shot.picture,
            column * frame.width,
            row * frame.height
          );
          sheet.fillText(
            `${sitter.name} ${lookName}`,
            column * frame.width + 8 * PIXEL_RATIO,
            row * frame.height + 18 * PIXEL_RATIO
          );
        }
        const named = identity;
        if (named) {
          results[sitter.name] = {
            counted: named.counted,
            flats: named.centres.map((_centre, flat) => ({
              looks: Object.fromEntries(
                lookNames.map((lookName) => [
                  lookName,
                  perLook[lookName]?.[flat],
                ])
              ),
              share: round((perLook.dusk?.[flat]?.pixels ?? 0) / named.counted),
            })),
          };
        }
      }
      return {
        notes,
        programs: frame.renderer.info.programs?.length ?? 0,
        results,
        sheet: sheet.canvas.toDataURL("image/png"),
        subject,
        view,
      };
    } finally {
      cast.release();
    }
  } finally {
    frame.pipeline.dispose();
    frame.renderer.dispose();
    release();
  }
};
