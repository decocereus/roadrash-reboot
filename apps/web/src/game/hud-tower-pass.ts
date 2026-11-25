import type { RiderId } from "@racer/sim/state";
import * as THREE from "three";

import { towerFrame, towerRowsAt } from "../hud-layout.ts";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  canvasMeasure,
  fits,
  paintAtlas,
  planAtlas,
} from "./hud-tower-atlas.ts";
import type { AtlasPlan } from "./hud-tower-atlas.ts";
import { TOWER_QUADS, createTowerQuads } from "./hud-tower-quads.ts";
import type { Placement } from "./hud-tower-quads.ts";
import type { TowerRow } from "./hud.ts";
import { uploadSpan } from "./uploads.ts";

const VERTEX = `precision highp float;
uniform vec2 drawingBuffer;
in vec2 position;
in vec2 uv;
in vec4 fill;
in vec4 edge;
out vec2 atlasUv;
out vec4 fillColour;
out vec4 edgeColour;
void main() {
  atlasUv = uv;
  fillColour = fill;
  edgeColour = edge;
  gl_Position = vec4(
    position.x / drawingBuffer.x * 2.0 - 1.0,
    1.0 - position.y / drawingBuffer.y * 2.0,
    0.0,
    1.0
  );
}`;

const FRAGMENT = `precision highp float;
uniform sampler2D atlas;
in vec2 atlasUv;
in vec4 fillColour;
in vec4 edgeColour;
out vec4 colour;
void main() {
  vec3 cover = texture(atlas, atlasUv).rgb;
  float filled = fillColour.a * cover.r;
  float inked = edgeColour.a * cover.g;
  float shaded = edgeColour.a * cover.b;
  colour = vec4(
    fillColour.rgb * filled + edgeColour.rgb * inked,
    filled + inked + shaded
  );
}`;

const INDICES_PER_QUAD = 6;
const noRows: readonly TowerRow[] = [];

const sameNames = (
  left: ReadonlyMap<RiderId, string>,
  right: ReadonlyMap<RiderId, string>
): boolean =>
  left.size === right.size &&
  [...left].every(([id, name]) => right.get(id) === name);

const namesOf = (rows: readonly TowerRow[]): ReadonlyMap<RiderId, string> =>
  new Map(rows.map((row) => [row.id, row.name]));

const covers = (plan: AtlasPlan, rows: readonly TowerRow[]): boolean => {
  for (const row of rows) {
    if (!fits(plan, row.id, row.name)) {
      return false;
    }
  }
  return true;
};

const indexFor = (): THREE.BufferAttribute => {
  const index = new Uint16Array(TOWER_QUADS * INDICES_PER_QUAD);
  for (let quad = 0; quad < TOWER_QUADS; quad += 1) {
    const corner = quad * 4;
    index.set(
      [corner, corner + 3, corner + 2, corner, corner + 2, corner + 1],
      quad * INDICES_PER_QUAD
    );
  }
  return new THREE.BufferAttribute(index, 1);
};

const dynamic = (array: Float32Array, size: number): THREE.BufferAttribute =>
  new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);

export type TowerRenderer = Pick<
  THREE.WebGLRenderer,
  "autoClear" | "compile" | "render" | "setRenderTarget"
>;

