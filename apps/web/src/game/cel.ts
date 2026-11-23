import * as THREE from "three";

import { FIGURE_FLOOR_OVER_INK } from "./looks.ts";
import type { Look } from "./looks.ts";
import { WALKER_OUTFITS } from "./walker-clips.ts";
import { skinWalkers } from "./walker-skin.ts";

const RAMP_STEPS = 16;
const RAMP_LIT_FROM = 9;
const DISPLAY_GAMMA = 2.2;
const FX_LAYER = 1;
const FIGURE_LIGHT = [1.1, 0.97, 0.82] as const;
const SHADE_CHROMA = 1.24;
const FIGURE_DEPTH_FLOOR = 0.93;
const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);
const inkColour = new THREE.Color();
const SUN_ANCHOR_HEIGHT = 2.2;
const SHADOW_KERNEL =
  /shadow = \(\s*texture2DCompare[\s\S]*?\) \* \( 1\.0 \/ 17\.0 \);/u;
const SHADOW_SAMPLES = [
  ["0.0", "0.0"],
  ["dx2", "dy2"],
  ["dx3", "dy2"],
  ["dx2", "dy3"],
  ["dx3", "dy3"],
  ["dx0", "0.0"],
  ["dx1", "0.0"],
  ["0.0", "dy0"],
  ["0.0", "dy1"],
] as const;

const seventeenSamples = THREE.ShaderChunk.shadowmap_pars_fragment;
THREE.ShaderChunk.shadowmap_pars_fragment = seventeenSamples.replace(
  SHADOW_KERNEL,
  `shadow = ( ${SHADOW_SAMPLES.map(
    ([x, y]) =>
      `texture2DCompare( shadowMap, shadowCoord.xy + vec2( ${x}, ${y} ), shadowCoord.z )`
  ).join(" + ")} ) * ( 1.0 / ${SHADOW_SAMPLES.length}.0 );`
);
if (THREE.ShaderChunk.shadowmap_pars_fragment === seventeenSamples) {
  throw new Error(
    "three's shadow kernel changed, so nine samples no longer apply."
  );
}

const CEL_UNIFORMS =
  "uniform vec3 rimDirection;uniform vec3 rimColour;uniform vec3 keyDirection;uniform float rimStrength;\n";

