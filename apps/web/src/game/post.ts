import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { seesFx } from "./cel.ts";
import type { Look } from "./looks.ts";
import type { Part } from "./profile.ts";

const LINE_WIDTH = 1.15;
const LINE_REFERENCE_HEIGHT = 900;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.93;
export const BLOOM_SCALE = 2;
const FRINGE = 0.012;
const VIGNETTE = 0.42;
const SAMPLES = 4;
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

const variantOf = (object: THREE.Object3D): number => {
  if (object instanceof THREE.InstancedMesh) {
    return 1;
  }
  return object instanceof THREE.SkinnedMesh ? 2 : 0;
};

const byMaterial = (a: THREE.Material, b: THREE.Material): number => {
  if (a.uuid === b.uuid) {
    return 0;
  }
  return a.uuid < b.uuid ? -1 : 1;
};

const byVariantThenMaterial = (
  a: THREE.RenderItem,
  b: THREE.RenderItem
): number =>
  a.groupOrder - b.groupOrder ||
  a.renderOrder - b.renderOrder ||
  variantOf(a.object) - variantOf(b.object) ||
  byMaterial(a.material, b.material) ||
  a.z - b.z;

export interface Pipeline {
  setLook: (look: Look) => void;
  setBloomScale: (scale: number) => void;
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
    dispose() {
      normalTarget.depthTexture?.dispose();
      normalTarget.dispose();
      normalMaterial.dispose();
      sceneTarget.dispose();
      inkTarget.dispose();
      bloom.dispose();
      line.dispose();
      grade.dispose();
    },
    render(scene, camera) {
      const { background, fog } = scene;
      scene.matrixWorldAutoUpdate = false;
      scene.updateMatrixWorld();
      lap?.("matrices");
      renderer.shadowMap.needsUpdate = true;
      uniform(line, "range").value.set(camera.near, camera.far);
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
      uniform(line, "resolution").value.set(wide, tall);
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
      uniform(line, "ink").value.set(look.ink);
      uniform(grade, "grade").value.set(...look.grade);
      bloom.strength = look.bloom;
    },
  };
};
