import * as THREE from "three";

import type { Look } from "./looks.ts";

const RAMP_STEPS = 16;
const RAMP_LIT_FROM = 9;
const DISPLAY_GAMMA = 2.2;
const FX_LAYER = 1;
const FIGURE_LIGHT = [1.1, 0.97, 0.82] as const;
const SHADE_CHROMA = 1.24;
const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);
const SUN_ANCHOR_HEIGHT = 2.2;

const CEL_UNIFORMS =
  "uniform vec3 rimDirection;uniform vec3 rimColour;uniform vec3 keyDirection;uniform float rimStrength;\n";

const FIGURE_SHADE = `
varying vec4 vSunAnchor;
uniform float figureShade;uniform vec3 figureLight;uniform vec3 figureSun;uniform float figureDepth;uniform float figureChroma;
const vec3 FIGURE_LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec2 SHADE_HUE = vec2(0.8660254, -0.5);
const float SHADE_TURN = 0.17453293;
const float SHADE_DIM = 0.8;
const float FIGURE_RIM_EDGE = 0.62;
const float FIGURE_RIM_FACING = -0.1;
const mat3 LINEAR_TO_LMS = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005);
const mat3 LMS_TO_LAB = mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660);
const mat3 LAB_TO_LMS = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480);
const mat3 LMS_TO_LINEAR = mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010);
vec3 figureLinearOf(vec3 lab) {
  vec3 lms = LAB_TO_LMS * lab;
  return LMS_TO_LINEAR * (lms * lms * lms);
}
vec3 figureShadeOf(vec3 lit, float dim) {
  vec3 lab = LMS_TO_LAB * pow(max(LINEAR_TO_LMS * lit, 0.0), vec3(1.0 / 3.0));
  vec2 ab = lab.yz * figureChroma;
  vec2 hue = ab / max(length(ab), 1e-6);
  float turn = min(SHADE_TURN, acos(clamp(dot(hue, SHADE_HUE), -1.0, 1.0))) * sign(hue.x * SHADE_HUE.y - hue.y * SHADE_HUE.x);
  ab = vec2(ab.x * cos(turn) - ab.y * sin(turn), ab.x * sin(turn) + ab.y * cos(turn));
  float lightness = lab.x * figureDepth * dim;
  vec3 shade = figureLinearOf(vec3(lightness, ab));
  if (min(shade.r, min(shade.g, shade.b)) < 0.0) {
    float inside = 0.0;
    float outside = 1.0;
    for (int attempt = 0; attempt < 6; attempt++) {
      float middle = 0.5 * (inside + outside);
      vec3 tried = figureLinearOf(vec3(lightness, ab * middle));
      if (min(tried.r, min(tried.g, tried.b)) < 0.0) {
        outside = middle;
      } else {
        inside = middle;
      }
    }
    shade = figureLinearOf(vec3(lightness, ab * inside));
  }
  return shade;
}
`;

const SUN_ANCHOR_VERTEX = `#include <shadowmap_vertex>
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  vec4 sunAnchor = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    sunAnchor = instanceMatrix * sunAnchor;
  #endif
  sunAnchor = modelMatrix * sunAnchor;
  sunAnchor.y += ${SUN_ANCHOR_HEIGHT.toFixed(2)};
  vSunAnchor = directionalShadowMatrix[0] * sunAnchor;
#endif`;

const CEL_FRAGMENT = `
  #ifdef PAINTED
    float figureSunlit = 1.0;
    if (figureShade > 0.5) {
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        figureSunlit = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vSunAnchor);
      #endif
      vec3 figureLit = diffuseColor.rgb * figureLight;
      float figureBand = clamp(dot(reflectedLight.directDiffuse, FIGURE_LUMA) / max(dot(diffuseColor.rgb * figureSun, FIGURE_LUMA), 1e-6), 0.0, 1.0);
      outgoingLight = figureBand < 0.999 ? mix(figureShadeOf(min(figureLit, 1.0), mix(SHADE_DIM, 1.0, figureSunlit)), figureLit, figureBand) : figureLit;
    }
  #endif
  vec3 celView = normalize(vViewPosition);
  vec3 celNormal = normalize(normal);
  float celFresnel = 1.0 - max(dot(celNormal, celView), 0.0);
  float celRim = step(0.64, celFresnel) * step(0.25, dot(celNormal, rimDirection)) * rimStrength;
  #ifdef PAINTED
    if (figureShade > 0.5) {
      celRim = step(FIGURE_RIM_EDGE, celFresnel) * step(FIGURE_RIM_FACING, dot(celNormal, keyDirection)) * figureSunlit;
    }
  #endif
  outgoingLight = mix(outgoingLight, rimColour, celRim);
  #ifdef PAINTED
    float celShine = step(0.965, dot(celNormal, normalize(keyDirection + celView))) * vGloss * figureSunlit;
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
  paint: (atlas: THREE.Texture | null) => THREE.MeshToonMaterial;
  figure: (atlas: THREE.Texture | null) => THREE.MeshToonMaterial;
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

const linearOf = (tone: readonly [number, number, number]): THREE.Vector3 =>
  new THREE.Vector3(
    tone[0] ** DISPLAY_GAMMA,
    tone[1] ** DISPLAY_GAMMA,
    tone[2] ** DISPLAY_GAMMA
  );

const lightOf = (tone: readonly [number, number, number]): THREE.Color => {
  const linear = linearOf(tone).multiplyScalar(Math.PI);
  return new THREE.Color().setRGB(linear.x, linear.y, linear.z);
};

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
  const litLinear = linearOf(look.lit);
  const shadowLinear = linearOf(look.shadow);
  const figureLinear = linearOf(FIGURE_LIGHT);
  const depth = Math.cbrt(shadowLinear.dot(LUMA) / litLinear.dot(LUMA));
  const figureLight = {
    value: figureLinear.multiplyScalar(
      litLinear.dot(LUMA) / figureLinear.dot(LUMA)
    ),
  };
  const figureSun = { value: litLinear.clone().sub(shadowLinear) };
  const figureDepth = { value: depth };
  const figureChroma = { value: Math.min(depth * SHADE_CHROMA, 1) };

  const build = (
    parameters: THREE.MeshToonMaterialParameters,
    rim: number,
    painted: boolean,
    figure = false
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
        shader.uniforms.figureShade = { value: figure ? 1 : 0 };
        shader.uniforms.figureLight = figureLight;
        shader.uniforms.figureSun = figureSun;
        shader.uniforms.figureDepth = figureDepth;
        shader.uniforms.figureChroma = figureChroma;
        shader.vertexShader = `attribute float gloss;varying float vGloss;varying vec4 vSunAnchor;\n${shader.vertexShader
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvGloss = gloss;"
          )
          .replace("#include <shadowmap_vertex>", SUN_ANCHOR_VERTEX)}`;
      }
      shader.fragmentShader = `${painted ? `#define PAINTED\nvarying float vGloss;\n${FIGURE_SHADE}` : ""}${CEL_UNIFORMS}${shader.fragmentShader.replace(
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
    figure(atlas) {
      return build({ map: atlas, vertexColors: true }, 1, true, true);
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
    paint(atlas) {
      return build({ map: atlas, vertexColors: true }, 1, true);
    },
    sun,
  };
};
