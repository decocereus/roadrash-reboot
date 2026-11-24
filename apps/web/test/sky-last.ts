import { trackFor } from "@racer/track/roads";
import * as THREE from "three";

import { createChaseCamera } from "../src/game/chase-camera.ts";
import { createRenderer } from "../src/game/game.ts";
import { createPipeline } from "../src/game/post.ts";
import { presets } from "../src/game/presets.ts";
import { createWorld } from "../src/game/world.ts";
import { acquire } from "./bike-contact.ts";

const WIDTH = 960;
const HEIGHT = 540;
const SETTLE_FRAMES = 120;
const SKY_FIRST = -2;
const track = trackFor("slag-row");
const shares = [0.1, 0.45, 0.8] as const;
const hours = [0.2, 0.6, 1] as const;
const pictures = ["lean", "full"] as const;

interface Frame {
  readonly picture: (typeof pictures)[number];
  readonly s: number;
  readonly hour: number;
  readonly skyPixels: number;
  readonly apart: number;
}

const skyOf = (
  scene: THREE.Scene
): { readonly mesh: THREE.Mesh; readonly material: THREE.ShaderMaterial } => {
  const found: { mesh: THREE.Mesh; material: THREE.ShaderMaterial }[] = [];
  scene.traverse((node) => {
    if (
      node instanceof THREE.Mesh &&
      node.material instanceof THREE.ShaderMaterial
    ) {
      found.push({ material: node.material, mesh: node });
    }
  });
  const [sky] = found;
  if (!sky) {
    throw new Error("The world has no sky.");
  }
  return sky;
};

const pixelsApart = (a: Uint8Array, b: Uint8Array): number => {
  let apart = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (
      a[index] !== b[index] ||
      a[index + 1] !== b[index + 1] ||
      a[index + 2] !== b[index + 2]
    ) {
      apart += 1;
    }
  }
  return apart;
};

export const run = async (): Promise<Frame[]> => {
  const { assets, release } = await acquire([]);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const renderer = createRenderer(canvas);
  renderer.setSize(WIDTH, HEIGHT, false);
  const world = createWorld(track, assets);
  const sky = skyOf(world.scene);
  const { material } = sky;
  const lastVertex = material.vertexShader;
  const lastOrder = sky.mesh.renderOrder;
  const firstVertex = lastVertex.replace(").xyww;", ");");
  const drawSky = (first: boolean): void => {
    material.vertexShader = first ? firstVertex : lastVertex;
    material.needsUpdate = true;
    sky.mesh.renderOrder = first ? SKY_FIRST : lastOrder;
  };
  const chase = createChaseCamera();
  chase.resize(WIDTH, HEIGHT);
  const gl = renderer.getContext();
  const frames: Frame[] = [];
  for (const picture of pictures) {
    const { bloomScale, samples } = presets[picture];
    const pipeline = createPipeline(renderer, undefined, {
      bloomScale,
      samples,
    });
    pipeline.prepare(world.scene);
    pipeline.resize(WIDTH, HEIGHT, 1);
    const frame = (): Uint8Array => {
      pipeline.render(world.scene, chase.camera);
      const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
      gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    for (const share of shares) {
      const s = track.length * share;
      for (let step = 0; step < SETTLE_FRAMES; step += 1) {
        chase.update(track, { air: 0, s, speed: 20, tuck: 0, x: 0 }, 1 / 60);
      }
      world.follow(chase.camera, s);
      for (const hour of hours) {
        world.light(0, hour);
        pipeline.setLook(world.clock.hour);
        drawSky(true);
        const first = frame();
        drawSky(false);
        const last = frame();
        sky.mesh.visible = false;
        const skyless = frame();
        sky.mesh.visible = true;
        frames.push({
          apart: pixelsApart(first, last),
          hour,
          picture,
          s: Math.round(s),
          skyPixels: pixelsApart(last, skyless),
        });
      }
    }
    pipeline.dispose();
  }
  world.dispose();
  renderer.dispose();
  release();
  return frames;
};
