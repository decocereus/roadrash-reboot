import type { RegionId } from "@racer/track/regions";
import * as THREE from "three";

import { celebrityLoader } from "../src/asset-load.ts";
import { browserAssetRuntime } from "../src/asset-runtime.ts";
import { createBikes } from "../src/game/actors.ts";
import type { AcquiredAssets, RiderAsset } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import type { Shading } from "../src/game/cel.ts";
import { bodyFor } from "../src/game/figure-rig.ts";
import { celebrityIds } from "../src/game/figure-wear.ts";
import { assetParsers, createRenderer } from "../src/game/game.ts";
import { lookOf } from "../src/game/looks.ts";
import { createPipeline } from "../src/game/post.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { Stance } from "../src/game/rider-figure.ts";

const PIXEL_RATIO = 2;
const SETTLE_STEPS = 8;
const CLUSTERS = 8;
const ROUNDS = 16;
const SAMPLE_LIMIT = 24_000;
const MIN_SHARE = 0.01;
const BACKGROUND = "#3a3a3a";
const BAND_STEP = 0.02;
const SHEET_COLUMNS = 3;
const HUE_FLOOR = 0.03;
const INK_TOLERANCE = 3;

const lookNames = ["dawn", "dusk", "night"] as const;
type LookName = (typeof lookNames)[number];

const looks = {
  dawn: "cinder-flats",
  dusk: "salt-coast",
  night: "lowtown",
} as const satisfies Record<LookName, RegionId>;

