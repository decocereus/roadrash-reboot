import type { Hazard } from "@racer/sim/state";
import { createRandom } from "@racer/track/random";
import { placeOnTrack } from "@racer/track/track";
import type { Track, TrackPoint, TrackProp } from "@racer/track/track";
import * as THREE from "three";

import { createShading, onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { createCity, FRONT_GAP, KERB_HEIGHT } from "./city.ts";
import type { City } from "./city.ts";
import { createClearance } from "./clearance.ts";
import type { Clearance } from "./clearance.ts";
import { disposeTree } from "./dispose.ts";
import { buildGreybox, coverPalette } from "./greybox.ts";
import {
  freeze,
  groundLift,
  KERB_WIDTH,
  lifted,
  plant,
  rolling,
  showWithin,
  smoothstep,
} from "./ground.ts";
import type { Stretch } from "./ground.ts";
import { createHazardMarks } from "./hazards.ts";
import { lookOf } from "./looks.ts";
import type { Look } from "./looks.ts";
import { buildRamps } from "./ramps.ts";
import { paveTexture, ROAD_TILE_METRES, roadTexture } from "./road-texture.ts";
import { boulderParts, buildRoadside, pineParts } from "./roadside.ts";
import { bannerTexture, chevronTexture } from "./sign-textures.ts";
import { skyTexture } from "./sky-texture.ts";
import { owned } from "./texture-canvas.ts";

const CHUNK_LENGTH = 200;
const CHUNK_BEHIND = 260;
const CHUNK_MARGIN = 200;
const ROAD_STEP = 2;
const TERRAIN_STEP = 4;
const TERRAIN_RINGS = [0, 1.5, 4, 9, 20, 45, 90, 160];
const SKY_RADIUS = 4000;
const SHADOW_SPAN = 70;
export const SHADOW_MAP = 4096;
const SHADOW_AHEAD = 42;
const SHADOW_DISTANCE = 300;
const SUN_ELEVATION = 0.08;
const MOON_ELEVATION = 0.2;
const MOON_BEARING = new THREE.Vector3(0.35, 0, -0.92).normalize();
const POLE = "#221a30";

const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
const tint = new THREE.Color();
const placer = new THREE.Object3D();

type Rail = readonly [offset: number, lift: number, u: number];

const buildRibbon = (
  track: Track,
  span: readonly [number, number],
  rails: readonly Rail[],
  tile: number
): THREE.BufferGeometry => {
  const [from, to] = span;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const columns = rails.length;
  let row = 0;
  for (let s = from; s <= to; s += ROAD_STEP) {
    for (const [offset, lift, u] of rails) {
      placeOnTrack(track, s, offset, point);
      positions.push(point.x, point.y + lift, point.z);
      uvs.push(u, s / tile);
    }
    if (s + ROAD_STEP <= to) {
      for (let column = 0; column < columns - 1; column += 1) {
        const near = row * columns + column;
        const far = near + columns;
        indices.push(near, near + 1, far, near + 1, far + 1, far);
      }
    }
    row += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const terrainColor = (
  look: Look,
  ring: number,
  worldX: number,
  worldZ: number
): THREE.Color => {
  if (ring <= 1) {
    return tint.set(look.walk);
  }
  const patch = (rolling(worldX * 3.1, worldZ * 2.7) + 1.5) / 3;
  return tint
    .set(look.groundNear)
    .lerp(new THREE.Color(look.groundFar), smoothstep((ring - 2) / 5))
    .lerp(new THREE.Color(look.groundPatch), patch * 0.35);
};

const buildTerrainChunk = (
  track: Track,
  span: readonly [number, number],
  side: number,
  look: Look
): THREE.BufferGeometry => {
  const [from, to] = span;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const columns = TERRAIN_RINGS.length;
  let row = 0;
  for (let s = from; s <= to; s += TERRAIN_STEP) {
    const bend = track.curvature[Math.round(s - track.startS)] ?? 0;
    const inside = side * bend > 0;
    const reach = inside ? 0.8 / Math.abs(bend) : Number.POSITIVE_INFINITY;
    for (let ring = 0; ring < TERRAIN_RINGS.length; ring += 1) {
      const offset = TERRAIN_RINGS[ring];
      if (offset === undefined) {
        continue;
      }
      const distance = Math.min(offset, reach);
      placeOnTrack(track, s, side * (track.roadHalfWidth + distance), point);
      const lift = groundLift("open", distance, point.x, point.z);
      positions.push(point.x, point.y + lift, point.z);
      const color = terrainColor(look, ring, point.x, point.z);
      colors.push(color.r, color.g, color.b);
    }
    if (s + TERRAIN_STEP <= to) {
      for (let column = 0; column < columns - 1; column += 1) {
        const near = row * columns + column;
        const far = near + columns;
        if (side > 0) {
          indices.push(near, near + 1, far, near + 1, far + 1, far);
        } else {
          indices.push(near, far, near + 1, near + 1, far, far + 1);
        }
      }
    }
    row += 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const buildGate = (
  track: Track,
  s: number,
  label: string,
  shading: Shading,
  textures: Set<THREE.Texture>,
  clearance: Clearance
): THREE.Group => {
  const gate = new THREE.Group();
  const span = track.roadHalfWidth * 2 + 3;
  const steel = shading.cel(POLE, { rim: 0.6 });
  const posts = [-1, 1].map((side) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), steel);
    post.position.set((side * span) / 2, 3.5, 0);
    post.castShadow = true;
    gate.add(post);
    return post;
  });
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(span, 1.3, 0.3),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffffff").multiplyScalar(1.4),
      map: owned(textures, bannerTexture(label)),
    })
  );
  banner.position.set(0, 6.4, 0);
  gate.add(banner);
  placeOnTrack(track, s, 0, point);
  gate.position.set(point.x, point.y, point.z);
  gate.rotation.set(0, -point.heading, 0);
  for (const post of posts) {
    clearance.addObject(post);
  }
  return gate;
};

