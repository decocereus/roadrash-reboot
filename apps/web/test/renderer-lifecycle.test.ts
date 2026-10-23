import { readFileSync } from "node:fs";
import path from "node:path";

import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { TrafficView } from "@racer/sim/race-view";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { createFleet } from "../src/game/actors.ts";
import type { Fleet } from "../src/game/actors.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { Assets } from "../src/game/assets.ts";
import { createShading } from "../src/game/cel.ts";
import type { Shading } from "../src/game/cel.ts";
import { disposeTree } from "../src/game/dispose.ts";
import { createHazardMarks } from "../src/game/hazards.ts";
import { lookOf } from "../src/game/looks.ts";
import { isInstancedMesh } from "../src/game/meshes.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import { stageEverything, warmStaged } from "../src/game/staging.ts";
import type { Staged } from "../src/game/staging.ts";
import { uploadSpan } from "../src/game/uploads.ts";

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

const instancedIn = (root: THREE.Object3D): THREE.InstancedMesh[] => {
  const meshes: THREE.InstancedMesh[] = [];
  root.traverse((node) => {
    if (isInstancedMesh(node)) {
      meshes.push(node);
    }
  });
  return meshes;
};

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
    const meshes = instancedIn(marks.group);
    expect(meshes.length).toBeGreaterThan(0);
    const seen = meshes.map(counted);
    marks.dispose();
    expect({
      attached: scene.children.includes(marks.group),
      releases: seen.map((each) => each.count),
    }).toStrictEqual({ attached: false, releases: meshes.map(() => 1) });
  });
});

const placedFleet = (
  assets: Assets,
  shading: Shading,
  cars: readonly TrafficView[]
): Fleet => {
  const fleet = createFleet(assets, shading, cars);
  for (let index = 0; index < cars.length; index += 1) {
    fleet.place(track, index, cars[index]?.s ?? 0);
  }
  return fleet;
};

const coloursOf = (
  mesh: THREE.InstancedMesh
): THREE.InstancedBufferAttribute => {
  if (!mesh.instanceColor) {
    throw new Error("The fleet mesh has no instance colours.");
  }
  return mesh.instanceColor;
};

const componentsChanged = (
  before: readonly number[],
  after: THREE.TypedArray
): number[] => {
  const changed: number[] = [];
  for (let component = 0; component < after.length; component += 1) {
    if (before[component] !== after[component]) {
      changed.push(component);
    }
  }
  return changed;
};

const drawnOf = (mesh: THREE.InstancedMesh) => ({
  colours: coloursOf(mesh).array.slice(0, mesh.count * 3),
  matrices: mesh.instanceMatrix.array.slice(0, mesh.count * 16),
});

describe("traffic instance uploads", () => {
  it("uploads only the drawn prefix of each fleet mesh and no colours for slots that keep their car", async () => {
    const shading = createShading(lookOf(track.plan.region));
    const assets = await pinnedAssets();
    const race = createRaceRun(defaultSetup(track, 3));
    const fleet = placedFleet(assets, shading, race.view.cars);
    const meshes = instancedIn(fleet.group);
    fleet.commit(0);
    expect(
      meshes.map((mesh) => ({
        culled: mesh.count > 0 && mesh.count < mesh.instanceMatrix.count,
        ranges: mesh.instanceMatrix.updateRanges,
      }))
    ).toStrictEqual(
      meshes.map((mesh) => ({
        culled: true,
        ranges: [{ count: mesh.count * 16, start: 0 }],
      }))
    );
    const painted = meshes.map((mesh) => coloursOf(mesh).version);
    expect(painted.filter((version) => version > 0)).not.toHaveLength(0);
    fleet.commit(1);
    expect(meshes.map((mesh) => coloursOf(mesh).version)).toStrictEqual(
      painted
    );
    fleet.dispose();
    shading.dispose();
  });

  it("keeps each car's paint and place in its slot as cars cull in and out and uploads the slots that changed car", async () => {
    const shading = createShading(lookOf(track.plan.region));
    const assets = await pinnedAssets();
    const race = createRaceRun(defaultSetup(track, 3));
    const riding = placedFleet(assets, shading, race.view.cars);
    riding.commit(0);
    const consumed = instancedIn(riding.group).map((mesh) => {
      const colours = coloursOf(mesh);
      colours.clearUpdateRanges();
      return {
        before: [...colours.array],
        colours,
        mesh,
        version: colours.version,
      };
    });
    riding.commit(1000);
    const repainted = consumed
      .map(({ before, colours, mesh, version }) => {
        const changed = componentsChanged(before, colours.array);
        return {
          changed: changed.length,
          covered: changed.every((component) =>
            colours.updateRanges.some(
              (range) =>
                component >= range.start &&
                component < range.start + range.count
            )
          ),
          drawn: colours.updateRanges.every(
            (range) => range.start + range.count <= mesh.count * 3
          ),
          newer: colours.version > version,
        };
      })
      .filter(({ changed }) => changed > 0);
    expect(repainted).not.toHaveLength(0);
    expect(repainted).toStrictEqual(
      repainted.map(({ changed }) => ({
        changed,
        covered: true,
        drawn: true,
        newer: true,
      }))
    );
    const fresh = placedFleet(assets, shading, race.view.cars);
    fresh.commit(1000);
    expect(instancedIn(riding.group).map(drawnOf)).toStrictEqual(
      instancedIn(fresh.group).map(drawnOf)
    );
    riding.dispose();
    fresh.dispose();
    shading.dispose();
  });
});

const scheduled = (attribute: THREE.BufferAttribute) => ({
  ranges: attribute.updateRanges,
  version: attribute.version,
});

describe("buffer attribute uploads", () => {
  it("merges disjoint spans marked before the renderer consumes them into one covering range", () => {
    const colours = new THREE.BufferAttribute(new Float32Array(10 * 3), 3);
    uploadSpan(colours, 1, 2);
    uploadSpan(colours, 6, 8);
    expect(scheduled(colours)).toStrictEqual({
      ranges: [{ count: 21, start: 3 }],
      version: 2,
    });
  });

  it("keeps a larger pending prefix when a smaller one follows it", () => {
    const matrices = new THREE.BufferAttribute(new Float32Array(10 * 16), 16);
    uploadSpan(matrices, 0, 8);
    uploadSpan(matrices, 0, 3);
    expect(scheduled(matrices)).toStrictEqual({
      ranges: [{ count: 128, start: 0 }],
      version: 2,
    });
  });

  it("leaves pending ranges and the version alone for an empty span", () => {
    const colours = new THREE.BufferAttribute(new Float32Array(10 * 3), 3);
    uploadSpan(colours, 2, 4);
    uploadSpan(colours, 5, 5);
    uploadSpan(colours, 7, 3);
    expect(scheduled(colours)).toStrictEqual({
      ranges: [{ count: 6, start: 6 }],
      version: 1,
    });
  });

  it("starts a fresh range once the renderer has consumed the last one", () => {
    const colours = new THREE.BufferAttribute(new Float32Array(10 * 3), 3);
    uploadSpan(colours, 0, 8);
    colours.clearUpdateRanges();
    uploadSpan(colours, 5, 6);
    expect(scheduled(colours)).toStrictEqual({
      ranges: [{ count: 3, start: 15 }],
      version: 2,
    });
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
