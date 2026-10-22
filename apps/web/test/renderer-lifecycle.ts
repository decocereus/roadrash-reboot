import { trackFor } from "@racer/track/roads";
import type * as THREE from "three";

import { browserAssetRuntime } from "../src/asset-runtime.ts";
import { firstQuickPick, planFor, quickEntry } from "../src/career/flow.ts";
import type { QuickPick } from "../src/career/flow.ts";
import type { AcquiredAssets } from "../src/game/assets.ts";
import { createChaseCamera } from "../src/game/chase-camera.ts";
import { assetParsers, createGame, createRenderer } from "../src/game/game.ts";
import type { GameHandle, RacePlan } from "../src/game/hud.ts";
import { createPipeline } from "../src/game/post.ts";
import type { PrepareOutcome } from "../src/game/preparation.ts";
import { createQuality } from "../src/game/quality-ladder.ts";
import type { Quality } from "../src/game/quality-ladder.ts";
import { createWorld } from "../src/game/world.ts";

const WIDTH = 960;
const HEIGHT = 540;
const SEED = 31;
const WARM_CYCLES = 2;
const COMPARED_CYCLES = 5;
const EVENT_DEADLINE_MS = 10_000;
const ROAD_A: QuickPick["roadId"] = "cinder-wash";
const ROAD_B: QuickPick["roadId"] = "slag-row";

