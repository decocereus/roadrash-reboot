import type { RegionId } from "@racer/track/regions";

export const YELLOW = "#fff04a";
export const CYAN = "#19e6ff";
export const MAGENTA = "#ff2bd6";
export const RED = "#ff2e3d";
export const ORANGE = "#ff7a1a";

export type Kit = "city" | "open";

type Triple = readonly [number, number, number];

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

export interface Look {
  readonly kit: Kit;
  readonly sky: readonly (readonly [number, string])[];
  readonly clouds: readonly [string, string, string];
  readonly sun: string | null;
  readonly fog: string;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly shadow: Triple;
  readonly lit: Triple;
  readonly keyDirection: Triple;
  readonly rimDirection: Triple;
  readonly rim: string;
  readonly ink: string;
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
  readonly ground: string;
  readonly groundNear: string;
  readonly groundFar: string;
  readonly groundPatch: string;
  readonly dust: string;
  readonly foliage: readonly [string, string];
  readonly trunk: string;
  readonly rock: string;
  readonly backdrop: string;
  readonly bloom: number;
  readonly grade: Triple;
  readonly wet: boolean;
  readonly roadside: Roadside;
}

const dusk: Look = {
  backdrop: "#7a2f6e",
  bloom: 0.34,
  centre: "#ffc21a",
  clouds: ["#ff9a8a", "#b8366f", "#6a1a66"],
  dark: "#3a2452",
  dust: "#d9b48c",
  fog: "#f0605e",
  fogFar: 1700,
  fogNear: 160,
  foliage: ["#2f6a5a", "#58a878"],
  glassTop: "#ff9a5a",
  grade: [1.03, 0.99, 1.02],
  ground: "#2a1838",
  groundFar: "#8a5a6a",
  groundNear: "#b08a7a",
  groundPatch: "#c9a27a",
  ink: "#2a0d3a",
  kerb: "#c2aebc",
  keyDirection: [-0.15, 0.42, -0.88],
  kit: "city",
  lamp: "#fff7a8",
  line: "#fff0e6",
  lit: [1.1, 0.97, 0.82],
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
  rim: "#fff2a8",
  rimDirection: [-0.3, 0.45, -0.84],
  road: "#75606f",
  roadside: bare,
  rock: "#8a7488",
  shadow: [0.62, 0.5, 0.77],
  sky: [
    [0, "#2a0f5e"],
    [0.34, "#a3236f"],
    [0.6, "#ff4d4d"],
    [0.8, "#ff9a2e"],
    [1, "#ffe66b"],
  ],
  sun: "#fff7c2",
  trunk: "#4a2f4a",
  walk: "#9a8494",
  walls: ["#c79a9e", "#d4aa94", "#b58aa4", "#dab59a", "#a68298", "#c4a4b4"],
  wet: false,
};

const night: Look = {
  backdrop: "#141c58",
  bloom: 0.46,
  centre: "#ffb000",
  clouds: ["#2a3a8a", "#141c58", "#0a0e36"],
  dark: "#141a4a",
  dust: "#a3aabe",
  fog: "#1a2166",
  fogFar: 1100,
  fogNear: 90,
  foliage: ["#16405a", "#2a7a8a"],
  glassTop: "#2a3a8a",
  grade: [0.98, 1, 1.06],
  ground: "#070818",
  groundFar: "#1c2a5a",
  groundNear: "#2a3a6a",
  groundPatch: "#34507a",
  ink: "#050616",
  kerb: "#6a70aa",
  keyDirection: [0.08, 0.98, 0.18],
  kit: "city",
  lamp: "#e8fbff",
  line: "#d4dcff",
  lit: [0.9, 0.98, 1.1],
  litShare: 0.36,
  litWindows: ["#ffd27a", "#ffe66b", CYAN, CYAN, MAGENTA, "#ffd27a"],
  rim: "#7af2ff",
  rimDirection: [0.75, 0.3, -0.58],
  road: "#3a4070",
  roadside: bare,
  rock: "#4a5088",
  shadow: [0.42, 0.47, 0.8],
  sky: [
    [0, "#02030f"],
    [0.4, "#070b2c"],
    [0.7, "#141e5c"],
    [0.9, "#2a2a7a"],
    [1, "#4a3390"],
  ],
  sun: null,
  trunk: "#1a1f4a",
  walk: "#4a5088",
  walls: ["#4a5296", "#565ea6", "#404884", "#5e66ae", "#383f7c", "#4c4a90"],
  wet: true,
};

