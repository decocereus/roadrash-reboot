import { byId } from "@racer/content/rows";
import { bikeVisuals, riderVisuals } from "@racer/content/visuals";
import type { CelebrityId } from "@racer/sim/cast";

import type { BikeModelId } from "../game/bike-models.ts";
import { artUrl } from "./art.ts";

export interface ModelUrls {
  readonly bikes: Readonly<Record<BikeModelId, string>>;
  readonly car: string;
  readonly truck: string;
  readonly van: string;
  readonly figures: readonly [string, string, string];
  readonly walkers: string;
  readonly celebrities: Readonly<Record<CelebrityId, string>>;
}

export const modelUrls: ModelUrls = {
  bikes: byId(bikeVisuals, ({ model }) => artUrl(model)),
  car: artUrl("models/car.glb"),
  celebrities: byId(riderVisuals, ({ model }) => artUrl(model)),
  figures: [
    artUrl("models/rider_a.glb"),
    artUrl("models/rider_b.glb"),
    artUrl("models/rider_c.glb"),
  ],
  truck: artUrl("models/truck.glb"),
  van: artUrl("models/van.glb"),
  walkers: artUrl("models/pedestrians.glb"),
};