const views = {
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

interface Pair {
  readonly lit: Lab;
  readonly shadow: Lab;
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

const pairsOf = (
  lit: Uint8Array,
  inked: Uint8Array,
  shadow: Uint8Array,
  width: number,
  height: number
): Pair[] => {
  const background = new THREE.Color(BACKGROUND);
  const backgroundLab = labOf(
    background.r * 255,
    background.g * 255,
    background.b * 255
  );
  const banded = new Uint8Array(width * height);
  const litLabs: Lab[] = Array.from({ length: width * height });
  const shadowLabs: Lab[] = Array.from({ length: width * height });
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const litLab = labAt(lit, pixel);
    const shadowLab = labAt(shadow, pixel);
    litLabs[pixel] = litLab;
    shadowLabs[pixel] = shadowLab;
    const onRider =
      clearOfInk(lit, inked, pixel) &&
      distance(litLab, backgroundLab) > BAND_STEP &&
      distance(shadowLab, backgroundLab) > BAND_STEP;
    banded[pixel] = onRider && litLab[0] - shadowLab[0] > BAND_STEP ? 1 : 0;
  }
  const pairs: Pair[] = [];
  for (let row = 1; row < height - 1; row += 1) {
    for (let column = 1; column < width - 1; column += 1) {
      const pixel = row * width + column;
      const inside =
        banded[pixel] === 1 &&
        banded[pixel - 1] === 1 &&
        banded[pixel + 1] === 1 &&
        banded[pixel - width] === 1 &&
        banded[pixel + width] === 1;
      const litLab = litLabs[pixel];
      const shadowLab = shadowLabs[pixel];
      if (inside && litLab && shadowLab) {
        pairs.push({ lit: litLab, shadow: shadowLab });
      }
    }
  }
  return pairs;
};

const clustersOf = (pairs: readonly Pair[]) => {
  const stride = Math.max(1, Math.floor(pairs.length / SAMPLE_LIMIT));
  const sample = pairs.filter((_pair, index) => index % stride === 0);
  const byLightness = sample.toSorted((a, b) => a.lit[0] - b.lit[0]);
  const first = byLightness[Math.floor(byLightness.length / 2)];
  if (!first) {
    return [];
  }
  const centres: Lab[] = [first.lit];
  while (centres.length < CLUSTERS) {
    let farthest = first.lit;
    let gap = -1;
    for (const pair of sample) {
      const nearest = Math.min(
        ...centres.map((centre) => distance(centre, pair.lit))
      );
      if (nearest > gap) {
        gap = nearest;
        farthest = pair.lit;
      }
    }
    centres.push(farthest);
  }
  const nearestCentre = (lab: Lab): number => {
    let best = 0;
    for (let index = 1; index < centres.length; index += 1) {
      const centre = centres[index];
      const bestCentre = centres[best];
      if (
        centre &&
        bestCentre &&
        distance(centre, lab) < distance(bestCentre, lab)
      ) {
        best = index;
      }
    }
    return best;
  };
  for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
    const members: Lab[][] = centres.map(() => []);
    for (const pair of sample) {
      members[nearestCentre(pair.lit)]?.push(pair.lit);
    }
    for (let index = 0; index < centres.length; index += 1) {
      const group = members[index];
      if (group && group.length > 0) {
        centres[index] = meanOf(group);
      }
    }
  }
  const lit: Lab[][] = centres.map(() => []);
  const shadow: Lab[][] = centres.map(() => []);
  const gaps: number[][] = centres.map(() => []);
  for (const pair of pairs) {
    const index = nearestCentre(pair.lit);
    lit[index]?.push(pair.lit);
    shadow[index]?.push(pair.shadow);
    const litLch = lchOf(pair.lit);
    const shadowLch = lchOf(pair.shadow);
    if (litLch.c >= HUE_FLOOR && shadowLch.c >= HUE_FLOOR) {
      gaps[index]?.push(hueGap(litLch.h, shadowLch.h));
    }
  }

  return centres
    .map((_centre, index) => {
      const litMean = meanOf(lit[index] ?? []);
      const shadowMean = meanOf(shadow[index] ?? []);
      const litLch = lchOf(litMean);
      const shadowLch = lchOf(shadowMean);
      return {
        drift: round(hueGap(litLch.h, shadowLch.h), 1),
        lit: {
          c: round(litLch.c),
          h: round(litLch.h, 1),
          l: round(litLch.l),
          lab: litMean.map((value) => round(value, 4)),
        },
        pixelDrift: {
          counted: gaps[index]?.length ?? 0,
          median: quantile(gaps[index] ?? [], 0.5),
          p90: quantile(gaps[index] ?? [], 0.9),
        },
        shadow: {
          c: round(shadowLch.c),
          h: round(shadowLch.h, 1),
          l: round(shadowLch.l),
        },
        share: round((lit[index]?.length ?? 0) / pairs.length),
      };
    })
    .filter((cluster) => cluster.share >= MIN_SHARE)
    .toSorted((a, b) => b.share - a.share);
};

const measured = (pairs: readonly Pair[]) => ({
  clusters: clustersOf(pairs),
  pixels: pairs.length,
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

type Subject = "riders" | "bikes" | "bikes-as-riders";

type Sitter =
  | {
      readonly kind: "rider";
      readonly name: string;
      readonly asset: RiderAsset;
    }
  | { readonly kind: "bike"; readonly name: BikeModelId };

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
      sitters: bikeModelIds.map((name) => ({ kind: "bike", name })),
    };
  }
  const load = celebrityLoader(
    browserAssetRuntime().mountCelebrity,
    Promise.resolve({ assetParsers })
  );
  const { signal } = new AbortController();
  const worn = await Promise.all(
    celebrityIds.map(async (id) => {
      const loaded = await load(id, signal);
      if (!loaded) {
        throw new Error(`The ${id} model did not load.`);
      }
      return { id, worn: loaded };
    })
  );
  return {
    release: releaseEach(worn.map(({ worn: loaded }) => loaded)),
    sitters: [
      ...worn.map(({ id, worn: loaded }): Sitter => ({
        asset: loaded.value,
        kind: "rider",
        name: id,
      })),
      { asset: bodyFor(assets, 0), kind: "rider", name: "generic" },
    ],
  };
};

const bikeShading = (shading: Shading, subject: Subject): Shading =>
  subject === "bikes-as-riders"
    ? { ...shading, paint: shading.figure }
    : shading;

