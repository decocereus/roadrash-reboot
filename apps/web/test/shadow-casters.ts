import { recordedRules } from "@racer/career/bench";
import * as THREE from "three";

import { firstQuickPick, planFor, quickEntry } from "../src/career/flow.ts";
import { createGame, createRenderer } from "../src/game/game.ts";
import type { GameHandle, HudState } from "../src/game/hud.ts";
import { isInstancedMesh } from "../src/game/meshes.ts";
import { acquire } from "./renderer-lifecycle.ts";

const WIDTH = 960;
const HEIGHT = 540;
const NUDGE = 2;
const SEED = 31;
const SETTLE_FRAMES = 3;
const RIDE_FRAMES = 40_000;
const MIN_COMPARED = 300;
const WALKER_REACH = 2.21;
const SPOTS = [560, 1850, 3500] as const;
const EDGE = -1;
const plan = planFor(
  recordedRules,
  null,
  quickEntry({ ...firstQuickPick, roadId: "breakwater-run", tier: 3 }, SEED)
);

interface Watch {
  readonly mesh: THREE.InstancedMesh;
  readonly walker: boolean;
  classifiedWith: THREE.Matrix4 | null;
  before: number;
  casting: number;
  everyInstance: boolean;
}

interface Ledger {
  compared: number;
  lateCamera: string[];
  unrestored: number;
  drawn: number;
  casting: number;
  missedCasters: number;
  missedWhere: string[];
}

interface Spot {
  readonly at: number;
  readonly s: number;
  readonly edgeWalkers: number;
  readonly changedFromEveryCaster: number;
  readonly actorShadowPixels: number;
}

interface Held {
  capture: boolean;
  pixels: Uint8Array;
  frame: number;
  camera: THREE.Camera | null;
  hud: HudState | null;
}

interface Ride {
  readonly spots: Spot[];
  readonly due: number[];
  edgeDone: boolean;
}

const viewOf = ({
  shadow: { camera },
}: THREE.DirectionalLight): THREE.Matrix4 =>
  new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );

const sunIn = (scene: THREE.Object3D): THREE.DirectionalLight | null => {
  const suns: THREE.DirectionalLight[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.DirectionalLight && node.castShadow) {
      suns.push(node);
    }
  });
  return suns[0] ?? null;
};

const nextFrame = async (): Promise<number> => {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  return await promise;
};

const frames = async (count: number): Promise<void> => {
  if (count > 0) {
    await nextFrame();
    await frames(count - 1);
  }
};

const pixelsApart = (a: Uint8Array, b: Uint8Array): number => {
  let apart = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (
      a[index] !== b[index] ||
      a[index + 1] !== b[index + 1] ||
      a[index + 2] !== b[index + 2]
    ) {
      apart += 1;
    }
  }
  return apart;
};

const metresOf = (hud: HudState | null): number =>
  hud ? hud.roadLength - hud.distanceLeft : 0;

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

const straddles = (
  at: THREE.Vector3,
  shadow: THREE.OrthographicCamera
): boolean => {
  const nearSide =
    Math.min(
      Math.abs(at.x - shadow.left),
      Math.abs(at.x - shadow.right),
      Math.abs(at.y - shadow.bottom),
      Math.abs(at.y - shadow.top)
    ) < WALKER_REACH;
  return (
    nearSide &&
    at.x > shadow.left - WALKER_REACH &&
    at.x < shadow.right + WALKER_REACH &&
    at.y > shadow.bottom - WALKER_REACH &&
    at.y < shadow.top + WALKER_REACH
  );
};

