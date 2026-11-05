import type { CelebrityId } from "@racer/sim/cast";
import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { BikeModelId } from "./bike-models.ts";
import { RED } from "./looks.ts";
import { isMesh, isSkinnedMesh } from "./meshes.ts";
import { walkerBodies, walkerClipLoops } from "./walker-clips.ts";
import type {
  WalkerClip,
  WalkerClipName,
  WalkerClips,
} from "./walker-clips.ts";
import { POSE_TEXELS_PER_BONE } from "./walker-skin.ts";

const POSE_NAMES = [
  "rest",
  "seated",
  "punch_l",
  "punch_r",
  "kick_l",
  "kick_r",
  "windup_l",
  "windup_r",
  "swing_l",
  "swing_r",
  "run_a",
  "run_b",
  "lift",
  "lying",
  "tumble_a",
  "tumble_b",
  "surrender",
  "stand",
] as const;

export type PoseName = (typeof POSE_NAMES)[number];

export interface Primitive {
  readonly slot: string;
  readonly geometry: THREE.BufferGeometry;
}

export interface RiderAsset {
  readonly scene: THREE.Object3D;
  readonly primitives: readonly Primitive[];
  readonly atlas: THREE.Texture | null;
  readonly bones: readonly string[];
  readonly poses: ReadonlyMap<PoseName, number[]>;
  readonly seat: THREE.Vector3;
  readonly standHeight: number;
}

export interface WalkerAsset {
  readonly atlas: THREE.Texture;
  readonly clips: WalkerClips;
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly poses: THREE.DataTexture;
}

export type ModelParts = ReadonlyMap<string, readonly Primitive[]>;

const ATLAS = "atlas";

export interface Assets {
  readonly bikes: Readonly<Record<BikeModelId, ModelParts>>;
  readonly car: readonly Primitive[];
  readonly truck: readonly Primitive[];
  readonly van: readonly Primitive[];
  readonly figures: readonly RiderAsset[];
  readonly stalls: ModelParts;
  readonly walkers: WalkerAsset;
}

const fixedColours: ReadonlyMap<string, string> = new Map([
  ["dark", "#231d30"],
  ["metal", "#8f93ad"],
  ["gold", "#e0ac3a"],
  ["tyre", "#17141f"],
  ["glass", "#101c30"],
  ["seat", "#17141f"],
  ["plate", "#ece6d8"],
  ["glove", "#15121c"],
  ["boot", "#15121c"],
  ["armour", "#231d30"],
  ["visor", "#0f1c33"],
  [ATLAS, "#ffffff"],
]);

const glossOf: ReadonlyMap<string, number> = new Map([
  ["body", 1],
  ["accent", 0.6],
  ["helmet", 1],
  ["helmet2", 1],
  ["visor", 1],
  ["glass", 1],
  ["gold", 0.7],
  ["metal", 0.5],
]);

const lights: ReadonlyMap<string, readonly [string, number]> = new Map([
  ["light_tail", [RED, 2.4]],
  ["light_head", ["#fff7d6", 1.5]],
  ["light_ind", ["#ff9a1f", 1.6]],
]);

export const glows = (slot: string): boolean => lights.has(slot);

const MISSING = "#ff00ff";

export type Palette = ReadonlyMap<string, THREE.ColorRepresentation>;

export interface Painted {
  readonly cel: THREE.BufferGeometry | null;
  readonly glow: THREE.BufferGeometry | null;
}

const tint = new THREE.Color();

const coloured = (
  primitive: Primitive,
  colour: THREE.Color,
  gloss: number
): THREE.BufferGeometry => {
  const source = primitive.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.getIndex());
  for (const name of ["position", "normal", "uv", "skinIndex", "skinWeight"]) {
    if (source.hasAttribute(name)) {
      geometry.setAttribute(name, source.getAttribute(name));
    }
  }
  const { count } = source.getAttribute("position");
  const colours = new Float32Array(count * 3);
  const glosses = new Float32Array(count).fill(gloss);
  for (let vertex = 0; vertex < count; vertex += 1) {
    colours[vertex * 3] = colour.r;
    colours[vertex * 3 + 1] = colour.g;
    colours[vertex * 3 + 2] = colour.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute("gloss", new THREE.BufferAttribute(glosses, 1));
  return geometry;
};

