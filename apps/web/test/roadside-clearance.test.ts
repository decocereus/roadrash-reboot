import { crossHalfWidthOf } from "@racer/track/crossings";
import type { CrossingRule } from "@racer/track/crossings";
import { lipOf } from "@racer/track/features";
import { roadIds } from "@racer/track/road";
import { roads, trackFor } from "@racer/track/roads";
import { compileTrack, placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createChaseCamera } from "../src/game/chase-camera.ts";
import { KERB_HEIGHT } from "../src/game/city.ts";
import { placeOnGround } from "../src/game/ground.ts";
import { isInstancedMesh, isMesh } from "../src/game/meshes.ts";
import { BEACON_OUT } from "../src/game/ramp-markers.ts";
import { createWorld } from "../src/game/world.ts";
import type { World } from "../src/game/world.ts";

const drawsNothing = new Proxy(
  {},
  {
    get: (_target, key) =>
      key === "createLinearGradient" || key === "createRadialGradient"
        ? () => ({ addColorStop: () => null })
        : () => null,
  }
);

interface Instance {
  readonly mesh: THREE.InstancedMesh;
  readonly index: number;
  readonly pose: THREE.Matrix4;
}

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const matrix = new THREE.Matrix4();
const spot = new THREE.Vector3();

const footOf = (track: Track, s: number, x: number): THREE.Vector3 => {
  placeOnGround(track, s, x, point);
  return new THREE.Vector3(point.x, point.y, point.z);
};

const instancesAt = (world: World, foot: THREE.Vector3): Instance[] => {
  const found: Instance[] = [];
  world.scene.traverse((node) => {
    if (!isInstancedMesh(node)) {
      return;
    }
    for (let index = 0; index < node.count; index += 1) {
      node.getMatrixAt(index, matrix);
      if (spot.setFromMatrixPosition(matrix).distanceTo(foot) < 0.001) {
        found.push({ index, mesh: node, pose: matrix.clone() });
      }
    }
  });
  return found;
};

const poseNow = (instance: Instance): THREE.Matrix4 => {
  instance.mesh.getMatrixAt(instance.index, matrix);
  return matrix.clone();
};

const hidden = (instances: readonly Instance[]): boolean[] =>
  instances.map((instance) => poseNow(instance).getMaxScaleOnAxis() === 0);

const intact = (instances: readonly Instance[]): boolean[] =>
  instances.map((instance) => poseNow(instance).equals(instance.pose));

const drawn = (object: THREE.Object3D): boolean =>
  object.visible && (object.parent === null || drawn(object.parent));

const rideTo = (
  world: World,
  track: Track,
  subject: { readonly s: number; readonly x: number; readonly air?: number }
): THREE.Vector3 => {
  const chase = createChaseCamera();
  chase.update(
    track,
    { air: subject.air ?? 0, s: subject.s, speed: 20, tuck: 0, x: subject.x },
    1 / 60
  );
  world.follow(chase.camera, subject.s);
  return chase.camera.position.clone();
};

const horizontal = (a: THREE.Vector3, b: THREE.Vector3): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

const postsAt = (
  world: World,
  track: Track,
  s: number,
  x: number
): THREE.Mesh[] => {
  placeOnTrack(track, s, x, point);
  const posts: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  world.scene.traverse((node) => {
    if (!isMesh(node) || isInstancedMesh(node)) {
      return;
    }
    box.setFromObject(node);
    const size = box.getSize(spot);
    const centre = box.getCenter(new THREE.Vector3());
    if (
      size.y > 3 &&
      Math.hypot(centre.x - point.x, centre.z - point.z) < 0.5 &&
      Math.max(size.x, size.z) > 0.1 &&
      Math.max(size.x, size.z) < 1
    ) {
      posts.push(node);
    }
  });
  return posts;
};

