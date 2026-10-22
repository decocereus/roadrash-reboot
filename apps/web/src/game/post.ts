import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import type { Part } from "../profile-parts.ts";
import { seesFx } from "./cel.ts";
import type { Look } from "./looks.ts";

const LINE_WIDTH = 1.15;
const LINE_REFERENCE_HEIGHT = 900;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.93;
export const BLOOM_SCALE = 2;
const FRINGE = 0.012;
const VIGNETTE = 0.42;
export const SAMPLES = 4;
const FACING_CAMERA = 0x80_80_ff;

const SCREEN_VERTEX =
  "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";

const LINE_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform sampler2D normals;
uniform sampler2D depths;
uniform vec2 resolution;
uniform vec2 range;
uniform vec3 ink;
uniform float width;
varying vec2 vUv;
float metres(vec2 at) {
  float z = texture2D(depths, at).x * 2.0 - 1.0;
  return 2.0 * range.x * range.y / (range.y + range.x - z * (range.y - range.x));
}
vec3 facing(vec2 at) {
  return texture2D(normals, at).xyz * 2.0 - 1.0;
}
void main() {
  vec4 colour = texture2D(tDiffuse, vUv);
  vec2 pixel = width / resolution;
  vec2 a = vUv + pixel;
  vec2 b = vUv - pixel;
  vec2 c = vUv + vec2(pixel.x, -pixel.y);
  vec2 d = vUv + vec2(-pixel.x, pixel.y);
  float da = metres(a);
  float db = metres(b);
  float dc = metres(c);
  float dd = metres(d);
  float nearest = min(min(da, db), min(dc, dd));
  float step_ = (abs(da - db) + abs(dc - dd)) / nearest;
  float grazing = 1.0 / max(facing(vUv).z, 0.14);
  float outline = smoothstep(0.035 * grazing, 0.09 * grazing, step_);
  float crease = smoothstep(0.55, 1.0, length(facing(a) - facing(b)) + length(facing(c) - facing(d)));
  float fade = 1.0 - smoothstep(60.0, 420.0, nearest);
  float edge = max(outline * mix(0.35, 1.0, fade), crease * fade * 0.85);
  gl_FragColor = vec4(mix(colour.rgb, ink, edge), 1.0);
}`;

const GRADE_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform float fringe;
uniform float vignette;
uniform vec3 grade;
varying vec2 vUv;
void main() {
  vec2 fromCentre = vUv - 0.5;
  float radius = dot(fromCentre, fromCentre);
  vec2 shift = fromCentre * radius * fringe;
  vec3 colour = vec3(
    texture2D(tDiffuse, vUv + shift).r,
    texture2D(tDiffuse, vUv).g,
    texture2D(tDiffuse, vUv - shift).b
  );
  colour *= grade;
  colour *= 1.0 - vignette * smoothstep(0.16, 0.62, radius);
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}`;

const uniform = (pass: ShaderPass, name: string): THREE.IUniform => {
  const found = pass.uniforms[name];
  if (!found) {
    throw new Error(`The pass has no uniform named ${name}.`);
  }
  return found;
};

const uniformValue = <Value>(
  pass: ShaderPass,
  name: string,
  kind: abstract new (...args: never[]) => Value
): Value => {
  const value: unknown = uniform(pass, name).value;
  if (!(value instanceof kind)) {
    throw new TypeError(`The uniform ${name} holds the wrong kind of value.`);
  }
  return value;
};

const variantOf = (object: THREE.Object3D): number => {
  if (object instanceof THREE.InstancedMesh) {
    return 1;
  }
  return object instanceof THREE.SkinnedMesh ? 2 : 0;
};

declare module "three" {
  interface Material {
    readonly id: number;
  }
}

const byVariantThenMaterial = (
  a: THREE.RenderItem,
  b: THREE.RenderItem
): number =>
  a.groupOrder - b.groupOrder ||
  a.renderOrder - b.renderOrder ||
  variantOf(a.object) - variantOf(b.object) ||
  a.material.id - b.material.id ||
  a.z - b.z;

export interface Compiling {
  readonly ready: Promise<null>;
  readonly stop?: () => void;
}

const PROGRAM_POLL_MS = 10;
const COMPLETION_STATUS_KHR = 0x91_b1;

const compiled: Compiling = {
  ready: Promise.resolve(null),
};

const watchPrograms = (renderer: THREE.WebGLRenderer): Compiling => {
  if (!renderer.extensions.has("KHR_parallel_shader_compile")) {
    return compiled;
  }
  const gl = renderer.getContext();
  const pending = (program: THREE.WebGLProgram): boolean =>
    program.program instanceof WebGLProgram &&
    gl.getProgramParameter(program.program, COMPLETION_STATUS_KHR) === false;
  const { promise, resolve } = Promise.withResolvers<null>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!(renderer.info.programs ?? []).some(pending)) {
      resolve(null);
      return;
    }
    timer = setTimeout(check, PROGRAM_POLL_MS);
  };
  check();
  return {
    ready: promise,
    stop() {
      clearTimeout(timer);
      resolve(null);
    },
  };
};

export interface Pipeline {
  prepare: (scene: THREE.Scene) => void;
  compile: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => Compiling;
  setLook: (look: Look) => void;
  setBloomScale: (scale: number) => void;
  setSamples: (samples: number) => void;
  resize: (width: number, height: number, pixelRatio: number) => void;
  render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
}