export const paintPrimitives = (
  primitives: readonly Primitive[],
  palette: Palette
): Painted => {
  const cel: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  for (const primitive of primitives) {
    const light = lights.get(primitive.slot);
    if (light) {
      tint.set(light[0]).multiplyScalar(light[1]);
      glow.push(coloured(primitive, tint, 0));
    } else {
      tint.set(
        palette.get(primitive.slot) ??
          fixedColours.get(primitive.slot) ??
          MISSING
      );
      cel.push(coloured(primitive, tint, glossOf.get(primitive.slot) ?? 0));
    }
  }
  return {
    cel: cel.length > 0 ? mergeGeometries(cel) : null,
    glow: glow.length > 0 ? mergeGeometries(glow) : null,
  };
};

const atlasOf = (material: THREE.Material): THREE.Texture | null =>
  material instanceof THREE.MeshStandardMaterial ? material.map : null;

const slotOf = (mesh: THREE.Mesh): string => {
  if (Array.isArray(mesh.material)) {
    return "";
  }
  return atlasOf(mesh.material) ? ATLAS : mesh.material.name;
};

type Packed = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

const vector = new THREE.Vector3();

const placedVectors = (
  source: Packed,
  place: (each: THREE.Vector3) => THREE.Vector3
): THREE.BufferAttribute => {
  const values = new Float32Array(source.count * 3);
  for (let index = 0; index < source.count; index += 1) {
    place(vector.fromBufferAttribute(source, index)).toArray(values, index * 3);
  }
  return new THREE.BufferAttribute(values, 3);
};

const unpacked = (
  source: Packed,
  values: Float32Array | Uint16Array
): THREE.BufferAttribute => {
  for (let index = 0; index < source.count; index += 1) {
    for (let component = 0; component < source.itemSize; component += 1) {
      values[index * source.itemSize + component] = source.getComponent(
        index,
        component
      );
    }
  }
  return new THREE.BufferAttribute(values, source.itemSize);
};

const sharedBind = (
  mesh: THREE.SkinnedMesh,
  first: THREE.SkinnedMesh
): THREE.Matrix4 => {
  const [own] = mesh.skeleton.boneInverses;
  const [shared] = first.skeleton.boneInverses;
  if (!(own && shared)) {
    throw new Error("A skinned mesh in the rider model has no joints.");
  }
  return new THREE.Matrix4()
    .copy(first.bindMatrixInverse)
    .multiply(shared.clone().invert())
    .multiply(own)
    .multiply(mesh.bindMatrix);
};

const rgbOf = (source: Packed): THREE.BufferAttribute => {
  const values = new Float32Array(source.count * 3);
  for (let index = 0; index < source.count; index += 1) {
    values[index * 3] = source.getX(index);
    values[index * 3 + 1] = source.getY(index);
    values[index * 3 + 2] = source.getZ(index);
  }
  return new THREE.BufferAttribute(values, 3);
};

const fileSpaceGeometry = (
  source: THREE.BufferGeometry,
  placement: THREE.Matrix4
): THREE.BufferGeometry => {
  const turn = new THREE.Matrix3().getNormalMatrix(placement);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.getIndex());
  geometry.setAttribute(
    "position",
    placedVectors(source.getAttribute("position"), (each) =>
      each.applyMatrix4(placement)
    )
  );
  if (source.hasAttribute("normal")) {
    geometry.setAttribute(
      "normal",
      placedVectors(source.getAttribute("normal"), (each) =>
        each.applyMatrix3(turn).normalize()
      )
    );
  }
  if (source.hasAttribute("uv")) {
    const uv = source.getAttribute("uv");
    geometry.setAttribute(
      "uv",
      unpacked(uv, new Float32Array(uv.count * uv.itemSize))
    );
  }
  if (source.hasAttribute("color")) {
    geometry.setAttribute("color", rgbOf(source.getAttribute("color")));
  }
  if (source.hasAttribute("skinIndex")) {
    const joints = source.getAttribute("skinIndex");
    geometry.setAttribute(
      "skinIndex",
      unpacked(joints, new Uint16Array(joints.count * joints.itemSize))
    );
  }
  if (source.hasAttribute("skinWeight")) {
    const weights = source.getAttribute("skinWeight");
    geometry.setAttribute(
      "skinWeight",
      unpacked(weights, new Float32Array(weights.count * weights.itemSize))
    );
  }
  return geometry;
};

