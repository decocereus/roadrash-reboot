import type { PedestrianView } from "@racer/sim/race-view";
import { siteSeed, unitOf } from "@racer/track/random";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import { walkersOn } from "@racer/track/walk-sites";
import * as THREE from "three";

import type { WalkerAsset } from "./assets.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { uploadSpan } from "./uploads.ts";
import { WALKER_OUTFITS, walkerBodies, walkerFrameOf } from "./walker-clips.ts";
import type { WalkerLook } from "./walker-clips.ts";
import { useWalkerPoses } from "./walker-skin.ts";

const BEHIND = 40;
const MARGIN = 200;
const BODY_HEIGHT = 1.7;
const QUARTER = Math.PI / 2;
const OUTFIT_SALT = 7919;

export interface WalkerMarks {
  readonly group: THREE.Group;
  dispose: () => void;
  show: (
    walkers: readonly PedestrianView[],
    centre: number,
    tick: number
  ) => void;
}

interface BodyMarks {
  readonly mesh: THREE.InstancedMesh;
  readonly frames: THREE.InstancedBufferAttribute;
  readonly outfits: THREE.InstancedBufferAttribute;
  readonly scale: number;
  count: number;
}

interface Identity extends WalkerLook {
  readonly body: BodyMarks;
  readonly outfit: number;
}

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const placer = new THREE.Object3D();

const yawOf = (walker: PedestrianView, heading: number): number => {
  switch (walker.mode) {
    case "flinching":
    case "down": {
      return -heading;
    }
    case "waiting":
    case "walking": {
      return walker.across * QUARTER - heading;
    }
    default: {
      return walker.mode satisfies never;
    }
  }
};

const pose = (track: Track, walker: PedestrianView, scale: number): void => {
  placeOnTrack(track, walker.s, walker.x, point);
  placer.position.set(point.x, point.y, point.z);
  placer.rotation.set(0, yawOf(walker, point.heading), 0);
  placer.scale.setScalar(scale);
  placer.updateMatrix();
};

const bodyMarksOf = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
  scale: number
): BodyMarks => {
  const instanced = new THREE.BufferGeometry();
  instanced.setIndex(geometry.getIndex());
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    instanced.setAttribute(name, attribute);
  }
  const frames = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity),
    1
  );
  const outfits = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity),
    1
  );
  instanced.setAttribute("walkerFrame", frames);
  instanced.setAttribute("walkerOutfit", outfits);
  const mesh = new THREE.InstancedMesh(instanced, material, capacity);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.count = 0;
  mesh.visible = false;
  return { count: 0, frames, mesh, outfits, scale };
};

export const createWalkerMarks = (
  track: Track,
  shading: Shading,
  asset: WalkerAsset
): WalkerMarks => {
  const group = new THREE.Group();
  const reach = shading.look.fogFar + MARGIN;
  const capacity = walkersOn(track.walkSites);
  const material = shading.walker(asset.atlas);
  useWalkerPoses(asset.poses);
  const bodies = asset.geometries.map((geometry, index) =>
    bodyMarksOf(
      geometry,
      material,
      capacity,
      (walkerBodies[index]?.height ?? BODY_HEIGHT) / BODY_HEIGHT
    )
  );
  for (const { mesh } of bodies) {
    group.add(mesh);
  }
  const identities: Identity[] = [];
  const fellAt = new Int32Array(capacity);
  const wasDown = new Uint8Array(capacity);

  const identityOf = (walker: PedestrianView, index: number): Identity => {
    const known = identities[index];
    if (known) {
      return known;
    }
    const seed = siteSeed(0, walker.id);
    const body = bodies[seed % bodies.length];
    if (!body) {
      throw new Error("The walker model has no bodies.");
    }
    const made: Identity = {
      body,
      offset: unitOf(seed),
      outfit: siteSeed(OUTFIT_SALT, walker.id) % WALKER_OUTFITS,
      scale: body.scale,
    };
    identities[index] = made;
    return made;
  };

  const place = (walker: PedestrianView, index: number, tick: number): void => {
    const identity = identityOf(walker, index);
    const { body, outfit } = identity;
    const slot = body.count;
    pose(track, walker, body.scale);
    body.mesh.setMatrixAt(slot, placer.matrix);
    body.frames.setX(
      slot,
      walkerFrameOf(
        asset.clips,
        walker,
        tick,
        fellAt[index] ?? tick,
        identity
      ) + 1
    );
    body.outfits.setX(slot, outfit);
    body.count = slot + 1;
  };

  return {
    dispose() {
      group.removeFromParent();
      disposeTree(group);
    },
    group,
    show(walkers, centre, tick) {
      for (const body of bodies) {
        body.count = 0;
      }
      const walkerCount = walkers.length;
      for (let index = 0; index < walkerCount; index += 1) {
        const walker = walkers[index];
        if (walker) {
          const down = walker.mode === "down" ? 1 : 0;
          if (down === 1 && wasDown[index] === 0) {
            fellAt[index] = tick;
          }
          wasDown[index] = down;
          if (walker.s > centre - BEHIND && walker.s < centre + reach) {
            place(walker, index, tick);
          }
        }
      }
      for (const { count, frames, mesh, outfits } of bodies) {
        mesh.count = count;
        mesh.visible = count > 0;
        if (count > 0) {
          uploadSpan(mesh.instanceMatrix, 0, count);
          uploadSpan(frames, 0, count);
          uploadSpan(outfits, 0, count);
        }
      }
    },
  };
};
