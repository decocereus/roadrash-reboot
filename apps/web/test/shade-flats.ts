import * as THREE from "three";

const CLUSTERS = 16;
const ROUNDS = 16;
const SAMPLE_LIMIT = 24_000;
export const BACKGROUND = "#3a3a3a";
const BAND_STEP = 0.02;
const HUE_FLOOR = 0.03;
const INK_TOLERANCE = 3;
const LIGHTNESS_TOLERANCE = 0.01;
const RIM_STEP = 0.1;
const RIM_SHARE_FLOOR = 0.005;
const FLAT_SHARE_FLOOR = 0.02;

type Lab = readonly [number, number, number];

const linearOf = (byte: number): number => {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const labOf = (red: number, green: number, blue: number): Lab => {
  const r = linearOf(red);
  const g = linearOf(green);
  const b = linearOf(blue);
  const l = Math.cbrt(0.412221471 * r + 0.536332536 * g + 0.051445993 * b);
  const m = Math.cbrt(0.211903498 * r + 0.680699545 * g + 0.107396957 * b);
  const s = Math.cbrt(0.088302462 * r + 0.281718838 * g + 0.629978701 * b);
  return [
    0.210454255 * l + 0.793617785 * m - 0.004072047 * s,
    1.977998495 * l - 2.428592205 * m + 0.45059371 * s,
    0.025904037 * l + 0.782771766 * m - 0.808675766 * s,
  ];
};

const lchOf = (lab: Lab) => ({
  c: Math.hypot(lab[1], lab[2]),
  h: (THREE.MathUtils.radToDeg(Math.atan2(lab[2], lab[1])) + 360) % 360,
  l: lab[0],
});

const hueGap = (from: number, to: number): number => {
  const gap = Math.abs(from - to) % 360;
  return gap > 180 ? 360 - gap : gap;
};

const distance = (a: Lab, b: Lab): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const meanOf = (labs: readonly Lab[]): Lab => {
  let l = 0;
  let a = 0;
  let b = 0;
  for (const lab of labs) {
    l += lab[0];
    a += lab[1];
    b += lab[2];
  }
  const count = Math.max(labs.length, 1);
  return [l / count, a / count, b / count];
};

export const round = (value: number, places = 3): number =>
  Math.round(value * 10 ** places) / 10 ** places;

export interface Bands {
  readonly valid: Uint8Array;
  readonly lit: readonly Lab[];
  readonly shadow: readonly Lab[];
  readonly world: readonly Lab[];
}

const labAt = (pixels: Uint8Array, pixel: number): Lab =>
  labOf(
    pixels[pixel * 4] ?? 0,
    pixels[pixel * 4 + 1] ?? 0,
    pixels[pixel * 4 + 2] ?? 0
  );

const clearOfInk = (
  lit: Uint8Array,
  inked: Uint8Array,
  pixel: number
): boolean => {
  let gap = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    gap += Math.abs(
      (lit[pixel * 4 + channel] ?? 0) - (inked[pixel * 4 + channel] ?? 0)
    );
  }
  return gap <= INK_TOLERANCE;
};

const median = (values: readonly number[]): number =>
  round(values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0);

const quantile = (values: readonly number[], at: number): number | null => {
  const sorted = values.toSorted((a, b) => a - b);
  const value = sorted[Math.floor((sorted.length - 1) * at)];
  return value === undefined ? null : round(value, 1);
};

const backgroundLab = labOf(
  Number.parseInt(BACKGROUND.slice(1, 3), 16),
  Number.parseInt(BACKGROUND.slice(3, 5), 16),
  Number.parseInt(BACKGROUND.slice(5, 7), 16)
);

export const bandsOf = (
  lit: Uint8Array,
  inked: Uint8Array,
  shadow: Uint8Array,
  world: Uint8Array,
  width: number,
  height: number
): Bands => {
  const banded = new Uint8Array(width * height);
  const litLabs: Lab[] = Array.from({ length: width * height });
  const shadowLabs: Lab[] = Array.from({ length: width * height });
  const worldLabs: Lab[] = Array.from({ length: width * height });
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const litLab = labAt(lit, pixel);
    const shadowLab = labAt(shadow, pixel);
    litLabs[pixel] = litLab;
    shadowLabs[pixel] = shadowLab;
    worldLabs[pixel] = labAt(world, pixel);
    const onSubject =
      clearOfInk(lit, inked, pixel) &&
      distance(litLab, backgroundLab) > BAND_STEP &&
      distance(shadowLab, backgroundLab) > BAND_STEP;
    banded[pixel] = onSubject && litLab[0] - shadowLab[0] > BAND_STEP ? 1 : 0;
  }
  const valid = new Uint8Array(width * height);
  for (let row = 1; row < height - 1; row += 1) {
    for (let column = 1; column < width - 1; column += 1) {
      const pixel = row * width + column;
      valid[pixel] =
        banded[pixel] === 1 &&
        banded[pixel - 1] === 1 &&
        banded[pixel + 1] === 1 &&
        banded[pixel - width] === 1 &&
        banded[pixel + width] === 1
          ? 1
          : 0;
    }
  }
  return { lit: litLabs, shadow: shadowLabs, valid, world: worldLabs };
};

const nearestOf = (centres: readonly Lab[], lab: Lab): number => {
  let best = 0;
  let gap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centres.length; index += 1) {
    const centre = centres[index];
    if (centre && distance(centre, lab) < gap) {
      gap = distance(centre, lab);
      best = index;
    }
  }
  return best;
};