interface Counts {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

type Rung = Quality["ladder"][number];

const countsOf = (renderer: THREE.WebGLRenderer): Counts => ({
  geometries: renderer.info.memory.geometries,
  programs: renderer.info.programs?.length ?? 0,
  textures: renderer.info.memory.textures,
});

const programsOf = (renderer: THREE.WebGLRenderer): readonly string[] =>
  (renderer.info.programs ?? [])
    .map((program) => program.cacheKey.split(",", 1).join(""))
    .toSorted();

const sameCounts = (a: Counts, b: Counts): boolean =>
  a.geometries === b.geometries &&
  a.textures === b.textures &&
  a.programs === b.programs;

const proofCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;z-index:10`;
  const last = document.body.lastChild;
  if (!last) {
    throw new Error("The page has nothing to place the proof canvas after.");
  }
  last.after(canvas);
  return canvas;
};

const repeat = async <Value>(
  times: number,
  step: () => Promise<Value>,
  done: readonly Value[] = []
): Promise<readonly Value[]> => {
  if (done.length === times) {
    return done;
  }
  const value = await step();
  return await repeat(times, step, [...done, value]);
};

const nextEvent = async (target: EventTarget, type: string): Promise<null> => {
  const { promise, reject, resolve } = Promise.withResolvers<null>();
  const listening = new AbortController();
  const deadline = setTimeout(() => {
    listening.abort();
    reject(
      new Error(`No ${type} event arrived within ${EVENT_DEADLINE_MS} ms.`)
    );
  }, EVENT_DEADLINE_MS);
  target.addEventListener(
    type,
    () => {
      clearTimeout(deadline);
      setTimeout(() => {
        resolve(null);
      }, 0);
    },
    { once: true, signal: listening.signal }
  );
  return await promise;
};

const acquire = async (notes: string[]): Promise<AcquiredAssets> => {
  const { promise, reject, resolve } = Promise.withResolvers<AcquiredAssets>();
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

const kindOf = async (
  outcome: Promise<PrepareOutcome>
): Promise<PrepareOutcome["kind"]> => {
  const settled = await outcome;
  return settled.kind;
};

interface CapturedRenderer {
  renderer: THREE.WebGLRenderer | null;
}

const planOf = (roadId: QuickPick["roadId"]): RacePlan =>
  planFor(null, quickEntry({ ...firstQuickPick, roadId }, SEED));

const trackProof = async (game: GameHandle, renderer: THREE.WebGLRenderer) => {
  const outcomes: PrepareOutcome["kind"][] = [];
  const cycle = async (): Promise<Counts> => {
    const away = await kindOf(game.prepare(planOf(ROAD_B)));
    const back = await kindOf(game.prepare(planOf(ROAD_A)));
    outcomes.push(away, back);
    return countsOf(renderer);
  };
  outcomes.push(await kindOf(game.prepare(planOf(ROAD_A))));
  const first = countsOf(renderer);
  const warming = await repeat(WARM_CYCLES, cycle);
  const warmed = warming.at(-1) ?? first;
  const returns = await repeat(COMPARED_CYCLES, cycle);
  return {
    first,
    outcomes,
    returns,
    stable: returns.every((counts) => sameCounts(counts, warmed)),
    warmed,
    warmedPrograms: programsOf(renderer),
    warming,
  };
};

const qualityProof = () => {
  const canvas = proofCanvas();
  const renderer = createRenderer(canvas);
  const { ladder } = createQuality(
    renderer,
    { pinnedPixelRatio: 0, pinnedRefresh: 0, pinnedRung: -1 },
    () => window.devicePixelRatio
  );
  const [high] = ladder;
  const low = ladder.at(-1);
  if (!high || !low) {
    throw new Error("The quality ladder has no rungs.");
  }
  const world = createWorld(trackFor(ROAD_A, 1), low.shadowMap);
  const pipeline = createPipeline(renderer);
  const { camera } = createChaseCamera();
  camera.aspect = WIDTH / HEIGHT;
  camera.position.set(0, 4, -12);
  camera.lookAt(0, 0, 40);
  camera.updateProjectionMatrix();
  pipeline.setLook(world.shading.look);
  pipeline.prepare(world.scene);
  const apply = (rung: Rung): Counts => {
    world.setShadowMap(rung.shadowMap);
    pipeline.setSamples(rung.samples);
    pipeline.setBloomScale(rung.bloomScale);
    renderer.setPixelRatio(rung.pixelRatio);
    renderer.setSize(WIDTH, HEIGHT, false);
    pipeline.resize(WIDTH, HEIGHT, rung.pixelRatio);
    world.follow(camera, 0);
    pipeline.render(world.scene, camera);
    return countsOf(renderer);
  };
  const cycle = () => {
    const atHigh = apply(high);
    const atLow = apply(low);
    return { atHigh, atLow };
  };
  const first = apply(low);
  const warming = Array.from({ length: WARM_CYCLES }, cycle);
  const warmed = warming.at(-1) ?? { atHigh: first, atLow: first };
  const returns = Array.from({ length: COMPARED_CYCLES }, cycle);
  pipeline.dispose();
  world.dispose();
  renderer.dispose();
  canvas.remove();
  return {
    first,
    high: { ...high },
    low: { ...low },
    returns,
    stable: returns.every(
      ({ atHigh, atLow }) =>
        sameCounts(atHigh, warmed.atHigh) && sameCounts(atLow, warmed.atLow)
    ),
    warmed,
    warming,
  };
};

const lossProof = async (
  game: GameHandle,
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  warmed: Counts
) => {
  const control = renderer.getContext().getExtension("WEBGL_lose_context");
  if (!control) {
    return { available: false } as const;
  }
  const lose = async () => {
    const lost = nextEvent(canvas, "webglcontextlost");
    control.loseContext();
    await lost;
    return renderer.getContext().isContextLost();
  };
  const restore = async () => {
    const restored = nextEvent(canvas, "webglcontextrestored");
    control.restoreContext();
    await restored;
    return renderer.getContext().isContextLost();
  };
  const plain = async () => {
    const lostAfterLoss = await lose();
    const lostAfterRestore = await restore();
    const prepared = await kindOf(game.prepare(planOf(ROAD_A)));
    return {
      counts: countsOf(renderer),
      lostAfterLoss,
      lostAfterRestore,
      prepared,
      programs: programsOf(renderer),
    };
  };
  const startWhileLost = async () => {
    const lostAfterLoss = await lose();
    const whileLost = await kindOf(game.prepare(planOf(ROAD_B)));
    const lostAfterRestore = await restore();
    return { lostAfterLoss, lostAfterRestore, whileLost };
  };
  const duringPreparation = async () => {
    const pending = game.prepare(planOf(ROAD_B));
    const lostAfterLoss = await lose();
    const pendingOutcome = await kindOf(pending);
    const lostAfterRestore = await restore();
    const prepared = await kindOf(game.prepare(planOf(ROAD_A)));
    return {
      counts: countsOf(renderer),
      lostAfterLoss,
      lostAfterRestore,
      pendingOutcome,
      prepared,
    };
  };
  const first = await startWhileLost();
  const second = await duringPreparation();
  const third = await plain();
  return {
    available: true,
    cycles: [first, second, third],
    matchesWarmed: [second, third].map(({ counts }) =>
      sameCounts(counts, warmed)
    ),
  } as const;
};

export const run = async () => {
  const notes: string[] = [];
  const hud = { publications: 0 };
  const canvas = proofCanvas();
  const acquired = await acquire(notes);
  const held: CapturedRenderer = { renderer: null };
  const game = createGame(
    canvas,
    {
      onHud: () => {
        hud.publications += 1;
      },
      onOver: () => {
        notes.push("over");
      },
      onSettle: () => {
        notes.push("settle");
      },
      onStart: () => {
        notes.push("start");
      },
    },
    acquired,
    (target) => {
      const renderer = createRenderer(target);
      held.renderer = renderer;
      return renderer;
    }
  );
  const { renderer } = held;
  if (!renderer) {
    throw new Error("The game did not make its renderer.");
  }
  const tracks = await trackProof(game, renderer);
  const quality = qualityProof();
  const loss = await lossProof(game, renderer, canvas, tracks.warmed);
  const beforeDispose = countsOf(renderer);
  game.dispose();
  const afterDispose = countsOf(renderer);
  const keptPrograms = programsOf(renderer);
  game.dispose();
  canvas.remove();
  return {
    disposal: {
      afterDispose,
      beforeDispose,
      disposedTwice: true,
      keptPrograms,
    },
    hud,
    loss,
    notes,
    quality,
    tracks,
  };
};