export const createPipeline = (
  renderer: THREE.WebGLRenderer,
  lap?: (part: Part) => void
): Pipeline => {
  renderer.setOpaqueSort(byVariantThenMaterial);
  const normalTarget = new THREE.WebGLRenderTarget(4, 4);
  normalTarget.depthTexture = new THREE.DepthTexture(4, 4);
  const normalMaterial = new THREE.MeshNormalMaterial();
  const instancedDepth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  const skinnedDepth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  const sceneTarget = new THREE.WebGLRenderTarget(4, 4, {
    samples: SAMPLES,
    type: THREE.HalfFloatType,
  });
  const inkTarget = new THREE.WebGLRenderTarget(4, 4, {
    depthBuffer: false,
    type: THREE.HalfFloatType,
  });
  const line = new ShaderPass({
    fragmentShader: LINE_FRAGMENT,
    uniforms: {
      depths: { value: null },
      ink: { value: new THREE.Color() },
      normals: { value: null },
      range: { value: new THREE.Vector2(0.3, 6000) },
      resolution: { value: new THREE.Vector2(1, 1) },
      tDiffuse: { value: null },
      width: { value: 1 },
    },
    vertexShader: SCREEN_VERTEX,
  });
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(4, 4),
    0.3,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD
  );
  const grade = new ShaderPass({
    fragmentShader: GRADE_FRAGMENT,
    uniforms: {
      fringe: { value: FRINGE },
      grade: { value: new THREE.Vector3(1, 1, 1) },
      tDiffuse: { value: null },
      vignette: { value: VIGNETTE },
    },
    vertexShader: SCREEN_VERTEX,
  });
  grade.renderToScreen = true;

  uniform(line, "normals").value = normalTarget.texture;
  uniform(line, "depths").value = normalTarget.depthTexture;
  let bloomScale = BLOOM_SCALE;
  let cssWidth = 1;
  let cssHeight = 1;

  return {
    compile(scene, camera) {
      seesFx(camera, true);
      renderer.setRenderTarget(sceneTarget);
      try {
        renderer.compile(scene, camera);
        return watchPrograms(renderer);
      } finally {
        renderer.setRenderTarget(null);
      }
    },
    dispose() {
      normalTarget.depthTexture?.dispose();
      normalTarget.dispose();
      normalMaterial.dispose();
      instancedDepth.dispose();
      skinnedDepth.dispose();
      sceneTarget.dispose();
      inkTarget.dispose();
      bloom.dispose();
      line.dispose();
      grade.dispose();
    },
    prepare(scene) {
      scene.traverse((node) => {
        if (node instanceof THREE.InstancedMesh) {
          node.customDepthMaterial ??= instancedDepth;
        } else if (node instanceof THREE.SkinnedMesh) {
          node.customDepthMaterial ??= skinnedDepth;
        }
      });
    },
    render(scene, camera) {
      const { background, fog } = scene;
      scene.matrixWorldAutoUpdate = false;
      scene.updateMatrixWorld();
      lap?.("matrices");
      renderer.shadowMap.needsUpdate = true;
      uniformValue(line, "range", THREE.Vector2).set(camera.near, camera.far);
      scene.overrideMaterial = normalMaterial;
      scene.background = null;
      scene.fog = null;
      seesFx(camera, false);
      renderer.setRenderTarget(normalTarget);
      renderer.setClearColor(FACING_CAMERA, 1);
      renderer.clear();
      renderer.render(scene, camera);
      lap?.("normal");
      scene.overrideMaterial = null;
      scene.background = background;
      scene.fog = fog;
      seesFx(camera, true);
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      lap?.("main");
      line.render(renderer, inkTarget, sceneTarget, 0, false);
      lap?.("line");
      bloom.render(renderer, inkTarget, inkTarget, 0, false);
      lap?.("bloom");
      grade.render(renderer, inkTarget, inkTarget, 0, false);
      lap?.("grade");
    },
    resize(width, height, pixelRatio) {
      cssWidth = width;
      cssHeight = height;
      const wide = Math.max(1, Math.floor(width * pixelRatio));
      const tall = Math.max(1, Math.floor(height * pixelRatio));
      normalTarget.setSize(wide, tall);
      sceneTarget.setSize(wide, tall);
      inkTarget.setSize(wide, tall);
      bloom.setSize(width * bloomScale, height * bloomScale);
      uniformValue(line, "resolution", THREE.Vector2).set(wide, tall);
      uniform(line, "width").value =
        LINE_WIDTH * Math.max(1, tall / LINE_REFERENCE_HEIGHT);
    },
    setBloomScale(scale) {
      if (scale === bloomScale) {
        return;
      }
      bloomScale = scale;
      bloom.setSize(cssWidth * bloomScale, cssHeight * bloomScale);
    },
    setLook(look) {
      uniformValue(line, "ink", THREE.Color).set(look.ink);
      uniformValue(grade, "grade", THREE.Vector3).set(...look.grade);
      bloom.strength = look.bloom;
    },
    setSamples(samples) {
      if (samples === sceneTarget.samples) {
        return;
      }
      sceneTarget.samples = samples;
      sceneTarget.dispose();
    },
  };
};
