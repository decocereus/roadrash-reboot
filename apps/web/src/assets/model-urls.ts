import type { BikeModelId } from "../game/bike-models.ts";
import type { CelebrityId } from "../game/figure-wear.ts";
import { artUrl } from "./art.ts";

export interface ModelUrls {
  readonly bikes: Readonly<Record<BikeModelId, string>>;
  readonly car: string;
  readonly van: string;
  readonly figures: readonly [string, string, string];
  readonly celebrities: Readonly<Record<CelebrityId, string>>;
}

export const modelUrls: ModelUrls = {
  bikes: {
    classic: artUrl("models/bike.glb"),
    ghost: artUrl("models/ghost.glb"),
    oni: artUrl("models/oni.glb"),
    seraph: artUrl("models/seraph.glb"),
  },
  car: artUrl("models/car.glb"),
  celebrities: {
    altman: artUrl("models/rider_altman.glb"),
    kylie: artUrl("models/rider_kylie.glb"),
    mbappe: artUrl("models/rider_mbappe.glb"),
    musk: artUrl("models/rider_musk.glb"),
    ranveer: artUrl("models/rider_ranveer.glb"),
    ronaldo: artUrl("models/rider_ronaldo.glb"),
  },
  figures: [
    artUrl("models/rider_a.glb"),
    artUrl("models/rider_b.glb"),
    artUrl("models/rider_c.glb"),
  ],
  van: artUrl("models/van.glb"),
};
