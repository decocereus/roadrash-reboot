import type { FeatureEntry } from "./feature-map.ts";
import { platformFeatures } from "./platform-features.ts";
import { playerFeatures } from "./player-features.ts";
import { roomFeatures } from "./room-features.ts";
import { sessionFeatures } from "./session-features.ts";

export const features: readonly FeatureEntry[] = [
  ...playerFeatures,
  ...platformFeatures,
  ...roomFeatures,
  ...sessionFeatures,
];