const primitivesOf = (root: THREE.Object3D): Primitive[] => {
  const primitives: Primitive[] = [];
  let first: THREE.SkinnedMesh | null = null;
  root.traverse((node) => {
    if (!isMesh(node)) {
      return;
    }
    node.updateWorldMatrix(true, false);
    let placement = node.matrixWorld.clone();
    if (isSkinnedMesh(node)) {
      first ??= node;
      placement =
        node === first ? new THREE.Matrix4() : sharedBind(node, first);
    }
    primitives.push({
      geometry: fileSpaceGeometry(node.geometry, placement),
      slot: slotOf(node),
    });
  });
  return primitives;
};

const samplePoses = (clip: THREE.AnimationClip) => {
  const turns = clip.tracks.filter((track) =>
    track.name.endsWith(".quaternion")
  );
  const bones = turns.map((track) => track.name.replace(".quaternion", ""));
  const poses = new Map<PoseName, number[]>();
  const pelvis = new Map<PoseName, THREE.Vector3>();
  const moved = clip.tracks.find((track) => track.name === "pelvis.position");
  for (let frame = 0; frame < POSE_NAMES.length; frame += 1) {
    const name = POSE_NAMES[frame];
    if (name === undefined) {
      continue;
    }
    const pose: number[] = [];
    for (const track of turns) {
      const key = Math.min(frame, track.times.length - 1);
      pose.push(...track.values.subarray(key * 4, key * 4 + 4));
    }
    poses.set(name, pose);
    pelvis.set(
      name,
      moved
        ? new THREE.Vector3().fromArray(
            moved.values,
            Math.min(frame, moved.times.length - 1) * 3
          )
        : new THREE.Vector3()
    );
  }
  return { bones, pelvis, poses };
};

const toGame = (root: THREE.Object3D, local: THREE.Vector3): THREE.Vector3 => {
  const placed = local
    .clone()
    .applyQuaternion(root.quaternion)
    .add(root.position);
  return placed.set(-placed.x, placed.y, -placed.z);
};

export interface Decoded<Value> {
  readonly value: Value;
  readonly release: () => void;
}

export type Parse<Value> = (
  bytes: ArrayBuffer,
  url: string
) => Promise<Decoded<Value>>;

export interface AssetParsers {
  readonly parts: Parse<ModelParts>;
  readonly whole: Parse<readonly Primitive[]>;
  readonly rider: Parse<RiderAsset>;
  readonly walkers: Parse<WalkerAsset>;
}

export type LoadCelebrity = (
  id: CelebrityId,
  signal: AbortSignal
) => Promise<Decoded<RiderAsset> | null>;

export interface AcquiredAssets {
  readonly assets: Assets;
  readonly release: () => void;
  readonly loadCelebrity: LoadCelebrity;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const atlasesOf = (root: THREE.Object3D): THREE.Texture[] => {
  const atlases = new Set<THREE.Texture>();
  root.traverse((node) => {
    if (isMesh(node)) {
      for (const material of [node.material].flat()) {
        const atlas = atlasOf(material);
        if (atlas) {
          atlases.add(atlas);
        }
      }
    }
  });
  return [...atlases];
};

const releaseOf =
  (root: THREE.Object3D, made: readonly Primitive[]) => (): void => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse((node) => {
      if (isSkinnedMesh(node)) {
        node.skeleton.dispose();
      }
      if (isMesh(node)) {
        geometries.add(node.geometry);
        for (const material of [node.material].flat()) {
          materials.add(material);
        }
      }
    });
    for (const primitive of made) {
      geometries.add(primitive.geometry);
    }
    for (const geometry of geometries) {
      geometry.dispose();
    }
    for (const material of materials) {
      material.dispose();
    }
    for (const atlas of atlasesOf(root)) {
      const image: unknown = atlas.image;
      atlas.dispose();
      if (image instanceof ImageBitmap) {
        image.close();
      }
    }
  };