const dawn: Look = {
  backdrop: "#b0507a",
  bloom: 0.3,
  centre: "#ffc21a",
  clouds: ["#ffc0a0", "#e0708a", "#8a3a7a"],
  dark: "#3a2452",
  dust: "#efca9c",
  fog: "#f4a08a",
  fogFar: 2600,
  fogNear: 260,
  foliage: ["#4a6a4a", "#8aa85a"],
  glassTop: "#ffb07a",
  grade: [1.03, 1, 1],
  ground: "#5a2a3a",
  groundFar: "#c8684a",
  groundNear: "#e8a070",
  groundPatch: "#f4c890",
  ink: "#3a1030",
  kerb: "#d8b8a8",
  keyDirection: [0.5, 0.36, -0.79],
  kit: "open",
  lamp: "#fff7a8",
  line: "#fff4e0",
  lit: [1.08, 0.98, 0.86],
  litShare: 0.2,
  litWindows: ["#ffe66b", "#ffd27a", "#ffb84a", MAGENTA, CYAN],
  rim: "#ffe8b0",
  rimDirection: [0.5, 0.4, -0.76],
  road: "#7a6470",
  roadside: {
    bank: 0.3,
    bankColour: "#c87a58",
    bankHeight: [1.6, 3.4],
    boulders: 0.3,
    signs: 0.7,
    treeline: 0,
  },
  rock: "#c07a5a",
  shadow: [0.6, 0.5, 0.74],
  sky: [
    [0, "#2c1a6a"],
    [0.4, "#8a3a8a"],
    [0.66, "#f0607a"],
    [0.84, "#ffa05a"],
    [1, "#ffe9a0"],
  ],
  sun: "#fffbe0",
  trunk: "#5a3a3a",
  walk: "#b89888",
  walls: ["#c79a9e", "#d4aa94", "#b58aa4", "#dab59a", "#a68298", "#c4a4b4"],
  wet: false,
};

const woods: Look = {
  ...night,
  dust: "#9c9274",
  fogFar: 620,
  fogNear: 60,
  groundFar: "#123a4a",
  groundNear: "#1c4a52",
  groundPatch: "#2a6a5a",
  keyDirection: [-0.3, 0.8, -0.5],
  kit: "open",
  road: "#343c66",
  roadside: {
    bank: 0.12,
    bankColour: "#1a3448",
    bankHeight: [1.4, 2.6],
    boulders: 0.12,
    signs: 0.3,
    treeline: 1.3,
  },
  wet: false,
};

const ridge: Look = {
  ...dusk,
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

const park: Look = {
  ...ridge,
  dust: "#b8b094",
  fogFar: 1500,
  fogNear: 200,
  foliage: ["#3f7a4e", "#5a9a5a"],
  groundFar: "#4a6a5a",
  groundNear: "#6a8a5e",
  groundPatch: "#8aa060",
  roadside: bare,
  trunk: "#5a4038",
};

const looks = {
  "casa-de-campo": park,
  "cinder-flats": dawn,
  "kettle-woods": woods,
  lowtown: night,
  "madrid-centro": park,
  "salt-coast": dusk,
  stonepeak: ridge,
} as const satisfies Record<RegionId, Look>;

export const lookOf = (region: RegionId): Look => looks[region];
