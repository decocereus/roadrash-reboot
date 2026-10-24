import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { BikeModelId } from "./bike-models.ts";
import { RED } from "./looks.ts";
import { isMesh, isSkinnedMesh } from "./meshes.ts";

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

export type BikeParts = ReadonlyMap<string, readonly Primitive[]>;

const ATLAS = "atlas";

export interface Assets {
  readonly bikes: Readonly<Record<BikeModelId, BikeParts>>;
  readonly car: readonly Primitive[];
  readonly van: readonly Primitive[];
  readonly riders: readonly RiderAsset[];
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
  for (const name of [
    "position",
    "normal",
    "uv",
    ATLAS,
    "skinIndex",
    "skinWeight",
  ]) {
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
  readonly parts: Parse<BikeParts>;
  readonly whole: Parse<readonly Primitive[]>;
  readonly rider: Parse<RiderAsset>;
}

export interface AcquiredAssets {
  readonly assets: Assets;
  readonly release: () => void;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

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
      atlasOf(material)?.dispose();
      material.dispose();
    }
  };

const decoded = <Value>(
  root: THREE.Object3D,
  made: readonly Primitive[],
  value: Value
): Decoded<Value> => ({ release: releaseOf(root, made), value });

const parsed = async (bytes: ArrayBuffer): Promise<GLTF> =>
  await loader.parseAsync(bytes, "");

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

const sampleAtlas = ({ geometry, slot }: Primitive): void => {
  const { count } = geometry.getAttribute("position");
  if (!geometry.hasAttribute("uv")) {
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(count * 2), 2)
    );
  }
  geometry.setAttribute(
    ATLAS,
    new THREE.BufferAttribute(
      new Float32Array(count).fill(slot === ATLAS ? 1 : 0),
      1
    )
  );
};

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
  if (atlas) {
    for (const primitive of primitives) {
      sampleAtlas(primitive);
    }
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

const parts: Parse<BikeParts> = async (bytes) => {
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

export const assetParsers: AssetParsers = { parts, rider, whole };