export const run = async (view: View, subject: Subject = "riders") => {
  const notes: string[] = [];
  const { assets, release } = await acquire(notes);
  const cast = await castOf(subject, assets);
  const renderer = createRenderer(document.createElement("canvas"));
  renderer.shadowMap.autoUpdate = true;
  const frame = views[view];
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(frame.width, frame.height, false);
  const pipeline = createPipeline(renderer);
  pipeline.resize(frame.width, frame.height, PIXEL_RATIO);
  const gl = renderer.getContext();
  const width = frame.width * PIXEL_RATIO;
  const height = frame.height * PIXEL_RATIO;
  const litPixels = new Uint8Array(width * height * 4);
  const inkedPixels = new Uint8Array(width * height * 4);
  const shadowPixels = new Uint8Array(width * height * 4);
  const read = (into: Uint8Array) => {
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, into);
  };
  const camera = new THREE.PerspectiveCamera(
    frame.fov,
    frame.width / frame.height,
    0.1,
    60
  );
  camera.position.copy(frame.eye);
  camera.lookAt(frame.target);
  camera.updateMatrixWorld();
  const sheet = sheetCanvas(cast.sitters.length, width, height);
  const results: Record<
    string,
    Partial<Record<LookName, ReturnType<typeof measured>>>
  > = {};
  try {
    for (let column = 0; column < lookNames.length; column += 1) {
      const lookName = lookNames[column];
      if (!lookName) {
        continue;
      }
      const look = lookOf(looks[lookName]);
      const shading = createShading(look);
      shading.aim(camera);
      const bikes = createBikes(
        assets,
        bikeShading(shading, subject),
        bikeModelIds.map((model) => ({ model, paint: 2, police: false }))
      );
      for (let row = 0; row < cast.sitters.length; row += 1) {
        const sitter = cast.sitters[row];
        if (!sitter) {
          continue;
        }
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
        if (figure) {
          scene.add(figure.root);
          figure.root.translateY(figure.seat.y);
          figure.root.translateZ(figure.seat.z);
          for (let step = 0; step < SETTLE_STEPS; step += 1) {
            figure.animate(stance, 1);
          }
          figure.root.updateMatrixWorld(true);
        }
        bikes.show(
          sitter.kind === "bike" ? bikeModelIds.indexOf(sitter.name) : 1
        );
        bikes.commit(new THREE.Vector3());
        pipeline.prepare(scene);

        pipeline.setLook(look);
        light.castShadow = true;
        light.position.copy(shading.key).multiplyScalar(8);
        pipeline.render(scene, camera);
        sheet.drawImage(renderer.domElement, column * width, row * height);
        sheet.fillText(
          `${sitter.name} ${lookName}`,
          column * width + 8 * PIXEL_RATIO,
          row * height + 18 * PIXEL_RATIO
        );

        bikes.group.visible = sitter.kind === "bike";
        light.castShadow = false;
        light.position.copy(camera.position);
        pipeline.setLook({ ...look, bloom: 0, ink: "#ffffff" });
        pipeline.render(scene, camera);
        read(inkedPixels);
        pipeline.setLook({ ...look, bloom: 0, ink: "#000000" });
        pipeline.render(scene, camera);
        read(litPixels);
        light.intensity = 0;
        pipeline.render(scene, camera);
        read(shadowPixels);
        bikes.group.visible = true;
        const pairs = pairsOf(
          litPixels,
          inkedPixels,
          shadowPixels,
          width,
          height
        );
        results[sitter.name] = {
          ...results[sitter.name],
          [lookName]: measured(pairs),
        };
        scene.remove(bikes.group);
        light.dispose();
        figure?.dispose();
      }
      bikes.dispose();
      shading.dispose();
    }
    return {
      notes,
      programs: renderer.info.programs?.length ?? 0,
      results,
      sheet: sheet.canvas.toDataURL("image/png"),
      subject,
      view,
    };
  } finally {
    pipeline.dispose();
    renderer.dispose();
    cast.release();
    release();
  }
};
