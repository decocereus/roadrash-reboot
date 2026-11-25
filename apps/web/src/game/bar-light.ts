import { lookOf, night, sunset } from "./looks.ts";
import type { Look } from "./looks.ts";

const KEY: Look["keyDirection"] = [0.22, 0.8, 0.56];

export const duskLook: Look = {
  ...lookOf("salt-coast"),
  ...sunset,
  bloom: 0.42,
  glow: 0.86,
  grade: [1.04, 0.98, 1.03],
  ink: "#1c0730",
  keyDirection: KEY,
  later: [],
  lit: [1.06, 0.9, 0.84],
  rim: "#ffd27a",
  rimDirection: [-0.92, 0.3, 0.2],
  shadow: [0.66, 0.5, 0.74],
};

export const nightLook: Look = {
  ...lookOf("lowtown"),
  ...night,
  backdrop: "#1c1f74",
  bloom: 0.5,
  glow: 1.12,
  grade: [1, 0.97, 1.06],
  ink: "#10041f",
  keyDirection: KEY,
  later: [],
  lit: [0.86, 0.68, 0.86],
  rim: "#ff2bd6",
  rimDirection: [0.6, 0.2, -0.8],
  shadow: [0.4, 0.3, 0.6],
  sky: [
    [0, "#07082a"],
    [0.45, "#141663"],
    [0.75, "#3a2a8a"],
    [0.875, "#623292"],
    [1, "#8a3a9a"],
  ],
};

export const barLook: Look = {
  ...duskLook,
  later: [{ ...nightLook, at: 1 }],
};
