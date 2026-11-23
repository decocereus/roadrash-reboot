import type * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { Parse } from "./assets.ts";

const moveNames = ["idle", "walk", "jog", "sprint"] as const;
export type MoveName = (typeof moveNames)[number];

export const MOVE_RATE = 30;

export interface Move {
  readonly frames: number;
  readonly turns: Float32Array;
  readonly travel: Float32Array;
}

export interface RiderMoves {
  readonly scene: THREE.Object3D;
  readonly bones: readonly string[];
  readonly stand: Move;
  readonly moves: Readonly<Record<MoveName, Move>>;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const TURN = ".quaternion";
const TRAVEL = "pelvis.position";

const moveOf = (
  clip: THREE.AnimationClip,
  bones: readonly string[],
  refused: (why: string) => Error
): Move => {
  const travelled = clip.tracks.find(({ name }) => name === TRAVEL);
  if (!travelled) {
    throw refused(`has no pelvis travel in ${clip.name}.`);
  }
  const frames = travelled.times.length;
  const turns = new Float32Array(frames * bones.length * 4);
  for (let bone = 0; bone < bones.length; bone += 1) {
    const track = clip.tracks.find(
      ({ name }) => name === `${bones[bone] ?? ""}${TURN}`
    );
    if (!track || track.times.length !== frames) {
      throw refused(
        `turns ${bones[bone] ?? "a bone"} on a different count of frames in ${clip.name}.`
      );
    }
    for (let frame = 0; frame < frames; frame += 1) {
      turns.set(
        track.values.subarray(frame * 4, frame * 4 + 4),
        (frame * bones.length + bone) * 4
      );
    }
  }
  return { frames, travel: Float32Array.from(travelled.values), turns };
};

export const parseMoves: Parse<RiderMoves> = async (bytes, url) => {
  const gltf = await loader.parseAsync(bytes, "");
  const refused = (why: string) => new Error(`The rider moves ${url} ${why}`);
  const clipOf = (name: string) => {
    const clip = gltf.animations.find((each) => each.name === name);
    if (!clip) {
      throw refused(`have no ${name} loop.`);
    }
    return clip;
  };
  const standing = clipOf("stand");
  const bones = standing.tracks
    .filter(({ name }) => name.endsWith(TURN))
    .map(({ name }) => name.slice(0, -TURN.length));
  const moves = {
    idle: moveOf(clipOf("idle"), bones, refused),
    jog: moveOf(clipOf("jog"), bones, refused),
    sprint: moveOf(clipOf("sprint"), bones, refused),
    walk: moveOf(clipOf("walk"), bones, refused),
  } satisfies Record<MoveName, Move>;
  const { scene } = gltf;
  return {
    release: () => {
      scene.clear();
    },
    value: { bones, moves, scene, stand: moveOf(standing, bones, refused) },
  };
};
