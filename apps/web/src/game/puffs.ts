import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { YELLOW } from "./looks.ts";

const DUST_POOL = 72;
const SPARK_POOL = 64;
const DUST_PER_BURST = 9;
const SPARKS_PER_BURST = 12;
const SPARKS_FROM = 0.35;
const DUST_LIFE = 0.5;
const SPARK_LIFE = 0.28;
const DUST_START = 0.4;
const DUST_GROWTH = 1.2;
const DUST_ALPHA = 0.42;
const DUST_CARRY = 0.82;
const DUST_DRAG = 2.4;
const DUST_RISE = 0.6;
const DUST_SEAT = 0.45;
const SPARK_CARRY = 0.85;
const SPARK_LENGTH = 0.55;
const SPARK_GRAVITY = 14;
const SPARK_GLOW = 3;
const WHEEL_BEHIND = 0.7;

interface Particle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  floor: number;
  age: number;
  life: number;
  size: number;
  strength: number;
}

export interface Puffs {
  readonly group: THREE.Group;
  burst: (bike: THREE.Object3D, strength: number, speed: number) => void;
  update: (seconds: number) => void;
  prime: () => () => void;
  dispose: () => void;
}

const DUST_VERTEX = `
attribute float size;
attribute float alpha;
uniform float pointScale;
varying float vAlpha;
void main() {
  vec4 viewed = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewed;
  gl_PointSize = size * pointScale / max(0.2, -viewed.z);
  vAlpha = alpha;
}`;

const DUST_FRAGMENT = `
uniform vec3 colour;
varying float vAlpha;
void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float reach = dot(offset, offset);
  if (reach > 1.0) discard;
  float soft = 1.0 - reach;
  gl_FragColor = vec4(colour, vAlpha * soft * soft);
}`;

const pool = (count: number): Particle[] =>
  Array.from({ length: count }, () => ({
    age: 1,
    floor: 0,
    life: 0,
    position: new THREE.Vector3(),
    size: 0,
    strength: 0,
    velocity: new THREE.Vector3(),
  }));

const spawn = (particles: Particle[], next: number): Particle | undefined => {
  const particle = particles[next % particles.length];
  if (particle) {
    particle.age = 0;
  }
  return particle;
};

const FORWARD = new THREE.Vector3(0, 0, -1);
const matrix = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const scale = new THREE.Vector3();
const heading = new THREE.Vector3();
const side = new THREE.Vector3();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const bufferSize = new THREE.Vector2();

const ageAll = (particles: Particle[], seconds: number): void => {
  for (const particle of particles) {
    if (particle.age < particle.life) {
      particle.age += seconds;
    }
  }
};

const createDust = (colour: THREE.ColorRepresentation) => {
  const positions = new Float32Array(DUST_POOL * 3);
  const sizes = new Float32Array(DUST_POOL);
  const alphas = new Float32Array(DUST_POOL);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  const size = new THREE.BufferAttribute(sizes, 1);
  const alpha = new THREE.BufferAttribute(alphas, 1);
  for (const attribute of [position, size, alpha]) {
    attribute.setUsage(THREE.DynamicDrawUsage);
  }
  geometry.setAttribute("position", position);
  geometry.setAttribute("size", size);
  geometry.setAttribute("alpha", alpha);
  geometry.setDrawRange(0, 0);
  const pointScale = { value: 1 };
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    fragmentShader: DUST_FRAGMENT,
    transparent: true,
    uniforms: {
      colour: { value: new THREE.Color(colour) },
      pointScale,
    },
    vertexShader: DUST_VERTEX,
  });
  const points = onFxLayer(new THREE.Points(geometry, material));
  points.frustumCulled = false;
  points.onBeforeRender = (renderer, _scene, camera) => {
    const target = renderer.getRenderTarget();
    const height = target
      ? target.height
      : renderer.getDrawingBufferSize(bufferSize).y;
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 60;
    pointScale.value =
      height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  };
  const particles = pool(DUST_POOL);
  const settle = (seconds: number): number => {
    ageAll(particles, seconds);
    const drag = Math.exp(-DUST_DRAG * seconds);
    let shown = 0;
    for (const particle of particles) {
      if (particle.age >= particle.life) {
        continue;
      }
      particle.velocity.multiplyScalar(drag);
      particle.position.addScaledVector(particle.velocity, seconds);
      const t = particle.age / particle.life;
      const fade = (1 - t) * (1 - t);
      const across = particle.size * (DUST_START + DUST_GROWTH * Math.sqrt(t));
      particle.floor += particle.velocity.y * seconds;
      particle.position.y = particle.floor + DUST_SEAT * across;
      particle.position.toArray(positions, shown * 3);
      sizes[shown] = across;
      alphas[shown] = DUST_ALPHA * particle.strength * fade;
      shown += 1;
    }
    geometry.setDrawRange(0, shown);
    if (shown > 0) {
      position.needsUpdate = true;
      size.needsUpdate = true;
      alpha.needsUpdate = true;
    }
    return shown;
  };
  return { particles, points, settle };
};

