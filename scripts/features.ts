import type { FeatureEntry } from "./feature-map.ts";
import { platformFeatures } from "./platform-features.ts";
import { playerFeatures } from "./player-features.ts";
import { roadFeatures } from "./road-features.ts";
import { roomFeatures } from "./room-features.ts";

export const features: readonly FeatureEntry[] = [
  ...playerFeatures,
  ...roadFeatures,
  ...platformFeatures,
  ...roomFeatures,
];