const decoded = <Value>(
  root: THREE.Object3D,
  made: readonly Primitive[],
  value: Value
): Decoded<Value> => ({ release: releaseOf(root, made), value });

const parsed = async (bytes: ArrayBuffer): Promise<GLTF> =>
  await loader.parseAsync(bytes, "");

const rider: Parse<RiderAsset> = async (bytes, url) => {
  const gltf = await parsed(bytes);
  const [clip] = gltf.animations;
  const rootBone = gltf.scene.getObjectByName("Root");
  if (!(clip && rootBone)) {
    releaseOf(gltf.scene, [])();
    throw new Error(`The rider model ${url} has no poses.`);
  }
  const { bones, pelvis, poses } = samplePoses(clip);
  const seat = toGame(rootBone, pelvis.get("seated") ?? new THREE.Vector3());
  const stand = toGame(rootBone, pelvis.get("rest") ?? new THREE.Vector3());
  const primitives = primitivesOf(gltf.scene);
  const atlases = atlasesOf(gltf.scene);
  if (atlases.length > 1) {
    releaseOf(gltf.scene, primitives)();
    throw new Error(
      `The rider model ${url} paints from ${atlases.length} atlases; a rider has one.`
    );
  }
  const [atlas = null] = atlases;
  if (atlas && primitives.some(({ slot }) => slot !== ATLAS)) {
    releaseOf(gltf.scene, primitives)();
    throw new Error(
      `The rider model ${url} paints some parts from colour slots; a textured rider paints every part from its atlas.`
    );
  }
  return decoded(gltf.scene, primitives, {
    atlas,
    bones,
    poses,
    primitives,
    scene: gltf.scene,
    seat,
    standHeight: stand.y,
  });
};

const parts: Parse<ModelParts> = async (bytes) => {
  const gltf = await parsed(bytes);
  const byName = new Map<string, readonly Primitive[]>();
  for (const child of gltf.scene.children) {
    byName.set(child.name, primitivesOf(child));
  }
  return decoded(gltf.scene, [...byName.values()].flat(), byName);
};

const whole: Parse<readonly Primitive[]> = async (bytes) => {
  const gltf = await parsed(bytes);
  const primitives = primitivesOf(gltf.scene);
  return decoded(gltf.scene, primitives, primitives);
};

const CLIP_FPS = 30;
const POSE_ROW_TEXELS = 4;
const WHITE = new THREE.Color("#ffffff");

const framesOf = (clip: THREE.AnimationClip, name: WalkerClipName): number => {
  const counted = Math.round(clip.duration * CLIP_FPS) + 1;
  return walkerClipLoops[name] ? counted - 1 : counted;
};

interface BakedClip {
  readonly clip: THREE.AnimationClip;
  readonly frames: number;
}

const clipsOf = (
  animations: readonly THREE.AnimationClip[],
  refused: (why: string) => Error
) => {
  const baked: BakedClip[] = [];
  let start = 0;
  const slot = (name: WalkerClipName): WalkerClip => {
    const clip = animations.find((each) => each.name === name);
    if (!clip) {
      throw refused(`is missing the ${name} clip.`);
    }
    const frames = framesOf(clip, name);
    const made = { frames, start };
    baked.push({ clip, frames });
    start += frames;
    return made;
  };
  const clips: WalkerClips = {
    browse: slot("browse"),
    fall: slot("fall"),
    flinch: slot("flinch"),
    get_up: slot("get_up"),
    haggle: slot("haggle"),
    lie: slot("lie"),
    run: slot("run"),
    serve: slot("serve"),
    wait: slot("wait"),
    walk: slot("walk"),
  };
  return { baked, clips };
};

