import type { Random } from "@racer/track/random";
import * as THREE from "three";

import { onFxLayer } from "./cel.ts";
import type { LiveHour } from "./sky-clock.ts";
import { FULL_TURN, sheet } from "./texture-canvas.ts";

const SKY_WIDTH = 4096;
const SKY_HEIGHT = 2048;
const SKY_RADIUS = 4000;
const STAR_SHARE = 0.0015;
const MOON_BEARING = new THREE.Vector3(0.35, 0, -0.92).normalize();
const MOON_ELEVATION = 0.2;
const SKY_LAST = 1;
const CLOUD_PUFFS = [
  [-150, -10, 50],
  [-90, -48, 62],
  [-20, -86, 82],
  [60, -60, 70],
  [130, -30, 56],
  [190, -8, 38],
] as const;
const LAYERS = ["rgb(0,0,255)", "rgb(0,255,0)", "rgb(255,0,0)"] as const;

const drawCloud = (
  context: CanvasRenderingContext2D,
  place: readonly [number, number, number]
): void => {
  const [x, y, scale] = place;
  context.save();
  context.beginPath();
  context.rect(x - 260 * scale, y - 300 * scale, 520 * scale, 300 * scale);
  context.clip();
  const layers = [
    [LAYERS[0], 0, 0, 1.03],
    [LAYERS[1], 0, 0, 1],
    [LAYERS[2], -10, -16, 0.84],
  ] as const;
  for (const [fill, shiftX, shiftY, size] of layers) {
    context.fillStyle = fill;
    for (const [puffX, puffY, radius] of CLOUD_PUFFS) {
      context.beginPath();
      context.arc(
        x + (puffX + shiftX) * scale,
        y + (puffY + shiftY) * scale,
        radius * scale * size,
        0,
        FULL_TURN
      );
      context.fill();
    }
  }
  context.restore();
};

