import type { RegionId } from "@racer/track/regions";

export const YELLOW = "#fff04a";
export const CYAN = "#19e6ff";
export const MAGENTA = "#ff2bd6";
export const RED = "#ff2e3d";
export const ORANGE = "#ff7a1a";

export const FIGURE_FLOOR_OVER_INK = 0.05;

export type Kit = "city" | "open";

type Triple = readonly [number, number, number];

type SkyStop = readonly [number, string];

export interface Roadside {
  readonly bank: number;
  readonly bankHeight: readonly [number, number];
  readonly bankColour: string;
  readonly treeline: number;
  readonly boulders: number;
  readonly signs: number;
}

const bare: Roadside = {
  bank: 0,
  bankColour: "#000000",
  bankHeight: [0, 0],
  boulders: 0,
  signs: 0,
  treeline: 0,
};

export interface Hour {
  readonly sky: readonly [SkyStop, SkyStop, SkyStop, SkyStop, SkyStop];
  readonly clouds: readonly [string, string, string];
  readonly sun: string;
  readonly sunElevation: number;
  readonly night: number;
  readonly fog: string;
  readonly shadow: Triple;
  readonly lit: Triple;
  readonly keyDirection: Triple;
  readonly rimDirection: Triple;
  readonly rim: string;
  readonly ink: string;
  readonly backdrop: string;
  readonly ground: string;
  readonly bloom: number;
  readonly grade: Triple;
  readonly glow: number;
}

interface Later extends Hour {
  readonly at: number;
}

export interface Air {
  readonly haze: string;
  readonly hazeShare: number;
}

interface Place {
  readonly kit: Kit;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly walls: readonly string[];
  readonly dark: string;
  readonly glassTop: string;
  readonly litWindows: readonly string[];
  readonly litShare: number;
  readonly road: string;
  readonly walk: string;
  readonly kerb: string;
  readonly line: string;
  readonly centre: string;
  readonly lamp: string;
  readonly groundNear: string;
  readonly groundFar: string;
  readonly groundPatch: string;
  readonly dust: string;
  readonly foliage: readonly [string, string];
  readonly trunk: string;
  readonly rock: string;
  readonly wet: boolean;
  readonly roadside: Roadside;
  readonly air: Air;
}

export interface Look extends Place, Hour {
  readonly later: readonly Later[];
  readonly nightTick: number;
}

const clearAir: Air = { haze: "#000000", hazeShare: 0 };

const evening: Hour = {
  backdrop: "#8a3a72",
  bloom: 0.3,
  clouds: ["#ffb8a0", "#d0507a", "#7a2a6e"],
  fog: "#f87a66",
  glow: 0.8,
  grade: [1.03, 1, 1.01],
  ground: "#3a2040",
  ink: "#2e1040",
  keyDirection: [-0.15, 0.55, -0.82],
  lit: [1.14, 1.02, 0.88],
  night: 0,
  rim: "#fff6c0",
  rimDirection: [-0.3, 0.45, -0.84],
  shadow: [0.66, 0.55, 0.8],
  sky: [
    [0, "#3a2a7e"],
    [0.34, "#b8407a"],
    [0.6, "#ff7a5a"],
    [0.8, "#ffb84a"],
    [1, "#fff0a0"],
  ],
  sun: "#fffadf",
  sunElevation: 0.2,
};

export const sunset: Hour = {
  backdrop: "#7a2f6e",
  bloom: 0.34,
  clouds: ["#ff9a8a", "#b8366f", "#6a1a66"],
  fog: "#f0605e",
  glow: 1,
  grade: [1.03, 0.99, 1.02],
  ground: "#2a1838",
  ink: "#2a0d3a",
  keyDirection: [-0.15, 0.42, -0.88],
  lit: [1.1, 0.97, 0.82],
  night: 0,
  rim: "#fff2a8",
  rimDirection: [-0.3, 0.45, -0.84],
  shadow: [0.62, 0.5, 0.77],
  sky: [
    [0, "#2a0f5e"],
    [0.34, "#a3236f"],
    [0.6, "#ff4d4d"],
    [0.8, "#ff9a2e"],
    [1, "#ffe66b"],
  ],
  sun: "#fff7c2",
  sunElevation: 0.08,
};

const twilight: Hour = {
  backdrop: "#3a1f5e",
  bloom: 0.42,
  clouds: ["#a04a7a", "#5a1e66", "#2a0f4a"],
  fog: "#6a2f6e",
  glow: 1,
  grade: [1, 0.98, 1.04],
  ground: "#1a1030",
  ink: "#1a0a2e",
  keyDirection: [-0.15, 0.42, -0.88],
  lit: [0.72, 0.66, 0.86],
  night: 0.4,
  rim: "#c89aff",
  rimDirection: [-0.3, 0.45, -0.84],
  shadow: [0.6, 0.54, 0.8],
  sky: [
    [0, "#140a3e"],
    [0.34, "#3a1a6e"],
    [0.6, "#7a2a7a"],
    [0.8, "#c0406a"],
    [1, "#ff7a4a"],
  ],
  sun: "#ff9a6a",
  sunElevation: -0.12,
};

