import type { BikeModelId } from "../game/bike-models.ts";
import type { CelebrityId } from "../game/figure-wear.ts";
import classic from "../game/models/bike.glb?url";
import car from "../game/models/car.glb?url";
import ghost from "../game/models/ghost.glb?url";
import oni from "../game/models/oni.glb?url";
import riderA from "../game/models/rider_a.glb?url";
import altman from "../game/models/rider_altman.glb?url";
import riderB from "../game/models/rider_b.glb?url";
import riderC from "../game/models/rider_c.glb?url";
import kylie from "../game/models/rider_kylie.glb?url";
import mbappe from "../game/models/rider_mbappe.glb?url";
import musk from "../game/models/rider_musk.glb?url";
import ranveer from "../game/models/rider_ranveer.glb?url";
import ronaldo from "../game/models/rider_ronaldo.glb?url";
import seraph from "../game/models/seraph.glb?url";
import van from "../game/models/van.glb?url";

export interface ModelUrls {
  readonly bikes: Readonly<Record<BikeModelId, string>>;
  readonly car: string;
  readonly van: string;
  readonly figures: readonly [string, string, string];
  readonly celebrities: Readonly<Record<CelebrityId, string>>;
}

export const modelUrls: ModelUrls = {
  bikes: { classic, ghost, oni, seraph },
  car,
  celebrities: { altman, kylie, mbappe, musk, ranveer, ronaldo },
  figures: [riderA, riderB, riderC],
  van,
};