describe("the roadside clears the chase camera", () => {
  beforeAll(() => {
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => drawsNothing }),
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("hides the chevron, board and post together, on either side of the road, while a rider running wide puts the camera at it, and puts both back once the camera has passed", () => {
    const track = trackFor("slag-row", 1);
    const world = createWorld(track);
    const right = instancesAt(world, footOf(track, 1733, 9.3));
    const left = instancesAt(world, footOf(track, 356, -9.3));
    const ahead = instancesAt(world, footOf(track, 1745, 9.3));
    expect([right.length, left.length, ahead.length]).toStrictEqual([2, 2, 2]);

    rideTo(world, track, { s: 1739.1012, x: 11.9203 });
    expect([...hidden(right), ...intact(ahead), ...intact(left)]).toStrictEqual(
      [true, true, true, true, true, true]
    );

    rideTo(world, track, { s: 364.4, x: -12.4 });
    expect([...intact(right), ...hidden(left)]).toStrictEqual([
      true,
      true,
      true,
      true,
    ]);

    rideTo(world, track, { s: 384, x: -12.4 });
    expect([...intact(right), ...intact(left)]).toStrictEqual([
      true,
      true,
      true,
      true,
    ]);
    world.dispose();
  });

  it("hides the whole scaled pine whose canopy covers the camera behind a crashed bike, though its foot is 4.6 m from the eye", () => {
    const track = trackFor("ridge-road", 1);
    const world = createWorld(track);
    const foot = footOf(track, 700.3308, 8.5107);
    const pine = instancesAt(world, foot);
    const across = instancesAt(world, footOf(track, 701.0156, -10.1369));
    expect([pine.length, across.length]).toStrictEqual([3, 3]);

    const eye = rideTo(world, track, { s: 704.88, x: 7.7559 });
    expect(horizontal(eye, foot)).toBeGreaterThan(4.5);
    expect([...hidden(pine), ...intact(across)]).toStrictEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);

    rideTo(world, track, { s: 730, x: 2 });
    expect(intact(pine)).toStrictEqual([true, true, true]);
    world.dispose();
  });

  it("hides a ramp beacon's post and lamp while the camera passes the lip, keeps them hidden when the camera leaves the ramp's stretch from there, and shows them with the ramp behind the camera", () => {
    const track = trackFor("breakwater-run", 1);
    const world = createWorld(track);
    const [jump] = track.features;
    if (!jump) {
      throw new Error("Breakwater Run has a ramp.");
    }
    const lip = lipOf(jump);
    const beaconAt = (x: number): THREE.Mesh[] => {
      placeOnTrack(track, lip, x, point);
      const parts: THREE.Mesh[] = [];
      const box = new THREE.Box3();
      world.scene.traverse((node) => {
        if (!isMesh(node) || isInstancedMesh(node)) {
          return;
        }
        box.setFromObject(node);
        const size = box.getSize(spot);
        const centre = box.getCenter(new THREE.Vector3());
        if (
          size.x < 1 &&
          size.z < 1 &&
          Math.hypot(centre.x - point.x, centre.z - point.z) < 0.6
        ) {
          parts.push(node);
        }
      });
      return parts;
    };
    const inner = beaconAt(jump.x - jump.width / 2 - BEACON_OUT);
    const outer = beaconAt(jump.x + jump.width / 2 + BEACON_OUT);
    expect([inner.length, outer.length]).toStrictEqual([2, 2]);
    const beacons = [...inner, ...outer];

    rideTo(world, track, { air: 0.6, s: lip + 8, x: jump.x });
    expect(beacons.map(drawn)).toStrictEqual([false, false, false, false]);

    rideTo(world, track, { s: lip + 600, x: jump.x });
    expect(beacons.map(drawn)).toStrictEqual([false, false, false, false]);

    rideTo(world, track, { s: lip + 30, x: jump.x });
    expect(beacons.map(drawn)).toStrictEqual([true, true, true, true]);
    world.dispose();
  });

  it("keeps every signal across the junction drawn while a rider rides the right lane through Harbour Cross", () => {
    const track = trackFor("breakwater-run", 1);
    const world = createWorld(track);
    const harbour = track.crossings.find(({ id }) => id === "harbour-cross");
    if (!harbour) {
      throw new Error("Breakwater Run has Harbour Cross.");
    }
    const half = track.roadHalfWidth;
    const far = [
      ...postsAt(world, track, harbour.s + harbour.stopGap + 0.3, -half - 0.9),
      ...postsAt(
        world,
        track,
        harbour.s - harbour.boxHalfLength - 0.9,
        -half - 1.4
      ),
      ...postsAt(
        world,
        track,
        harbour.s + harbour.boxHalfLength + 0.9,
        half + 1.4
      ),
    ];
    expect(far).toHaveLength(3);
    const lost: number[] = [];
    for (let s = harbour.s - 80; s < harbour.s + 20; s += 2) {
      rideTo(world, track, { s, x: half - 2 });
      if (!far.every(drawn)) {
        lost.push(s);
      }
    }
    expect(lost).toStrictEqual([]);
    world.dispose();
  });

  it("runs Harbour Cross's pavement right up to each arm and leaves no gap beside it", () => {
    const track = trackFor("breakwater-run", 1);
    const world = createWorld(track);
    const harbour = track.crossings.find(({ id }) => id === "harbour-cross");
    if (!harbour) {
      throw new Error("Breakwater Run has Harbour Cross.");
    }
    const ground: THREE.Mesh[] = [];
    world.scene.traverse((node) => {
      if (isMesh(node) && !isInstancedMesh(node)) {
        ground.push(node);
      }
    });
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const surface = (s: number, x: number): string => {
      placeOnTrack(track, s, x, point);
      ray.set(new THREE.Vector3(point.x, point.y + 50, point.z), down);
      const [first] = ray.intersectObjects(ground, false);
      return first && first.point.y > point.y + KERB_HEIGHT / 2
        ? "pavement"
        : "arm";
    };
    const edge = harbour.boxHalfLength;
    const rows = [-1, 1].map((side) => {
      const x = side * (track.roadHalfWidth + 1.5);
      return [
        surface(harbour.s - edge - 0.2, x),
        surface(harbour.s - edge + 0.2, x),
        surface(harbour.s + edge - 0.2, x),
        surface(harbour.s + edge + 0.2, x),
      ];
    });
    expect(rows).toStrictEqual([
      ["pavement", "arm", "arm", "pavement"],
      ["pavement", "arm", "arm", "pavement"],
    ]);
    world.dispose();
  });

  it("lays an open-country junction's arms on the ground rather than under a hillside", () => {
    const rule: CrossingRule = {
      fromLevel: 1,
      id: "woods-cross",
      lights: null,
      road: { arms: "both", laneWidth: 3.4, lanesEachWay: 1 },
      s: 1500,
      walk: "unmarked",
    };
    const track = compileTrack({
      ...roads["breakwater-run"].plan,
      chevrons: [],
      crossings: [rule],
      features: [],
      region: "kettle-woods",
    });
    const world = createWorld(track);
    const ground: THREE.Mesh[] = [];
    world.scene.traverse((node) => {
      if (isMesh(node) && !isInstancedMesh(node)) {
        ground.push(node);
      }
    });
    const down = new THREE.Vector3(0, -1, 0);
    const ray = new THREE.Raycaster();
    const buried: string[] = [];
    const [crossing] = track.crossings;
    if (!crossing?.road) {
      throw new Error("The woods junction has a cross road.");
    }
    const width = crossHalfWidthOf(crossing.road);
    for (const side of [-1, 1]) {
      for (let out = 2; out <= 58; out += 4) {
        for (const along of [-width + 0.3, 0, width - 0.3]) {
          placeOnTrack(
            track,
            crossing.s + along,
            side * (track.roadHalfWidth + out),
            point
          );
          ray.set(new THREE.Vector3(point.x, point.y + 200, point.z), down);
          const [first] = ray.intersectObjects(ground, false);
          if (!first || first.point.y > point.y + 0.05) {
            buried.push(`side=${side} out=${out} along=${along}`);
          }
        }
      }
    }
    expect(buried).toStrictEqual([]);
    world.dispose();
  });

  it("hides no planted prop the camera can see while a rider rides a metre inside either edge of any road", () => {
    const seen: string[] = [];
    const view = new THREE.Frustum();
    const viewProjection = new THREE.Matrix4();
    const box = new THREE.Box3();
    for (const roadId of roadIds) {
      const track = trackFor(roadId, 1);
      const world = createWorld(track);
      const batches: {
        bounds: THREE.Box3;
        mesh: THREE.InstancedMesh;
        poses: Float32Array;
      }[] = [];
      world.scene.traverse((node) => {
        if (!isInstancedMesh(node)) {
          return;
        }
        node.geometry.computeBoundingBox();
        if (node.geometry.boundingBox) {
          batches.push({
            bounds: node.geometry.boundingBox,
            mesh: node,
            poses: Float32Array.from(node.instanceMatrix.array),
          });
        }
      });
      for (const x of [track.roadHalfWidth - 1, 1 - track.roadHalfWidth]) {
        const chase = createChaseCamera();
        chase.camera.aspect = 1512 / 860;
        chase.camera.updateProjectionMatrix();
        for (let s = 30; s < track.length - 30; s += 2) {
          chase.update(track, { air: 0, s, speed: 40, tuck: 0, x }, 1 / 60);
          world.follow(chase.camera, s);
          chase.camera.updateMatrixWorld();
          view.setFromProjectionMatrix(
            viewProjection.multiplyMatrices(
              chase.camera.projectionMatrix,
              chase.camera.matrixWorldInverse
            )
          );
          for (const { bounds, mesh, poses } of batches) {
            const now = mesh.instanceMatrix.array;
            for (let index = 0; index < mesh.count; index += 1) {
              if (now[index * 16] === 0 && now[index * 16 + 5] === 0) {
                box
                  .copy(bounds)
                  .applyMatrix4(matrix.fromArray(poses, index * 16));
                if (view.intersectsBox(box)) {
                  seen.push(`${roadId} s=${s} x=${x}`);
                }
              }
            }
          }
        }
      }
      world.dispose();
    }
    expect(seen).toStrictEqual([]);
  });
});
