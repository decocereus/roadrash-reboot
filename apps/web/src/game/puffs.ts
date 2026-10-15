import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { Shading } from "./cel.ts";
import { disposeTree } from "./dispose.ts";
import { YELLOW } from "./looks.ts";

const DUST_POOL = 48;
const SPARK_POOL = 64;
const DUST_PER_BURST = 8;
const SPARKS_PER_BURST = 10;
const SPARKS_FROM = 0.35;
const DUST_LIFE = 0.4;
const SPARK_LIFE = 0.4;
const DUST_SIZE = 0.2;
const DUST_CARRY = 0.85;
const SPARK_CARRY = 0.8;
const CITY_DUST = "#e4dfee";
const SPARK_LENGTH = 0.45;
const SPARK_GRAVITY = 14;
const DUST_DRAG = 1.2;
const WHEEL_BEHIND = 0.7;

interface Particle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  age: number;
  life: number;
  size: number;
}

export interface Puffs {
  readonly group: THREE.Group;
  burst: (bike: THREE.Object3D, strength: number, speed: number) => void;
  update: (seconds: number) => void;
  prime: () => () => void;
  dispose: () => void;
}

const pool = (count: number): Particle[] =>
  Array.from({ length: count }, () => ({
    age: 1,
    life: 0,
    position: new THREE.Vector3(),
    size: 0,
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

const settle = (
  mesh: THREE.InstancedMesh,
  particles: Particle[],
  seconds: number,
  place: (particle: Particle, shown: number) => void
): number => {
  let shown = 0;
  for (const particle of particles) {
    if (particle.age >= particle.life) {
      continue;
    }
    particle.age += seconds;
    if (particle.age < particle.life) {
      place(particle, shown);
      shown += 1;
    }
  }
  mesh.count = shown;
  if (shown > 0) {
    mesh.instanceMatrix.needsUpdate = true;
  }
  return shown;
};

export function createPuffs(shading: Shading): Puffs {
  const group = new THREE.Group();
  const dustMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    shading.cel(
      shading.look.kit === "city" ? CITY_DUST : shading.look.groundPatch,
      { rim: 0.8 }
    ),
    DUST_POOL
  );
  const sparkMesh = onFxLayer(
    new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.05, 0.05, 1),
      shading.glow(YELLOW, 2.4),
      SPARK_POOL
    )
  );
  for (const mesh of [dustMesh, sparkMesh]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
  }
  const dust = pool(DUST_POOL);
  const sparks = pool(SPARK_POOL);
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
        const particle = spawn(dust, nextDust);
        nextDust += 1;
        if (!particle) {
          continue;
        }
        const spread = Math.random() * 2 - 1;
        particle.life = DUST_LIFE * (0.6 + 0.8 * Math.random());
        particle.size =
          DUST_SIZE * (0.7 + 0.6 * amount) * (0.6 + 0.8 * Math.random());
        particle.position
          .copy(origin)
          .addScaledVector(side, spread * 0.6)
          .setY(origin.y + 0.15);
        particle.velocity
          .copy(side)
          .multiplyScalar(spread * (2 + 3 * amount))
          .addScaledVector(heading, speed * DUST_CARRY)
          .setY(0.5 + Math.random());
      }
      if (amount >= SPARKS_FROM) {
        for (let index = 0; index < SPARKS_PER_BURST; index += 1) {
          const particle = spawn(sparks, nextSpark);
          nextSpark += 1;
          if (!particle) {
            continue;
          }
          particle.life = SPARK_LIFE * (0.6 + 0.8 * Math.random());
          particle.size = SPARK_LENGTH * (0.6 + 0.6 * Math.random());
          particle.position.copy(origin).setY(origin.y + 0.05);
          particle.velocity
            .copy(heading)
            .multiplyScalar(speed * SPARK_CARRY - 6 * Math.random())
            .addScaledVector(side, (Math.random() - 0.5) * 9)
            .setY(1.5 + 3 * Math.random() * amount);
        }
      }
      live = true;
    },
    dispose() {
      disposeTree(group);
    },
    group,
    prime() {
      dustMesh.count = 1;
      sparkMesh.count = 1;
      matrix.makeScale(0, 0, 0);
      dustMesh.setMatrixAt(0, matrix);
      sparkMesh.setMatrixAt(0, matrix);
      return () => {
        dustMesh.count = 0;
        sparkMesh.count = 0;
      };
    },
    update(seconds) {
      if (!live) {
        return;
      }
      const dustShown = settle(dustMesh, dust, seconds, (particle, shown) => {
        const drag = Math.exp(-DUST_DRAG * seconds);
        particle.velocity.multiplyScalar(drag);
        particle.position.addScaledVector(particle.velocity, seconds);
        const t = particle.age / particle.life;
        const size = particle.size * Math.sin(Math.PI * Math.sqrt(t));
        matrix.compose(
          particle.position,
          turn.identity(),
          scale.set(size, size * 0.6, size)
        );
        dustMesh.setMatrixAt(shown, matrix);
      });
      const sparkShown = settle(
        sparkMesh,
        sparks,
        seconds,
        (particle, shown) => {
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
          sparkMesh.setMatrixAt(shown, matrix);
        }
      );
      live = dustShown + sparkShown > 0;
    },
  };
}
