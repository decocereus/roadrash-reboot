import { readFileSync } from "node:fs";
import path from "node:path";

import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { createFleet } from "../src/game/actors.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { Assets } from "../src/game/assets.ts";
import { createShading } from "../src/game/cel.ts";
import { disposeTree } from "../src/game/dispose.ts";
import { createHazardMarks } from "../src/game/hazards.ts";
import { lookOf } from "../src/game/looks.ts";
import { isInstancedMesh } from "../src/game/meshes.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import { stageEverything, warmStaged } from "../src/game/staging.ts";
import type { Staged } from "../src/game/staging.ts";

const repository = path.join(import.meta.dirname, "../../..");

const bytesOf = (url: string): ArrayBuffer => {
  const file = readFileSync(path.join(repository, url));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
};

const pinnedAssets = async (): Promise<Assets> => {
  const [riderA, riderB, riderC] = modelUrls.riders;
  const [bike, car, van, a, b, c] = await Promise.all([
    assetParsers.parts(bytesOf(modelUrls.bike), modelUrls.bike),
    assetParsers.whole(bytesOf(modelUrls.car), modelUrls.car),
    assetParsers.whole(bytesOf(modelUrls.van), modelUrls.van),
    assetParsers.rider(bytesOf(riderA), riderA),
    assetParsers.rider(bytesOf(riderB), riderB),
    assetParsers.rider(bytesOf(riderC), riderC),
  ]);
  return {
    bike: bike.value,
    car: car.value,
    riders: [a.value, b.value, c.value],
    van: van.value,
  };
};

const counted = (target: THREE.EventDispatcher<{ dispose: object }>) => {
  const seen = { count: 0 };
  target.addEventListener("dispose", () => {
    seen.count += 1;
  });
  return seen;
};

const rampOf = (material: THREE.Material): THREE.Texture => {
  if (!(material instanceof THREE.MeshToonMaterial && material.gradientMap)) {
    throw new Error("The material has no ramp.");
  }
  return material.gradientMap;
};

const track = trackFor("cinder-wash", 1);

describe("renderer resource owners", () => {
  it("releases each shared geometry, material, instanced mesh and point cloud once and leaves textures to their owners", () => {
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const root = new THREE.Group();
    const instanced = new THREE.InstancedMesh(geometry, material, 4);
    const cloud = new THREE.BufferGeometry();
    const dots = new THREE.PointsMaterial();
    root.add(
      new THREE.Mesh(geometry, material),
      new THREE.Mesh(geometry, material),
      instanced,
      new THREE.Points(cloud, dots)
    );
    const seen = [geometry, material, instanced, cloud, dots, texture].map(
      counted
    );
    disposeTree(root);
    expect(seen.map((each) => each.count)).toStrictEqual([1, 1, 1, 1, 1, 0]);
  });

  it("keeps the shared ramp when actors retire and releases it with the world's shading", async () => {
    const shading = createShading(lookOf(track.plan.region));
    const ramp = counted(rampOf(shading.paint()));
    const assets = await pinnedAssets();
    const race = createRaceRun(defaultSetup(track, 3));
    const fleet = createFleet(assets, shading, race.view.cars);
    const figure = createRiderFigure(assets, shading, 0, 0);
    fleet.dispose();
    figure.dispose();
    expect(ramp.count).toBe(0);
    shading.dispose();
    expect(ramp.count).toBe(1);
  });

  it("detaches the hazard marks from the world and releases each of their meshes once", () => {
    const shading = createShading(lookOf(track.plan.region));
    const scene = new THREE.Scene();
    const marks = createHazardMarks(track, shading);
    scene.add(marks.group);
    const meshes: THREE.InstancedMesh[] = [];
    marks.group.traverse((node) => {
      if (isInstancedMesh(node)) {
        meshes.push(node);
      }
    });
    expect(meshes.length).toBeGreaterThan(0);
    const seen = meshes.map(counted);
    marks.dispose();
    expect({
      attached: scene.children.includes(marks.group),
      releases: seen.map((each) => each.count),
    }).toStrictEqual({ attached: false, releases: meshes.map(() => 1) });
  });
});

interface Staging {
  readonly staged: Staged;
  readonly hidden: THREE.Mesh;
  readonly samples: THREE.Group;
  readonly state: {
    armed: number;
    followed: number;
    primed: number;
    samplesReleased: number;
  };
}

const stagingOf = ({ prepareThrows = false } = {}): Staging => {
  const scene = new THREE.Scene();
  const hidden = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial()
  );
  hidden.visible = false;
  scene.add(hidden);
  const sampleGeometry = new THREE.BoxGeometry();
  const samples = new THREE.Group();
  samples.add(new THREE.Mesh(sampleGeometry, new THREE.MeshBasicMaterial()));
  const state = { armed: 0, followed: 0, primed: 0, samplesReleased: 0 };
  sampleGeometry.addEventListener("dispose", () => {
    state.samplesReleased += 1;
  });
  const arm = () => {
    state.armed += 1;
    return () => {
      state.armed -= 1;
    };
  };
  return {
    hidden,
    samples,
    staged: {
      at: 0,
      camera: new THREE.PerspectiveCamera(),
      figures: [{ holdEveryWeapon: arm }, { holdEveryWeapon: arm }],
      prepare: () => {
        if (prepareThrows) {
          throw new Error("The depth materials could not be set.");
        }
      },
      puffs: {
        prime: () => {
          state.primed += 1;
          return () => {
            state.primed -= 1;
          };
        },
      },
      world: {
        follow: () => {
          state.followed += 1;
        },
        samples: () => samples,
        scene,
      },
    },
    state,
  };
};

const restoredOf = ({ hidden, samples, staged, state }: Staging) => ({
  ...state,
  culled: hidden.frustumCulled,
  sampled: staged.world.scene.children.includes(samples),
  visible: hidden.visible,
});

const restored = {
  armed: 0,
  culled: true,
  followed: 1,
  primed: 0,
  sampled: false,
  samplesReleased: 1,
  visible: false,
};

describe("staging for shader warm-up", () => {
  it("reveals and arms everything while staged and restores it all afterwards", () => {
    const staging = stagingOf();
    const unstage = stageEverything(staging.staged);
    expect(restoredOf(staging)).toStrictEqual({
      armed: 2,
      culled: false,
      followed: 1,
      primed: 1,
      sampled: true,
      samplesReleased: 0,
      visible: true,
    });
    unstage();
    expect(restoredOf(staging)).toStrictEqual(restored);
  });

  it("restores staging when the warm-up draw throws", () => {
    const staging = stagingOf();
    expect(() => {
      warmStaged(staging.staged, () => {
        throw new Error("The warm-up draw failed.");
      });
    }).toThrow("The warm-up draw failed.");
    expect(restoredOf(staging)).toStrictEqual(restored);
  });

  it("unwinds what it set up when setup itself throws", () => {
    const staging = stagingOf({ prepareThrows: true });
    expect(() => stageEverything(staging.staged)).toThrow(
      "The depth materials could not be set."
    );
    expect(restoredOf(staging)).toStrictEqual(restored);
  });
});
