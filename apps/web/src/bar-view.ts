import { riderBlocks } from "@racer/sim/palette";

const barSpots = ["garage"] as const;
export type BarSpot = (typeof barSpots)[number];

export const barCameras = ["angled", "follow", "room"] as const;
export type BarCamera = (typeof barCameras)[number];

export const barCameraLabels = {
  angled: "Angled",
  follow: "Follow",
  room: "Whole room",
} as const satisfies Record<BarCamera, string>;

const SAVED_CAMERA = "rushline.bar-camera";

export const savedBarCamera = (): BarCamera => {
  try {
    const saved = globalThis.localStorage.getItem(SAVED_CAMERA);
    return barCameras.find((camera) => camera === saved) ?? "angled";
  } catch {
    return "angled";
  }
};

export const saveBarCamera = (camera: BarCamera): boolean => {
  try {
    globalThis.localStorage.setItem(SAVED_CAMERA, camera);
    return true;
  } catch {
    return false;
  }
};

export const SOLO_SLOT = riderBlocks.length - 1;
