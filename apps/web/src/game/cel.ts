import * as THREE from "three";

import type { Look } from "./looks.ts";

const RAMP_STEPS = 16;
const RAMP_LIT_FROM = 9;
const DISPLAY_GAMMA = 2.2;
const FX_LAYER = 1;

const CEL_UNIFORMS =
  "uniform vec3 rimDirection;uniform vec3 rimColour;uniform vec3 keyDirection;uniform float rimStrength;\n";

const CEL_FRAGMENT = `
  vec3 celView = normalize(vViewPosition);
  vec3 celNormal = normalize(normal);
  float celFresnel = 1.0 - max(dot(celNormal, celView), 0.0);
  float celRim = step(0.64, celFresnel) * step(0.25, dot(celNormal, rimDirection)) * rimStrength;
  outgoingLight = mix(outgoingLight, rimColour, celRim);
  #ifdef PAINTED
    float celShine = step(0.965, dot(celNormal, normalize(keyDirection + celView))) * vGloss;
    outgoingLight = mix(outgoingLight, vec3(1.0), celShine * 0.85);
  #endif
  #include <opaque_fragment>`;

interface CelOptions {
  readonly rim?: number;
  readonly map?: THREE.Texture;
  readonly emissiveMap?: THREE.Texture;
  readonly emissiveIntensity?: number;
  readonly side?: THREE.Side;
  readonly vertexColors?: boolean;
}

export interface Shading {
  readonly look: Look;
  readonly key: THREE.Vector3;
  readonly ambient: THREE.Color;
  readonly sun: THREE.Color;
  cel: (
    colour: THREE.ColorRepresentation,
    options?: CelOptions
  ) => THREE.MeshToonMaterial;
  paint: () => THREE.MeshToonMaterial;
  glow: (
    colour: THREE.ColorRepresentation,
    strength?: number
  ) => THREE.MeshBasicMaterial;
  glowPaint: () => THREE.MeshBasicMaterial;
  aim: (camera: THREE.Camera) => void;
  dispose: () => void;
}

const createRamp = (): THREE.DataTexture => {
  const steps = new Uint8Array(RAMP_STEPS).fill(255, RAMP_LIT_FROM);
  const ramp = new THREE.DataTexture(steps, RAMP_STEPS, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
};

const lightOf = (tone: readonly [number, number, number]): THREE.Color =>
  new THREE.Color().setRGB(
    tone[0] ** DISPLAY_GAMMA * Math.PI,
    tone[1] ** DISPLAY_GAMMA * Math.PI,
    tone[2] ** DISPLAY_GAMMA * Math.PI
  );

export const onFxLayer = <Target extends THREE.Object3D>(
  target: Target
): Target => {
  target.layers.set(FX_LAYER);
  target.castShadow = false;
  target.receiveShadow = false;
  return target;
};

export const seesFx = (camera: THREE.Camera, sees: boolean): void => {
  if (sees) {
    camera.layers.enable(FX_LAYER);
  } else {
    camera.layers.set(0);
  }
};

export const createShading = (look: Look): Shading => {
  const ramp = createRamp();
  const key = new THREE.Vector3(...look.keyDirection).normalize();
  const rimWorld = new THREE.Vector3(...look.rimDirection).normalize();
  const rimDirection = { value: new THREE.Vector3(0, 0, 1) };
  const keyDirection = { value: new THREE.Vector3(0, 0, 1) };
  const rimColour = { value: new THREE.Color(look.rim) };
  const toView = new THREE.Matrix3();
  const ambient = lightOf(look.shadow);
  const sun = lightOf(look.lit).sub(ambient);

  const build = (
    parameters: THREE.MeshToonMaterialParameters,
    rim: number,
    painted: boolean
  ): THREE.MeshToonMaterial => {
    const material = new THREE.MeshToonMaterial({
      ...parameters,
      gradientMap: ramp,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.rimDirection = rimDirection;
      shader.uniforms.rimColour = rimColour;
      shader.uniforms.keyDirection = keyDirection;
      shader.uniforms.rimStrength = { value: rim };
      if (painted) {
        shader.vertexShader = `attribute float gloss;varying float vGloss;\n${shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvGloss = gloss;"
        )}`;
      }
      shader.fragmentShader = `${painted ? "#define PAINTED\nvarying float vGloss;\n" : ""}${CEL_UNIFORMS}${shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        CEL_FRAGMENT
      )}`;
    };
    material.customProgramCacheKey = () => (painted ? "cel-painted" : "cel");
    return material;
  };

  return {
    aim(camera) {
      toView.setFromMatrix4(camera.matrixWorldInverse);
      rimDirection.value.copy(rimWorld).applyMatrix3(toView).normalize();
      keyDirection.value.copy(key).applyMatrix3(toView).normalize();
    },
    ambient,
    cel(colour, options = {}) {
      const { rim = 0, ...parameters } = options;
      return build({ color: colour, ...parameters }, rim, false);
    },
    dispose() {
      ramp.dispose();
    },
    glow(colour, strength = 1.6) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(colour).multiplyScalar(strength),
      });
    },
    glowPaint() {
      return new THREE.MeshBasicMaterial({ vertexColors: true });
    },
    key,
    look,
    paint() {
      return build({ vertexColors: true }, 1, true);
    },
    sun,
  };
};