const centresOf = (sample: readonly Lab[]): Lab[] => {
  const byLightness = sample.toSorted((a, b) => a[0] - b[0]);
  const first = byLightness[Math.floor(byLightness.length / 2)];
  if (!first) {
    return [];
  }
  const centres: Lab[] = [first];
  while (centres.length < CLUSTERS) {
    let farthest = first;
    let gap = -1;
    for (const lab of sample) {
      const nearest = distance(centres[nearestOf(centres, lab)] ?? first, lab);
      if (nearest > gap) {
        gap = nearest;
        farthest = lab;
      }
    }
    centres.push(farthest);
  }
  for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
    const members: Lab[][] = centres.map(() => []);
    for (const lab of sample) {
      members[nearestOf(centres, lab)]?.push(lab);
    }
    for (let index = 0; index < centres.length; index += 1) {
      const group = members[index];
      if (group && group.length > 0) {
        centres[index] = meanOf(group);
      }
    }
  }
  return centres;
};

export interface Identity {
  readonly centres: readonly Lab[];
  readonly flatOf: Int16Array;
  readonly counted: number;
}

export const identityOf = (reference: Bands): Identity => {
  const sample: Lab[] = [];
  let counted = 0;
  for (const valid of reference.valid) {
    counted += valid;
  }
  const stride = Math.max(1, Math.floor(counted / SAMPLE_LIMIT));
  let seen = 0;
  for (let pixel = 0; pixel < reference.valid.length; pixel += 1) {
    const lab = reference.lit[pixel];
    if (reference.valid[pixel] === 1 && lab) {
      if (seen % stride === 0) {
        sample.push(lab);
      }
      seen += 1;
    }
  }
  const centres = centresOf(sample);
  const flatOf = new Int16Array(reference.valid.length).fill(-1);
  for (let pixel = 0; pixel < reference.valid.length; pixel += 1) {
    const lab = reference.lit[pixel];
    if (reference.valid[pixel] === 1 && lab) {
      flatOf[pixel] = nearestOf(centres, lab);
    }
  }
  return { centres, counted, flatOf };
};

const lchRounded = (lab: Lab) => {
  const lch = lchOf(lab);
  return {
    c: round(lch.c),
    h: round(lch.h, 1),
    l: round(lch.l),
    lab: lab.map((value) => round(value, 4)),
  };
};

export const flatsIn = (identity: Identity, bands: Bands) =>
  identity.centres.map((_centre, flat) => {
    const lit: Lab[] = [];
    const shadow: Lab[] = [];
    const world: number[] = [];
    const gaps: number[] = [];
    for (let pixel = 0; pixel < bands.valid.length; pixel += 1) {
      const litLab = bands.lit[pixel];
      const shadowLab = bands.shadow[pixel];
      if (
        identity.flatOf[pixel] === flat &&
        bands.valid[pixel] === 1 &&
        litLab &&
        shadowLab
      ) {
        lit.push(litLab);
        shadow.push(shadowLab);
        world.push(bands.world[pixel]?.[0] ?? 0);
        const litLch = lchOf(litLab);
        const shadowLch = lchOf(shadowLab);
        if (litLch.c >= HUE_FLOOR && shadowLch.c >= HUE_FLOOR) {
          gaps.push(hueGap(litLch.h, shadowLch.h));
        }
      }
    }
    const litMean = meanOf(lit);
    const shadowMean = meanOf(shadow);
    return {
      drift: round(hueGap(lchOf(litMean).h, lchOf(shadowMean).h), 1),
      lit: lchRounded(litMean),
      pixelDrift: {
        counted: gaps.length,
        median: quantile(gaps, 0.5),
        p90: quantile(gaps, 0.9),
      },
      pixels: lit.length,
      shadow: lchRounded(shadowMean),
      worldShade: {
        lit: median(lit.map((lab) => lab[0])),
        self: median(shadow.map((lab) => lab[0])),
        world: median(world),
      },
    };
  });

export const rimShareOf = (
  identity: Identity,
  bands: Bands,
  flats: ReturnType<typeof flatsIn>
): number => {
  let rim = 0;
  for (let pixel = 0; pixel < bands.valid.length; pixel += 1) {
    const flat = flats[identity.flatOf[pixel] ?? -1];
    const lightness = bands.world[pixel]?.[0];
    if (
      flat &&
      lightness !== undefined &&
      lightness - flat.worldShade.world > RIM_STEP
    ) {
      rim += 1;
    }
  }
  return round(rim / Math.max(identity.counted, 1), 4);
};

export const worldShadeFailures = (
  name: string,
  flats: ReturnType<typeof flatsIn>,
  counted: number,
  floor: number,
  rim: number
): string[] => {
  const failures: string[] = [];
  for (let flat = 0; flat < flats.length; flat += 1) {
    const each = flats[flat];
    if (!each || each.pixels / Math.max(counted, 1) < FLAT_SHARE_FLOOR) {
      continue;
    }
    const { lit, self, world } = each.worldShade;
    if (world > lit + LIGHTNESS_TOLERANCE) {
      failures.push(
        `${name} flat ${flat}: world shade ${world} is brighter than sun ${lit}`
      );
    }
    if (world < Math.min(self, floor) - LIGHTNESS_TOLERANCE) {
      failures.push(
        `${name} flat ${flat}: world shade ${world} is under min(self-shade ${self}, floor ${round(floor)})`
      );
    }
  }
  if (rim < RIM_SHARE_FLOOR) {
    failures.push(
      `${name}: sky rim covers ${rim} of the figure in world shade`
    );
  }
  return failures;
};
