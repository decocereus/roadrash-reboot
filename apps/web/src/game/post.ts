import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { seesFx } from "./cel.ts";
import type { Look } from "./looks.ts";

const LINE_WIDTH = 1.15;
const LINE_REFERENCE_HEIGHT = 900;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.93;
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
}`;

const uniform = (pass: ShaderPass, name: string): THREE.IUniform => {
  const found = pass.uniforms[name];
  if (!found) {
    throw new Error(`The pass has no uniform named ${name}.`);
  }
  return found;
};

export interface Pipeline {
  setLook: (look: Look) => void;
  resize: (width: number, height: number, pixelRatio: number) => void;
  render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
}

export const createPipeline = (renderer: THREE.WebGLRenderer): Pipeline => {
  const normalTarget = new THREE.WebGLRenderTarget(4, 4, { samples: SAMPLES });
  normalTarget.depthTexture = new THREE.DepthTexture(4, 4);
  const normalMaterial = new THREE.MeshNormalMaterial();
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(4, 4, {
      samples: SAMPLES,
      type: THREE.HalfFloatType,
    })
  );
  const scenePass = new RenderPass(new THREE.Scene(), new THREE.Camera());
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
  composer.addPass(scenePass);
  composer.addPass(line);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  uniform(line, "normals").value = normalTarget.texture;
  uniform(line, "depths").value = normalTarget.depthTexture;

  return {
    dispose() {
      normalTarget.depthTexture?.dispose();
      normalTarget.dispose();
      normalMaterial.dispose();
      composer.dispose();
      bloom.dispose();
      line.dispose();
      grade.dispose();
    },
    render(scene, camera) {
      const { background, fog } = scene;
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
      renderer.setRenderTarget(null);
      scene.overrideMaterial = null;
      scene.background = background;
      scene.fog = fog;
      seesFx(camera, true);
      scenePass.scene = scene;
      scenePass.camera = camera;
      composer.render();
    },
    resize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      const wide = Math.max(1, Math.floor(width * pixelRatio));
      const tall = Math.max(1, Math.floor(height * pixelRatio));
      normalTarget.setSize(wide, tall);
      uniform(line, "resolution").value.set(wide, tall);
      uniform(line, "width").value =
        LINE_WIDTH * Math.max(1, tall / LINE_REFERENCE_HEIGHT);
    },
    setLook(look) {
      uniform(line, "ink").value.set(look.ink);
      uniform(grade, "grade").value.set(...look.grade);
      bloom.strength = look.bloom;
    },
  };
};