const buildScenery = (
  track: Track,
  shading: Shading,
  limit: number,
  textures: Set<THREE.Texture>,
  clearance: Clearance
): THREE.Group => {
  const { look } = shading;
  const scenery = new THREE.Group();
  const city = look.kit === "city";
  const ofKind = (kind: TrackProp["kind"]): TrackProp[] =>
    track.props.filter(
      (prop) => prop.kind === kind && Math.abs(prop.x) < limit
    );

  plant(
    clearance,
    scenery,
    track,
    ofKind("tree"),
    city
      ? [
          {
            geometry: lifted(
              new THREE.CylinderGeometry(0.14, 0.2, 3, 6),
              [0, 1.5, 0]
            ),
            material: shading.cel(look.trunk),
          },
          {
            geometry: lifted(new THREE.IcosahedronGeometry(1.5, 1), [0, 4, 0]),
            material: shading.cel(look.foliage[0]),
          },
          {
            geometry: lifted(
              new THREE.IcosahedronGeometry(1.05, 1),
              [0.5, 5, 0.3]
            ),
            material: shading.cel(look.foliage[1]),
          },
        ]
      : pineParts(shading)
  );
  plant(clearance, scenery, track, ofKind("pole"), [
    {
      geometry: lifted(
        new THREE.CylinderGeometry(0.08, 0.13, 9.2, 8),
        [0, 4.6, 0]
      ),
      material: shading.cel(POLE, { rim: 0.6 }),
    },
    {
      geometry: lifted(new THREE.BoxGeometry(3, 0.12, 0.14), [-1.4, 9.1, 0]),
      material: shading.cel(POLE),
    },
    {
      geometry: lifted(new THREE.BoxGeometry(1.1, 0.09, 0.34), [-2.5, 9, 0]),
      material: shading.glow(look.lamp, 2.2),
    },
  ]);
  plant(
    clearance,
    scenery,
    track,
    ofKind("chevron"),
    [
      {
        geometry: lifted(
          new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6),
          [0, 0.7, 0]
        ),
        material: shading.cel(POLE),
      },
      {
        geometry: lifted(new THREE.PlaneGeometry(1.2, 0.9), [0, 1.6, 0]),
        material: new THREE.MeshBasicMaterial({
          map: owned(textures, chevronTexture()),
          side: THREE.DoubleSide,
        }),
      },
    ],
    true
  );
  plant(
    clearance,
    scenery,
    track,
    ofKind("rock"),
    city
      ? [
          {
            geometry: lifted(
              new THREE.BoxGeometry(1.3, 0.9, 1.3),
              [0, 0.45, 0]
            ),
            material: shading.cel(look.kerb),
          },
          {
            geometry: lifted(
              new THREE.BoxGeometry(1.34, 0.16, 1.34),
              [0, 0.62, 0]
            ),
            material: shading.cel(look.centre),
          },
        ]
      : boulderParts(shading)
  );
  scenery.add(
    buildGate(track, 0, "START", shading, textures, clearance),
    buildGate(track, track.length, "FINISH", shading, textures, clearance)
  );
  return scenery;
};