const createWatches = (ledger: Ledger) => {
  const watches = new Map<THREE.InstancedMesh, Watch>();
  let sun: THREE.DirectionalLight | null = null;
  const matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const box = new THREE.Frustum();

  const watch = (mesh: THREE.InstancedMesh): void => {
    const seen: Watch = {
      before: 0,
      casting: 0,
      classifiedWith: null,
      everyInstance: false,
      mesh,
      walker: mesh.geometry.hasAttribute("walkerFrame"),
    };
    watches.set(mesh, seen);
    const upload = mesh.instanceMatrix.addUpdateRange.bind(mesh.instanceMatrix);
    mesh.instanceMatrix.addUpdateRange = (start, count) => {
      seen.classifiedWith = sun ? viewOf(sun) : null;
      upload(start, count);
    };
    const reduce = mesh.onBeforeShadow.bind(mesh);
    const restore = mesh.onAfterShadow.bind(mesh);
    mesh.onBeforeShadow = (...args) => {
      seen.before = mesh.count;
      if (!seen.everyInstance) {
        reduce(...args);
      }
      seen.casting = mesh.count;
    };
    mesh.onAfterShadow = (...args) => {
      restore(...args);
      if (mesh.count !== seen.before) {
        ledger.unrestored += 1;
      }
    };
  };

  const adopt = (scene: THREE.Object3D): void => {
    sun ??= sunIn(scene);
    scene.traverse((node) => {
      if (
        isInstancedMesh(node) &&
        node.castShadow &&
        Object.hasOwn(node, "onBeforeShadow") &&
        !watches.has(node)
      ) {
        watch(node);
      }
    });
  };

  const corner = new THREE.Vector3();
  const vertexInBox = (seen: Watch): boolean => {
    const position = seen.mesh.geometry.getAttribute("position");
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      corner.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
      if (box.containsPoint(corner)) {
        return true;
      }
    }
    return false;
  };

  const missedIn = (seen: Watch): number => {
    const { geometry } = seen.mesh;
    geometry.computeBoundingSphere();
    const bounds = geometry.boundingSphere ?? new THREE.Sphere();
    let missed = 0;
    for (let index = seen.casting; index < seen.before; index += 1) {
      seen.mesh.getMatrixAt(index, matrix);
      if (
        box.intersectsSphere(sphere.copy(bounds).applyMatrix4(matrix)) &&
        vertexInBox(seen)
      ) {
        missed += 1;
      }
    }
    return missed;
  };

  const tally = (seen: Watch, drawnWith: THREE.Matrix4, frame: number) => {
    ledger.drawn += seen.before;
    ledger.casting += seen.casting;
    const missed = missedIn(seen);
    ledger.missedCasters += missed;
    if (missed > 0) {
      ledger.missedWhere.push(
        `${seen.walker ? "walkers" : "fleet"} ${missed} of ${seen.before - seen.casting} at frame ${frame}`
      );
    }
    if (seen.classifiedWith) {
      ledger.compared += 1;
      if (!seen.classifiedWith.equals(drawnWith)) {
        ledger.lateCamera.push(
          `${seen.walker ? "walkers" : "fleet"} at frame ${frame}`
        );
      }
    }
  };

  const settle = (frame: number): void => {
    if (!sun) {
      return;
    }
    const drawnWith = viewOf(sun);
    box.setFromProjectionMatrix(drawnWith);
    for (const seen of watches.values()) {
      if (seen.mesh.visible && seen.before > 0) {
        tally(seen, drawnWith, frame);
      }
      seen.classifiedWith = null;
      seen.before = 0;
      seen.casting = 0;
    }
  };

  const edgeWalkers = (camera: THREE.Camera | null): number => {
    if (!sun || !camera) {
      return 0;
    }
    const shadow = sun.shadow.camera;
    const view = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
    );
    const at = new THREE.Vector3();
    let straddling = 0;
    for (const seen of watches.values()) {
      for (let index = 0; seen.walker && index < seen.mesh.count; index += 1) {
        seen.mesh.getMatrixAt(index, matrix);
        at.setFromMatrixPosition(matrix);
        const onScreen = view.intersectsSphere(sphere.set(at, 1));
        if (
          onScreen &&
          straddles(at.applyMatrix4(shadow.matrixWorldInverse), shadow)
        ) {
          straddling += 1;
        }
      }
    }
    return straddling;
  };

  const each = (apply: (seen: Watch) => void): void => {
    for (const seen of watches.values()) {
      apply(seen);
    }
  };

  return { adopt, each, edgeWalkers, settle };
};

type Watches = ReturnType<typeof createWatches>;

const watchedRenderer =
  (watches: Watches, held: Held) =>
  (target: HTMLCanvasElement): THREE.WebGLRenderer => {
    const renderer = createRenderer(target);
    const draw = renderer.render.bind(renderer);
    renderer.render = (scene, camera) => {
      draw(scene, camera);
      if (held.capture && renderer.getRenderTarget() === null) {
        const gl = renderer.getContext();
        held.pixels = new Uint8Array(
          gl.drawingBufferWidth * gl.drawingBufferHeight * 4
        );
        gl.readPixels(
          0,
          0,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          held.pixels
        );
      }
    };
    const renderShadows = renderer.shadowMap.render.bind(renderer.shadowMap);
    renderer.shadowMap.render = (lights, scene, camera) => {
      const updating =
        renderer.shadowMap.enabled &&
        (renderer.shadowMap.autoUpdate || renderer.shadowMap.needsUpdate);
      watches.adopt(scene);
      renderShadows(lights, scene, camera);
      if (updating) {
        held.frame += 1;
        held.camera = camera;
        watches.settle(held.frame);
      }
    };
    return renderer;
  };

