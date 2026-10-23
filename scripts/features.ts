import type { FeatureEntry } from "./feature-map.ts";
import { platformFeatures } from "./platform-features.ts";
import { playerFeatures } from "./player-features.ts";

export const features: readonly FeatureEntry[] = [
  ...playerFeatures,
  ...platformFeatures,
];