const detailTexture = (random: Random): THREE.CanvasTexture => {
  const { canvas, context } = sheet(SKY_WIDTH, SKY_HEIGHT);
  const horizon = SKY_HEIGHT / 2;
  const bandTop = horizon / 2;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, SKY_WIDTH, SKY_HEIGHT);
  for (let cloud = 0; cloud < 16; cloud += 1) {
    drawCloud(context, [
      random() * SKY_WIDTH,
      bandTop + 90 + random() * (horizon - bandTop - 120),
      0.35 + random() * 0.7,
    ]);
  }
  for (let streak = 0; streak < 22; streak += 1) {
    const x = random() * SKY_WIDTH;
    const y = bandTop + 60 + random() * (horizon - bandTop - 80);
    const width = 160 + random() * 420;
    const height = 5 + random() * 9;
    context.fillStyle = streak % 2 === 0 ? LAYERS[2] : LAYERS[1];
    context.globalAlpha = 0.85;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width - height * 3, y + height);
    context.lineTo(x - height * 3, y + height);
    context.fill();
    context.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww;
}`;

const FRAGMENT = `
uniform sampler2D detail;
uniform vec4 stops;
uniform vec4 spans;
uniform vec3 colour0;
uniform vec3 colour1;
uniform vec3 colour2;
uniform vec3 colour3;
uniform vec3 colour4;
uniform vec3 cloud0;
uniform vec3 cloud1;
uniform vec3 cloud2;
uniform vec3 fogColour;
uniform vec3 sunColour;
uniform vec2 sunAt;
uniform vec2 moonAt;
uniform float night;
varying vec2 vUv;
const float HORIZON = ${(SKY_HEIGHT / 2).toFixed(1)};
const float BAND_TOP = ${(SKY_HEIGHT / 4).toFixed(1)};
const float WIDTH = ${SKY_WIDTH.toFixed(1)};
const vec3 HALO = vec3(1.0, 0.871, 0.305);
const vec3 MOON = vec3(0.855, 0.871, 1.0);
float reach(vec2 sky, vec2 centre) {
  vec2 gap = sky - centre;
  gap.x = mod(gap.x + 0.5 * WIDTH, WIDTH) - 0.5 * WIDTH;
  return length(gap);
}
void main() {
  vec2 sky = vec2(vUv.x * WIDTH, (1.0 - vUv.y) * ${SKY_HEIGHT.toFixed(1)});
  float along = clamp((sky.y - BAND_TOP) * ${(1 / (SKY_HEIGHT / 4)).toFixed(8)}, 0.0, 1.0);
  vec3 colour = mix(colour0, colour1, clamp((along - stops.x) * spans.x, 0.0, 1.0));
  colour = mix(colour, colour2, clamp((along - stops.y) * spans.y, 0.0, 1.0));
  colour = mix(colour, colour3, clamp((along - stops.z) * spans.z, 0.0, 1.0));
  colour = mix(colour, colour4, clamp((along - stops.w) * spans.w, 0.0, 1.0));
  float above = step(sky.y, HORIZON);
  if (night > 0.0) {
    vec2 cell = floor(sky * 0.5);
    float seed = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float star = step(1.0 - ${STAR_SHARE.toFixed(4)}, seed) * (0.2 + 0.7 * fract(seed * 97.0)) * step(sky.y, HORIZON * 0.9);
    colour = mix(colour, vec3(1.0), star * night);
    colour = mix(colour, MOON, night * step(reach(sky, moonAt), 44.0) * (1.0 - step(reach(sky, moonAt + vec2(22.0, -10.0)), 40.0)));
  }
  if (night < 1.0) {
    float sun = reach(sky, sunAt);
    colour = mix(colour, HALO, 0.55 * (1.0 - night) * clamp((260.0 - sun) * 0.005, 0.0, 1.0) * above);
    colour = mix(colour, sunColour, step(sun, 64.0) * above);
  }
  vec4 detail = texture2D(detail, vUv);
  colour = mix(colour, fogColour, 1.0 - above);
  colour = mix(colour, cloud2, detail.b);
  colour = mix(colour, cloud1, detail.g);
  colour = mix(colour, cloud0, detail.r);
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}`;

export interface Sky {
  readonly mesh: THREE.Mesh;
  readonly texture: THREE.Texture;
  setHour: (key: THREE.Vector3) => void;
}

const placeOf = (
  bearing: THREE.Vector3,
  elevation: number,
  into: THREE.Vector2
): THREE.Vector2 => {
  const turn = Math.atan2(bearing.z, -bearing.x) / FULL_TURN;
  return into.set(
    (((turn % 1) + 1) % 1) * SKY_WIDTH,
    (0.5 - elevation / Math.PI) * SKY_HEIGHT
  );
};

export const buildSky = (random: Random, hour: LiveHour): Sky => {
  const texture = detailTexture(random);
  const uniforms = {
    cloud0: { value: hour.clouds[0] },
    cloud1: { value: hour.clouds[1] },
    cloud2: { value: hour.clouds[2] },
    colour0: { value: hour.sky[0] },
    colour1: { value: hour.sky[1] },
    colour2: { value: hour.sky[2] },
    colour3: { value: hour.sky[3] },
    colour4: { value: hour.sky[4] },
    detail: { value: texture },
    fogColour: { value: hour.fog },
    moonAt: {
      value: placeOf(MOON_BEARING, MOON_ELEVATION, new THREE.Vector2()),
    },
    night: { value: 0 },
    spans: { value: new THREE.Vector4() },
    stops: { value: new THREE.Vector4() },
    sunAt: { value: new THREE.Vector2() },
    sunColour: { value: hour.sun },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 48, 24),
    new THREE.ShaderMaterial({
      depthWrite: false,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      uniforms,
      vertexShader: VERTEX,
    })
  );
  mesh.renderOrder = SKY_LAST;
  const bearing = new THREE.Vector3();
  return {
    mesh: onFxLayer(mesh),
    setHour(key) {
      const [s0, s1, s2, s3, s4] = hour.stops;
      uniforms.stops.value.set(s0, s1, s2, s3);
      uniforms.spans.value.set(
        1 / Math.max(s1 - s0, 1e-4),
        1 / Math.max(s2 - s1, 1e-4),
        1 / Math.max(s3 - s2, 1e-4),
        1 / Math.max(s4 - s3, 1e-4)
      );
      uniforms.night.value = hour.night;
      bearing.copy(key).setY(0).normalize();
      placeOf(bearing, hour.sunElevation, uniforms.sunAt.value);
    },
    texture,
  };
};