const channelOf = (root: THREE.Object3D, track: THREE.KeyframeTrack) => {
  const target = THREE.PropertyBinding.parseTrackName(track.name);
  const Sampler =
    target.propertyName === "quaternion"
      ? THREE.QuaternionLinearInterpolant
      : THREE.LinearInterpolant;
  const size = track.getValueSize();
  const value = new Float32Array(size);
  return {
    node: root.getObjectByName(target.nodeName),
    property: target.propertyName,
    sampler: new Sampler(track.times, track.values, size, value),
    value,
  };
};

const posedBy = (
  root: THREE.Object3D,
  clip: THREE.AnimationClip
): ((time: number) => void) => {
  const channels = clip.tracks.map((track) => channelOf(root, track));
  return (time) => {
    for (const { node, property, sampler, value } of channels) {
      sampler.evaluate(time);
      if (property === "quaternion") {
        node?.quaternion.fromArray(value);
      } else {
        node?.position.fromArray(value);
      }
    }
  };
};

const bakePoses = (
  root: THREE.Object3D,
  skeleton: THREE.Skeleton,
  baked: readonly BakedClip[]
): THREE.DataTexture => {
  const { bones, boneInverses } = skeleton;
  const width = bones.length * POSE_TEXELS_PER_BONE;
  const height = baked.reduce((total, { frames }) => total + frames, 0);
  const values = new Float32Array(width * height * POSE_ROW_TEXELS);
  const matrix = new THREE.Matrix4();
  let write = 0;
  for (const { clip, frames } of baked) {
    const poseAt = posedBy(root, clip);
    for (let frame = 0; frame < frames; frame += 1) {
      poseAt(frame / CLIP_FPS);
      root.updateMatrixWorld(true);
      for (let bone = 0; bone < bones.length; bone += 1) {
        const joint = bones[bone];
        const inverse = boneInverses[bone];
        if (!(joint && inverse)) {
          throw new Error("A walker joint has no bind pose.");
        }
        const { elements } = matrix.multiplyMatrices(
          joint.matrixWorld,
          inverse
        );
        for (let row = 0; row < POSE_TEXELS_PER_BONE; row += 1) {
          for (let column = 0; column < POSE_ROW_TEXELS; column += 1) {
            values[write] = elements[column * POSE_ROW_TEXELS + row] ?? 0;
            write += 1;
          }
        }
      }
    }
  }
  const poses = new THREE.DataTexture(
    values,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  poses.minFilter = THREE.NearestFilter;
  poses.magFilter = THREE.NearestFilter;
  poses.needsUpdate = true;
  return poses;
};

const walkers: Parse<WalkerAsset> = async (bytes, url) => {
  const gltf = await parsed(bytes);
  const refused = (why: string): Error => {
    releaseOf(gltf.scene, [])();
    return new Error(`The walker model ${url} ${why}`);
  };
  const meshes = walkerBodies.map(({ name }) => {
    const mesh = gltf.scene.getObjectByName(name);
    return mesh && isSkinnedMesh(mesh) ? mesh : null;
  });
  const [first] = meshes;
  const [atlas] = atlasesOf(gltf.scene);
  if (!first || meshes.includes(null)) {
    throw refused("is missing a body.");
  }
  if (!atlas) {
    throw refused("has no palette.");
  }
  atlas.minFilter = THREE.NearestFilter;
  atlas.magFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  const geometries = meshes.map((mesh) =>
    coloured(
      {
        geometry: mesh
          ? fileSpaceGeometry(mesh.geometry, sharedBind(mesh, first))
          : first.geometry,
        slot: ATLAS,
      },
      WHITE,
      0
    )
  );
  const { baked, clips } = clipsOf(gltf.animations, refused);
  const poses = bakePoses(gltf.scene, first.skeleton, baked);
  const release = releaseOf(
    gltf.scene,
    geometries.map((geometry) => ({ geometry, slot: ATLAS }))
  );
  return {
    release: () => {
      poses.dispose();
      release();
    },
    value: { atlas, clips, geometries, poses },
  };
};

export const assetParsers: AssetParsers = { parts, rider, walkers, whole };
