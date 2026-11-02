import type { PedestrianView } from "@racer/sim/race-view";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import { walkersOn } from "@racer/track/walk-sites";
import * as THREE from "three";

import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { whiteInstances } from "./ground.ts";
import { uploadSpan } from "./uploads.ts";

const BEHIND = 40;
const MARGIN = 200;
const BODY_RADIUS = 0.26;
const BODY_LENGTH = 1.18;
const STANDING_LIFT = BODY_LENGTH / 2 + BODY_RADIUS;
const LYING_LIFT = BODY_RADIUS;
const FLINCH_TILT = 0.45;
const GREYBOX = "#c9c4b8";

export interface WalkerMarks {
  readonly group: THREE.Group;
  dispose: () => void;
  show: (walkers: readonly PedestrianView[], centre: number) => void;
}

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const placer = new THREE.Object3D();

const pose = (track: Track, walker: PedestrianView): void => {
  placeOnTrack(track, walker.s, walker.x, point);
  const lying = walker.mode === "down";
  placer.position.set(
    point.x,
    point.y + (lying ? LYING_LIFT : STANDING_LIFT),
    point.z
  );
  placer.rotation.set(
    lying ? Math.PI / 2 : 0,
    -point.heading,
    walker.mode === "flinching" ? FLINCH_TILT * walker.across : 0,
    "YXZ"
  );
  placer.updateMatrix();
};

export const createWalkerMarks = (
  track: Track,
  shading: Shading
): WalkerMarks => {
  const group = new THREE.Group();
  const reach = shading.look.fogFar + MARGIN;
  const mesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(BODY_RADIUS, BODY_LENGTH, 3, 8),
    shading.cel(GREYBOX, { rim: 0.6 }),
    walkersOn(track.walkSites)
  );
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  whiteInstances(mesh);
  mesh.count = 0;
  mesh.visible = false;
  group.add(mesh);
  return {
    dispose() {
      group.removeFromParent();
      disposeTree(group);
    },
    group,
    show(walkers, centre) {
      let slot = 0;
      for (const walker of walkers) {
        if (
          walker.mode !== "gone" &&
          walker.s > centre - BEHIND &&
          walker.s < centre + reach
        ) {
          pose(track, walker);
          mesh.setMatrixAt(slot, placer.matrix);
          slot += 1;
        }
      }
      if (slot !== mesh.count || slot > 0) {
        mesh.count = slot;
        mesh.visible = slot > 0;
        uploadSpan(mesh.instanceMatrix, 0, slot);
      }
    },
  };
};