const buildSky = (
  look: Look,
  shading: Shading,
  seed: number,
  textures: Set<THREE.Texture>
): THREE.Mesh => {
  const mark =
    look.sun === null
      ? MOON_BEARING.clone()
      : shading.key.clone().setY(0).normalize();
  const turn = Math.atan2(mark.z, -mark.x) / (Math.PI * 2);
  const elevation = look.sun === null ? MOON_ELEVATION : SUN_ELEVATION;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 48, 24),
    new THREE.MeshBasicMaterial({
      depthWrite: false,
      fog: false,
      map: owned(
        textures,
        skyTexture(createRandom(seed), look, [
          ((turn % 1) + 1) % 1,
          0.5 - elevation / Math.PI,
        ])
      ),
      side: THREE.BackSide,
    })
  );
  sky.renderOrder = -2;
  return onFxLayer(sky);
};

const buildMountains = (look: Look): THREE.InstancedMesh => {
  const count = 44;
  const mountains = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 5),
    new THREE.MeshBasicMaterial({ color: look.backdrop, fog: false }),
    count
  );
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const height = 260 + 240 * Math.abs(Math.sin(index * 2.3 + 0.7));
    placer.position.set(
      Math.sin(angle) * 3000,
      height / 2 - 60,
      Math.cos(angle) * 3000
    );
    placer.rotation.set(0, index * 1.7, 0);
    placer.scale.set(420 + 260 * Math.abs(Math.cos(index * 1.1)), height, 420);
    placer.updateMatrix();
    mountains.setMatrixAt(index, placer.matrix);
  }
  mountains.frustumCulled = false;
  return onFxLayer(mountains);
};

interface SunRig {
  readonly light: THREE.DirectionalLight;
  follow: (camera: THREE.Camera) => void;
  setMapSize: (size: number) => void;
}

const createSunRig = (shading: Shading, mapSize: number): SunRig => {
  const light = new THREE.DirectionalLight(shading.sun, 1);
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.camera.left = -SHADOW_SPAN;
  light.shadow.camera.right = SHADOW_SPAN;
  light.shadow.camera.top = SHADOW_SPAN;
  light.shadow.camera.bottom = -SHADOW_SPAN;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_DISTANCE * 2;
  light.shadow.bias = -0.0008;
  light.shadow.normalBias = 0.04;
  const across = new THREE.Vector3(0, 1, 0).cross(shading.key).normalize();
  const upward = shading.key.clone().cross(across).normalize();
  let texel = (SHADOW_SPAN * 2) / mapSize;
  const forward = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const snapped = new THREE.Vector3();
  return {
    follow(camera) {
      camera.getWorldDirection(forward);
      forward.setY(0).normalize();
      focus.copy(camera.position).addScaledVector(forward, SHADOW_AHEAD);
      focus.y -= 2;
      snapped
        .copy(across)
        .multiplyScalar(Math.round(focus.dot(across) / texel) * texel)
        .addScaledVector(upward, Math.round(focus.dot(upward) / texel) * texel)
        .addScaledVector(shading.key, focus.dot(shading.key));
      light.target.position.copy(snapped);
      light.position
        .copy(snapped)
        .addScaledVector(shading.key, SHADOW_DISTANCE);
      light.target.updateMatrixWorld();
    },
    light,
    setMapSize(size) {
      if (size === light.shadow.mapSize.x) {
        return;
      }
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose();
      light.shadow.map = null;
      texel = (SHADOW_SPAN * 2) / size;
    },
  };
};

export interface World {
  readonly scene: THREE.Scene;
  readonly shading: Shading;
  follow: (camera: THREE.Camera, s: number) => void;
  showHazards: (hazards: readonly Hazard[], s: number) => void;
  samples: () => THREE.Group;
  setShadowMap: (size: number) => void;
  dispose: () => void;
}