const createSparks = (shading: Shading) => {
  const mesh = onFxLayer(
    new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.025, 0.025, 1),
      shading.glow(YELLOW, SPARK_GLOW),
      SPARK_POOL
    )
  );
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const particles = pool(SPARK_POOL);
  const settle = (seconds: number): number => {
    ageAll(particles, seconds);
    let shown = 0;
    for (const particle of particles) {
      if (particle.age >= particle.life) {
        continue;
      }
      particle.velocity.y -= SPARK_GRAVITY * seconds;
      particle.position.addScaledVector(particle.velocity, seconds);
      direction.copy(particle.velocity).normalize();
      turn.setFromUnitVectors(FORWARD, direction);
      const fade = 1 - particle.age / particle.life;
      matrix.compose(
        particle.position,
        turn,
        scale.set(fade, fade, particle.size * fade)
      );
      mesh.setMatrixAt(shown, matrix);
      shown += 1;
    }
    mesh.count = shown;
    if (shown > 0) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    return shown;
  };
  return { mesh, particles, settle };
};

export function createPuffs(shading: Shading): Puffs {
  const group = new THREE.Group();
  const dust = createDust(shading.look.dust);
  const sparks = createSparks(shading);
  group.add(dust.points, sparks.mesh);
  let nextDust = 0;
  let nextSpark = 0;
  let live = false;

  return {
    burst(bike, strength, speed) {
      const amount = Math.min(1, Math.max(0, strength));
      heading.copy(FORWARD).applyQuaternion(bike.quaternion);
      side.set(heading.z, 0, -heading.x).normalize();
      origin.copy(bike.position).addScaledVector(heading, -WHEEL_BEHIND);
      for (let index = 0; index < DUST_PER_BURST; index += 1) {
        const particle = spawn(dust.particles, nextDust);
        nextDust += 1;
        if (!particle) {
          continue;
        }
        const spread = Math.random() * 2 - 1;
        particle.life = DUST_LIFE * (0.8 + 0.4 * Math.random());
        particle.size = (0.7 + 0.5 * amount) * (0.75 + 0.5 * Math.random());
        particle.strength = 0.4 + 0.6 * amount;
        particle.floor = origin.y;
        particle.position.copy(origin).addScaledVector(side, spread * 0.5);
        particle.velocity
          .copy(side)
          .multiplyScalar(spread * (1.5 + 3 * amount))
          .addScaledVector(heading, speed * DUST_CARRY)
          .setY(DUST_RISE * (0.4 + Math.random()));
      }
      if (amount >= SPARKS_FROM) {
        for (let index = 0; index < SPARKS_PER_BURST; index += 1) {
          const particle = spawn(sparks.particles, nextSpark);
          nextSpark += 1;
          if (!particle) {
            continue;
          }
          particle.life = SPARK_LIFE * (0.6 + 0.8 * Math.random());
          particle.size = SPARK_LENGTH * (0.6 + 0.8 * Math.random());
          particle.position.copy(origin).setY(origin.y + 0.05);
          particle.velocity
            .copy(heading)
            .multiplyScalar(speed * SPARK_CARRY - 6 * Math.random())
            .addScaledVector(side, (Math.random() - 0.5) * 9)
            .setY(1 + 3 * Math.random() * amount);
        }
      }
      live = true;
    },
    dispose() {
      disposeTree(group);
    },
    group,
    prime() {
      dust.points.geometry.setDrawRange(0, 1);
      sparks.mesh.count = 1;
      matrix.makeScale(0, 0, 0);
      sparks.mesh.setMatrixAt(0, matrix);
      return () => {
        dust.points.geometry.setDrawRange(0, 0);
        sparks.mesh.count = 0;
      };
    },
    update(seconds) {
      if (!live) {
        return;
      }
      live = dust.settle(seconds) + sparks.settle(seconds) > 0;
    },
  };
}