export const night: Hour = {
  backdrop: "#141c58",
  bloom: 0.46,
  clouds: ["#2a3a8a", "#141c58", "#0a0e36"],
  fog: "#1a2166",
  glow: 1,
  grade: [0.98, 1, 1.06],
  ground: "#070818",
  ink: "#050616",
  keyDirection: [0.08, 0.98, 0.18],
  lit: [0.9, 0.98, 1.1],
  night: 1,
  rim: "#7af2ff",
  rimDirection: [0.75, 0.3, -0.58],
  shadow: [0.42, 0.47, 0.8],
  sky: [
    [0, "#02030f"],
    [0.4, "#070b2c"],
    [0.7, "#141e5c"],
    [0.9, "#2a2a7a"],
    [1, "#4a3390"],
  ],
  sun: "#ff9a6a",
  sunElevation: -0.3,
};

const deepNight: Hour = {
  ...night,
  backdrop: "#0e1446",
  bloom: 0.5,
  clouds: ["#1c2870", "#0c1244", "#060a28"],
  fog: "#10164a",
  ground: "#04050f",
  sky: [
    [0, "#010208"],
    [0.4, "#04061c"],
    [0.7, "#0c1244"],
    [0.9, "#1c1c5a"],
    [1, "#2e2470"],
  ],
};

const moonRise: Hour = {
  ...twilight,
  keyDirection: night.keyDirection,
  rimDirection: night.rimDirection,
};

const sunDown: readonly Later[] = [
  { ...sunset, at: 0.4 },
  { ...twilight, at: 0.6 },
  { ...moonRise, at: 0.65 },
  { ...night, at: 0.85 },
];

const cityDusk: Place = {
  air: clearAir,
  centre: "#ffc21a",
  dark: "#3a2452",
  dust: "#d9b48c",
  fogFar: 1700,
  fogNear: 160,
  foliage: ["#2f6a5a", "#58a878"],
  glassTop: "#ff9a5a",
  groundFar: "#8a5a6a",
  groundNear: "#b08a7a",
  groundPatch: "#c9a27a",
  kerb: "#c2aebc",
  kit: "city",
  lamp: "#fff7a8",
  line: "#fff0e6",
  litShare: 0.2,
  litWindows: [
    "#ffe66b",
    "#ffd27a",
    "#ffb84a",
    "#ffe66b",
    "#ff9a1f",
    MAGENTA,
    CYAN,
  ],
  road: "#75606f",
  roadside: bare,
  rock: "#8a7488",
  trunk: "#4a2f4a",
  walk: "#9a8494",
  walls: ["#c79a9e", "#d4aa94", "#b58aa4", "#dab59a", "#a68298", "#c4a4b4"],
  wet: false,
};

const cityNight: Place = {
  air: clearAir,
  centre: "#ffb000",
  dark: "#141a4a",
  dust: "#a3aabe",
  fogFar: 1100,
  fogNear: 90,
  foliage: ["#16405a", "#2a7a8a"],
  glassTop: "#2a3a8a",
  groundFar: "#1c2a5a",
  groundNear: "#2a3a6a",
  groundPatch: "#34507a",
  kerb: "#6a70aa",
  kit: "city",
  lamp: "#e8fbff",
  line: "#d4dcff",
  litShare: 0.36,
  litWindows: ["#ffd27a", "#ffe66b", CYAN, CYAN, MAGENTA, "#ffd27a"],
  road: "#3a4070",
  roadside: bare,
  rock: "#4a5088",
  trunk: "#1a1f4a",
  walk: "#4a5088",
  walls: ["#4a5296", "#565ea6", "#404884", "#5e66ae", "#383f7c", "#4c4a90"],
  wet: true,
};

const ridgeTop: Place = {
  ...cityDusk,
  dust: "#cbc4aa",
  fogFar: 2200,
  fogNear: 240,
  groundFar: "#5a4a7a",
  groundNear: "#8a7a6a",
  groundPatch: "#a8a060",
  kit: "open",
  roadside: {
    bank: 0.55,
    bankColour: "#8a7488",
    bankHeight: [3, 7],
    boulders: 0.5,
    signs: 0.6,
    treeline: 0.15,
  },
};

const looks = {
  lowtown: {
    ...cityNight,
    ...moonRise,
    later: [
      { ...night, at: 0.5 },
      { ...deepNight, at: 0.85 },
    ],
    nightTick: 13_300,
  },
  "salt-coast": {
    ...cityDusk,
    ...evening,
    later: sunDown,
    nightTick: 14_000,
  },
  stonepeak: {
    ...ridgeTop,
    ...evening,
    later: sunDown,
    nightTick: 15_300,
  },
} as const satisfies Record<RegionId, Look>;

export const lookOf = (region: RegionId): Look => looks[region];
