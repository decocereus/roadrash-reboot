import { celebrityIds } from "@racer/sim/cast";
import { riderPalette } from "@racer/sim/palette";
import type { RegionId } from "@racer/track/regions";
import * as THREE from "three";

import { celebrityLoader } from "../src/asset-load.ts";
import { browserAssetRuntime } from "../src/asset-runtime.ts";
import { createBikes } from "../src/game/actors.ts";
import type { AcquiredAssets, RiderAsset } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading, figureFloorOf } from "../src/game/cel.ts";
import { bodyFor, paletteOf } from "../src/game/figure-rig.ts";
import { assetParsers, createRenderer } from "../src/game/game.ts";
import { lookOf } from "../src/game/looks.ts";
import { createPipeline } from "../src/game/post.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { Stance } from "../src/game/rider-figure.ts";
import {
  BACKGROUND,
  bandsOf,
  flatsIn,
  identityOf,
  rimShareOf,
  round,
  worldShadeFailures,
} from "./shade-flats.ts";
import type { Bands, Identity } from "./shade-flats.ts";

const PIXEL_RATIO = 2;
const SETTLE_STEPS = 8;
const SHEET_COLUMNS = 3;
const RIDER_BIKE_PAINT = 2;
const OCCLUDER_LAYER = 2;
const SUN_DISTANCE = 8;
const OCCLUDER_DISTANCE = 5;
const OCCLUDER_SIZE = 40;

const lookNames = ["dusk", "night"] as const;
type LookName = (typeof lookNames)[number];

const looks = {
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
  speed: 0,
  time: 0,
  tuck: 0,
  weapon: "none",
};

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

type Subject = "riders" | "bikes" | "palette";

type Sitter =
  | {
      readonly kind: "rider";
      readonly name: string;
      readonly asset: RiderAsset;
      readonly palette: number;
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
  if (subject === "palette") {
    return {
      release: releaseEach([]),
      sitters: riderPalette.map((_colours, palette): Sitter => ({
        asset: bodyFor(assets, palette),
        kind: "rider",
        name: `generic palette ${palette}`,
        palette,
      })),
    };
  }
  if (subject === "bikes") {
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
        palette: 0,
      })),
      { asset: bodyFor(assets, 0), kind: "rider", name: "generic", palette: 0 },
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
  readonly floor: number;
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
      ? createRiderFigure(sitter.asset, shading, paletteOf(sitter.palette))
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
  const occluder = new THREE.Mesh(
    new THREE.PlaneGeometry(OCCLUDER_SIZE, OCCLUDER_SIZE),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  occluder.layers.set(OCCLUDER_LAYER);
  occluder.castShadow = true;
  occluder.position.copy(shading.key).multiplyScalar(OCCLUDER_DISTANCE);
  occluder.lookAt(0, 0, 0);
  light.shadow.camera.layers.enable(OCCLUDER_LAYER);
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
    light.intensity = 1;
    light.castShadow = true;
    light.position.copy(shading.key).multiplyScalar(SUN_DISTANCE);
    scene.add(occluder);
    pipeline.render(scene, camera);
    const world = read();
    return {
      bands: bandsOf(lit, inked, shadow, world, width, height),
      floor: figureFloorOf(look.ink),
      picture,
    };
  } finally {
    occluder.geometry.dispose();
    occluder.material.dispose();
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
      const failures: string[] = [];
      const rims: Record<string, number> = {};
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
          const flats = flatsIn(identity, shot.bands);
          perLook[lookName] = flats;
          const rim = rimShareOf(identity, shot.bands, flats);
          rims[`${sitter.name} ${lookName}`] = rim;
          failures.push(
            ...worldShadeFailures(
              `${sitter.name} ${lookName}`,
              flats,
              identity.counted,
              shot.floor,
              rim
            )
          );
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
        failures,
        notes,
        programs: frame.renderer.info.programs?.length ?? 0,
        results,
        rims,
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

export const check = async (view: View, subject: Subject = "riders") => {
  const outcome = await run(view, subject);
  if (outcome.failures.length > 0) {
    throw new Error(outcome.failures.join("\n"));
  }
  return { rims: outcome.rims, subject, view };
};