export const createWorld = (track: Track, shadowMap = SHADOW_MAP): World => {
  const look = lookOf(track.plan.region);
  const shading = createShading(look);
  const random = createRandom(track.plan.seed + 5);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(look.fog);
  scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
  scene.add(new THREE.AmbientLight(shading.ambient, 1));
  const rig = createSunRig(shading, shadowMap);
  scene.add(rig.light, rig.light.target);
  const stretches: Stretch[] = [];
  const clearance = createClearance();

  const half = track.roadHalfWidth;
  const textures = new Set<THREE.Texture>();
  const paved = roadTexture(random, look, track);
  textures.add(paved.map).add(paved.glow);
  const roadMaterial = shading.cel("#ffffff", {
    emissiveIntensity: 0.9,
    emissiveMap: paved.glow,
    map: paved.map,
  });
  if (look.wet) {
    roadMaterial.emissive.set("#ffffff");
  }
  const city: City | null =
    look.kit === "city" ? createCity(track, shading) : null;
  const edge = track.vergeHalfWidth + FRONT_GAP + 0.6;
  const walkTexture = owned(textures, paveTexture(look));
  const walkMaterial = shading.cel("#ffffff", { map: walkTexture });
  const kerbMaterial = shading.cel(look.kerb);
  const terrainMaterial = shading.cel("#ffffff", { vertexColors: true });
  const { scenery } = track.plan;
  const vergeMaterial = scenery
    ? shading.cel(coverPalette(look, scenery.cover).near)
    : null;
  const verge = track.vergeHalfWidth;

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    span: readonly [number, number]
  ): void => {
    const mesh = freeze(new THREE.Mesh(geometry, material));
    mesh.receiveShadow = true;
    scene.add(mesh);
    stretches.push({ from: span[0], object: mesh, to: span[1] });
  };

  for (let from = track.startS; from < track.endS; from += CHUNK_LENGTH) {
    const span = [from, Math.min(track.endS, from + CHUNK_LENGTH)] as const;
    add(
      buildRibbon(
        track,
        span,
        [
          [-half, 0, 0],
          [half, 0, 1],
        ],
        ROAD_TILE_METRES
      ),
      roadMaterial,
      span
    );
    for (const side of [-1, 1]) {
      if (city) {
        const kerb: Rail[] = [
          [side * half, 0, 0],
          [side * half, KERB_HEIGHT, 0],
          [side * (half + KERB_WIDTH), KERB_HEIGHT, 0],
        ];
        const walk: Rail[] = [
          [side * (half + KERB_WIDTH), KERB_HEIGHT, 0],
          [side * edge, KERB_HEIGHT, (edge - half) / 2],
        ];
        add(
          buildRibbon(track, span, side > 0 ? kerb : kerb.toReversed(), 2),
          kerbMaterial,
          span
        );
        add(
          buildRibbon(track, span, side > 0 ? walk : walk.toReversed(), 2),
          walkMaterial,
          span
        );
      } else if (vergeMaterial) {
        const shoulder: Rail[] = [
          [side * half, 0, 0],
          [side * verge, 0, 0],
          [side * (verge + 3), -0.3, 0],
        ];
        add(
          buildRibbon(
            track,
            span,
            side > 0 ? shoulder : shoulder.toReversed(),
            2
          ),
          vergeMaterial,
          span
        );
      } else {
        add(buildTerrainChunk(track, span, side, look), terrainMaterial, span);
      }
    }
  }
  scene.add(
    freeze(
      buildScenery(
        track,
        shading,
        city ? track.vergeHalfWidth + 0.4 : Number.POSITIVE_INFINITY,
        textures,
        clearance
      )
    )
  );
  const ramps = buildRamps(track, shading, clearance);
  scene.add(ramps.group);
  stretches.push(...ramps.stretches);
  const hazards = createHazardMarks(track, shading);
  scene.add(hazards.group);
  if (city) {
    scene.add(freeze(city.group));
  } else if (scenery) {
    scene.add(freeze(buildGreybox(track, scenery, shading)));
  } else {
    const dressing = buildRoadside(track, shading, textures, clearance);
    scene.add(freeze(dressing.group));
    stretches.push(...dressing.stretches);
  }

  let lowest = Number.POSITIVE_INFINITY;
  for (const height of track.worldY) {
    lowest = Math.min(lowest, height);
  }
  const plain = onFxLayer(
    new THREE.Mesh(
      new THREE.CircleGeometry(4200, 32),
      new THREE.MeshBasicMaterial({ color: look.ground })
    )
  );
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = lowest - 24;
  const sky = buildSky(look, shading, track.plan.seed + 3, textures);
  const backdrop = buildMountains(look);
  backdrop.visible = city === null && scenery?.cover !== "paving";
  scene.add(plain, sky, backdrop);

  return {
    dispose() {
      city?.group.removeFromParent();
      city?.dispose();
      hazards.dispose();
      disposeTree(scene);
      for (const texture of textures) {
        texture.dispose();
      }
      shading.dispose();
      rig.light.shadow.map?.dispose();
    },
    follow(camera, s) {
      plain.position.x = camera.position.x;
      plain.position.z = camera.position.z;
      sky.position.copy(camera.position);
      backdrop.position.set(camera.position.x, 0, camera.position.z);
      const reach = look.fogFar + CHUNK_MARGIN;
      city?.follow(s, reach);
      showWithin(stretches, s - CHUNK_BEHIND, s + reach);
      clearance.follow(camera.position);
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      rig.follow(camera);
      shading.aim(camera);
    },
    samples() {
      return city?.samples() ?? new THREE.Group();
    },
    scene,
    setShadowMap(size) {
      rig.setMapSize(size);
    },
    shading,
    showHazards(list, s) {
      hazards.show(list, s);
    },
  };
};