const FIGURE_SHADE = `
varying vec4 vSunAnchor;
uniform float figureShade;uniform vec3 figureLight;uniform vec3 figureSun;uniform float figureDepth;uniform float figureChroma;uniform float figureFloor;uniform vec3 skyDirection;
const vec3 FIGURE_LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec2 SHADE_HUE = vec2(0.8660254, -0.5);
const float SHADE_TURN = 0.17453293;
const float SHADE_DIM = 0.8;
const float FIGURE_RIM_EDGE = 0.62;
const float FIGURE_RIM_FACING = -0.1;
const float FIGURE_SKY_FACING = 0.25;
const float FIGURE_SKY_RIM = 0.5;
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
  float lightness = max(lab.x * figureDepth * dim, min(lab.x * figureDepth, figureFloor));
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
      celRim = step(FIGURE_RIM_EDGE, celFresnel) * mix(step(FIGURE_SKY_FACING, dot(celNormal, skyDirection)) * FIGURE_SKY_RIM, step(FIGURE_RIM_FACING, dot(celNormal, keyDirection)), figureSunlit);
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

type Triple = readonly [number, number, number];

interface Tone {
  readonly ink: THREE.ColorRepresentation;
  readonly rim: THREE.ColorRepresentation;
  readonly lit: Triple;
  readonly shadow: Triple;
  readonly keyDirection: Triple;
  readonly rimDirection: Triple;
  readonly glow: number;
}

export interface Shading {
  readonly look: Look;
  readonly key: THREE.Vector3;
  readonly ambient: THREE.Color;
  readonly sun: THREE.Color;
  relight: (tone: Tone) => void;
  cel: (
    colour: THREE.ColorRepresentation,
    options?: CelOptions
  ) => THREE.MeshToonMaterial;
  paint: (atlas: THREE.Texture | null) => THREE.MeshToonMaterial;
  figure: (atlas: THREE.Texture | null) => THREE.MeshToonMaterial;
  walker: (atlas: THREE.Texture) => THREE.MeshToonMaterial;
  glow: (
    colour: THREE.ColorRepresentation,
    strength?: number,
    map?: THREE.Texture | null
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

const linearInto = (tone: Triple, into: THREE.Vector3): THREE.Vector3 =>
  into.set(
    tone[0] ** DISPLAY_GAMMA,
    tone[1] ** DISPLAY_GAMMA,
    tone[2] ** DISPLAY_GAMMA
  );

const litScratch = new THREE.Vector3();
const shadowScratch = new THREE.Vector3();
const figureLinear = linearInto(FIGURE_LIGHT, new THREE.Vector3());

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

export const figureDepthOf = ({
  lit,
  shadow,
}: Pick<Tone, "lit" | "shadow">): number =>
  Math.max(
    Math.cbrt(
      linearInto(shadow, shadowScratch).dot(LUMA) /
        linearInto(lit, litScratch).dot(LUMA)
    ),
    FIGURE_DEPTH_FLOOR
  );

export const figureFloorOf = (ink: THREE.ColorRepresentation): number => {
  inkColour.set(ink);
  const long = Math.cbrt(
    0.4122214708 * inkColour.r +
      0.5363325363 * inkColour.g +
      0.0514459929 * inkColour.b
  );
  const middle = Math.cbrt(
    0.2119034982 * inkColour.r +
      0.6806995451 * inkColour.g +
      0.1073969566 * inkColour.b
  );
  const short = Math.cbrt(
    0.0883024619 * inkColour.r +
      0.2817188376 * inkColour.g +
      0.6299787005 * inkColour.b
  );
  return (
    0.2104542553 * long +
    0.793617785 * middle -
    0.0040720468 * short +
    FIGURE_FLOOR_OVER_INK
  );
};

export const createShading = (look: Look): Shading => {
  const ramp = createRamp();
  const key = new THREE.Vector3();
  const rimWorld = new THREE.Vector3();
  const rimDirection = { value: new THREE.Vector3(0, 0, 1) };
  const keyDirection = { value: new THREE.Vector3(0, 0, 1) };
  const skyDirection = { value: new THREE.Vector3(0, 1, 0) };
  const rimColour = { value: new THREE.Color() };
  const toView = new THREE.Matrix3();
  const ambient = new THREE.Color();
  const sun = new THREE.Color();
  const figureLight = { value: new THREE.Vector3() };
  const figureSun = { value: new THREE.Vector3() };
  const figureDepth = { value: 1 };
  const figureChroma = { value: 1 };
  const figureFloor = { value: 0 };
  const glows: { material: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  const emissives: { material: THREE.MeshToonMaterial; base: number }[] = [];
  let glowNow = 1;

  const relight = (tone: Tone): void => {
    key.set(...tone.keyDirection).normalize();
    rimWorld.set(...tone.rimDirection).normalize();
    rimColour.value.set(tone.rim);
    const litLinear = linearInto(tone.lit, litScratch);
    const shadowLinear = linearInto(tone.shadow, shadowScratch);
    ambient.setRGB(
      shadowLinear.x * Math.PI,
      shadowLinear.y * Math.PI,
      shadowLinear.z * Math.PI
    );
    sun.setRGB(
      (litLinear.x - shadowLinear.x) * Math.PI,
      (litLinear.y - shadowLinear.y) * Math.PI,
      (litLinear.z - shadowLinear.z) * Math.PI
    );
    figureLight.value
      .copy(figureLinear)
      .multiplyScalar(litLinear.dot(LUMA) / figureLinear.dot(LUMA));
    figureSun.value.copy(litLinear).sub(shadowLinear);
    figureDepth.value = figureDepthOf(tone);
    figureChroma.value = Math.min(figureDepth.value * SHADE_CHROMA, 1);
    figureFloor.value = figureFloorOf(tone.ink);
    glowNow = tone.glow;
    for (const { base, material } of glows) {
      material.color.copy(base).multiplyScalar(glowNow);
    }
    for (const { base, material } of emissives) {
      material.emissiveIntensity = base * glowNow;
    }
  };
  relight(look);

  const glowing = (
    base: THREE.Color,
    parameters: THREE.MeshBasicMaterialParameters
  ): THREE.MeshBasicMaterial => {
    const material = new THREE.MeshBasicMaterial(parameters);
    material.color.copy(base).multiplyScalar(glowNow);
    glows.push({ base, material });
    return material;
  };

  const build = (
    parameters: THREE.MeshToonMaterialParameters,
    rim: number,
    painted: boolean,
    figure = false,
    walker = false
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
        shader.uniforms.figureFloor = figureFloor;
        shader.uniforms.skyDirection = skyDirection;
        shader.vertexShader = `attribute float gloss;varying float vGloss;varying vec4 vSunAnchor;\n${shader.vertexShader
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvGloss = gloss;"
          )
          .replace("#include <shadowmap_vertex>", SUN_ANCHOR_VERTEX)}`;
      }
      if (walker) {
        skinWalkers(shader);
        shader.vertexShader = `attribute float walkerOutfit;\n${shader.vertexShader.replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>\nvMapUv.y += walkerOutfit / ${WALKER_OUTFITS.toFixed(1)};`
        )}`;
      }
      shader.fragmentShader = `${painted ? `#define PAINTED\nvarying float vGloss;\n${FIGURE_SHADE}` : ""}${CEL_UNIFORMS}${shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        CEL_FRAGMENT
      )}`;
    };
    const programKey = painted ? "cel-painted" : "cel";
    material.customProgramCacheKey = () => (walker ? "cel-walker" : programKey);
    return material;
  };

  return {
    aim(camera) {
      toView.setFromMatrix4(camera.matrixWorldInverse);
      rimDirection.value.copy(rimWorld).applyMatrix3(toView).normalize();
      keyDirection.value.copy(key).applyMatrix3(toView).normalize();
      skyDirection.value.set(0, 1, 0).applyMatrix3(toView).normalize();
    },
    ambient,
    cel(colour, options = {}) {
      const { emissiveIntensity = 1, rim = 0, ...parameters } = options;
      const material = build({ color: colour, ...parameters }, rim, false);
      if (parameters.emissiveMap) {
        material.emissiveIntensity = emissiveIntensity * glowNow;
        emissives.push({ base: emissiveIntensity, material });
      }
      return material;
    },
    dispose() {
      ramp.dispose();
    },
    figure(atlas) {
      return build({ map: atlas, vertexColors: true }, 1, true, true);
    },
    glow(colour, strength = 1.6, map = null) {
      return glowing(new THREE.Color(colour).multiplyScalar(strength), {
        map,
      });
    },
    glowPaint() {
      return glowing(new THREE.Color("#ffffff"), { vertexColors: true });
    },
    key,
    look,
    paint(atlas) {
      return build({ map: atlas, vertexColors: true }, 1, true);
    },
    relight,
    sun,
    walker(atlas) {
      return build({ map: atlas, vertexColors: true }, 1, true, true, true);
    },
  };
};