export const createTowerPass = (renderer: TowerRenderer) => {
  const reducedMotion = globalThis.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );
  const pixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  const texture = new THREE.DataTexture(
    pixels,
    ATLAS_WIDTH,
    ATLAS_HEIGHT,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const quads = createTowerQuads();
  const positions = dynamic(quads.positions, 2);
  const uvs = dynamic(quads.uvs, 2);
  const fills = dynamic(quads.fills, 4);
  const edges = dynamic(quads.edges, 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positions);
  geometry.setAttribute("uv", uvs);
  geometry.setAttribute("fill", fills);
  geometry.setAttribute("edge", edges);
  geometry.setIndex(indexFor());
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    Number.POSITIVE_INFINITY
  );
  const bufferSize = new THREE.Vector2(1, 1);
  const material = new THREE.RawShaderMaterial({
    blending: THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: FRAGMENT,
    glslVersion: THREE.GLSL3,
    premultipliedAlpha: true,
    transparent: true,
    uniforms: {
      atlas: { value: texture },
      drawingBuffer: { value: bufferSize },
    },
    vertexShader: VERTEX,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera();
  let measuring: CanvasRenderingContext2D | null = null;
  let names: ReadonlyMap<RiderId, string> = new Map();
  let plan: AtlasPlan | null = null;
  let placement: Placement | null = null;
  let rows = noRows;
  let laid: readonly TowerRow[] | null = null;
  let moving = false;
  let staged = false;

  const snapSlides = () => {
    laid = null;
  };
  reducedMotion.addEventListener("change", snapSlides);

  const measureFor = (font: number) => {
    measuring ??= document.createElement("canvas").getContext("2d");
    if (!measuring) {
      throw new Error("The browser gave the tower no 2D canvas to measure.");
    }
    return canvasMeasure(measuring, font);
  };

  const paint = (at: Placement, from: ReadonlyMap<RiderId, string>) => {
    const font = at.frame.font * at.scaleX;
    const next = planAtlas(from, at.frame, at.scaleX, measureFor(font));
    paintAtlas(next, at.frame, pixels);
    texture.needsUpdate = true;
    names = from;
    plan = next;
    laid = null;
  };

  const baked = (at: Placement): boolean =>
    plan !== null && plan.font === at.frame.font * at.scaleX;

  const bake = (next: ReadonlyMap<RiderId, string>) => {
    if (plan !== null && sameNames(names, next)) {
      return;
    }
    if (placement) {
      paint(placement, next);
    } else {
      names = next;
    }
  };

  const resize = (width: number, height: number, pixelRatio: number) => {
    const view = { height, width };
    const shown = towerRowsAt(view);
    const wide = Math.max(1, Math.floor(width * pixelRatio));
    const tall = Math.max(1, Math.floor(height * pixelRatio));
    placement = {
      deviceRatio: globalThis.devicePixelRatio,
      frame: towerFrame(view, shown),
      scaleX: wide / width,
      scaleY: tall / height,
      shown,
    };
    bufferSize.set(wide, tall);
    laid = null;
    if (plan !== null && !baked(placement)) {
      paint(placement, names);
    }
  };

  const write = (at: Placement, ready: AtlasPlan) => {
    quads.clock[0] = performance.now();
    const fresh = laid !== rows;
    if (fresh) {
      quads.layout(rows, ready, at, reducedMotion.matches);
      laid = rows;
    }
    if (!fresh && !moving) {
      return;
    }
    moving = quads.place();
    const vertices = quads.quadCount() * 4;
    uploadSpan(positions, 0, vertices);
    if (fresh) {
      uploadSpan(uvs, 0, vertices);
      uploadSpan(fills, 0, vertices);
      uploadSpan(edges, 0, vertices);
      geometry.setDrawRange(0, quads.quadCount() * INDICES_PER_QUAD);
    }
  };

  const render = () => {
    if (!placement || (rows.length === 0 && !staged)) {
      return;
    }
    if (!plan || !baked(placement)) {
      paint(placement, names);
    }
    if (plan && laid !== rows && !covers(plan, rows)) {
      paint(placement, namesOf(rows));
    }
    if (plan) {
      write(placement, plan);
    }
    const { autoClear } = renderer;
    mesh.visible = true;
    renderer.autoClear = false;
    try {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    } finally {
      renderer.autoClear = autoClear;
      mesh.visible = staged;
    }
  };

  return {
    bake,
    compile() {
      renderer.compile(scene, camera);
    },
    dispose() {
      reducedMotion.removeEventListener("change", snapSlides);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      if (measuring) {
        measuring.canvas.width = 0;
      }
    },
    render,
    resize,
    show(next: readonly TowerRow[]) {
      rows = next;
    },
    stage() {
      staged = true;
      mesh.visible = true;
      return () => {
        staged = false;
        mesh.visible = false;
      };
    },
  };
};

export type TowerPass = ReturnType<typeof createTowerPass>;