const comparer = (canvas: HTMLCanvasElement, watches: Watches, held: Held) => {
  const presentAgain = async (): Promise<Uint8Array> => {
    canvas.style.width = `${WIDTH + NUDGE}px`;
    await frames(SETTLE_FRAMES);
    held.capture = true;
    canvas.style.width = `${WIDTH}px`;
    await frames(SETTLE_FRAMES);
    held.capture = false;
    return held.pixels;
  };
  return async (at: number): Promise<Spot> => {
    const asBuilt = await presentAgain();
    watches.each((seen) => {
      seen.everyInstance = true;
    });
    const everyCaster = await presentAgain();
    watches.each((seen) => {
      seen.everyInstance = false;
      seen.mesh.castShadow = false;
    });
    const unshadowed = await presentAgain();
    watches.each((seen) => {
      seen.mesh.castShadow = true;
    });
    return {
      actorShadowPixels: pixelsApart(asBuilt, unshadowed),
      at,
      changedFromEveryCaster: pixelsApart(asBuilt, everyCaster),
      edgeWalkers: watches.edgeWalkers(held.camera),
      s: Math.round(metresOf(held.hud)),
    };
  };
};

const ridden = async (
  game: GameHandle,
  watches: Watches,
  held: Held,
  compareHere: (at: number) => Promise<Spot>,
  ride: Ride,
  left: number
): Promise<Ride> => {
  if (left === 0 || ride.due.length === 0) {
    return ride;
  }
  await nextFrame();
  const edge =
    !ride.edgeDone &&
    held.hud?.phase === "racing" &&
    watches.edgeWalkers(held.camera) > 0;
  const [next = Infinity] = ride.due;
  if ((metresOf(held.hud) >= next || edge) && game.pause()) {
    await frames(SETTLE_FRAMES);
    const spot = await compareHere(edge ? EDGE : next);
    if (edge) {
      ride.edgeDone = spot.edgeWalkers > 0;
    } else {
      ride.due.shift();
    }
    ride.spots.push(spot);
    game.resume();
  }
  return await ridden(game, watches, held, compareHere, ride, left - 1);
};

const verdict = (ledger: Ledger, ride: Ride, notes: readonly string[]) => {
  const failed =
    notes.length > 0 ||
    ride.due.length > 0 ||
    !ride.edgeDone ||
    ride.spots.some((spot) => spot.changedFromEveryCaster > 0) ||
    !ride.spots.some((spot) => spot.actorShadowPixels > 0) ||
    ledger.compared < MIN_COMPARED ||
    ledger.lateCamera.length > 0 ||
    ledger.unrestored > 0 ||
    ledger.missedCasters > 0 ||
    ledger.casting >= ledger.drawn;
  if (failed) {
    throw new Error(
      `Shadow casters out of step: ${JSON.stringify({
        ledger: {
          ...ledger,
          lateCamera: ledger.lateCamera.slice(0, 5),
          missedWhere: ledger.missedWhere.slice(0, 8),
        },
        notes,
        ride,
      })}`
    );
  }
  return { ledger, spots: ride.spots };
};

export const run = async () => {
  const notes: string[] = [];
  const heard: string[] = [];
  const ledger: Ledger = {
    casting: 0,
    compared: 0,
    drawn: 0,
    lateCamera: [],
    missedCasters: 0,
    missedWhere: [],
    unrestored: 0,
  };
  const watches = createWatches(ledger);
  const held: Held = {
    camera: null,
    capture: false,
    frame: 0,
    hud: null,
    pixels: new Uint8Array(0),
  };
  const canvas = proofCanvas();
  const acquired = await acquire(notes);
  const game = createGame(
    canvas,
    {
      onHud: (state) => {
        held.hud = state;
      },
      onOver: () => {
        notes.push("over");
      },
      onRestart: () => {
        notes.push("restart");
      },
      onSettle: () => {
        heard.push("settle");
      },
      onStart: () => {
        heard.push("start");
      },
    },
    acquired,
    watchedRenderer(watches, held)
  );
  await game.prepare(plan);
  game.startRace(plan);
  const ride = await ridden(
    game,
    watches,
    held,
    comparer(canvas, watches, held),
    { due: [...SPOTS], edgeDone: false, spots: [] },
    RIDE_FRAMES
  );
  game.dispose();
  canvas.remove();
  return verdict(ledger, ride, notes);
};
