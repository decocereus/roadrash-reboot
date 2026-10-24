import type { BikeModelId } from "../game/bike-models.ts";
import classic from "../game/models/bike.glb?url";
import car from "../game/models/car.glb?url";
import ghost from "../game/models/ghost.glb?url";
import oni from "../game/models/oni.glb?url";
import riderA from "../game/models/rider_a.glb?url";
import riderB from "../game/models/rider_b.glb?url";
import riderC from "../game/models/rider_c.glb?url";
import seraph from "../game/models/seraph.glb?url";
import van from "../game/models/van.glb?url";

export interface ModelUrls {
  readonly bikes: Readonly<Record<BikeModelId, string>>;
  readonly car: string;
  readonly van: string;
  readonly riders: readonly [string, string, string];
}

export const modelUrls: ModelUrls = {
  bikes: { classic, ghost, oni, seraph },
  car,
  riders: [riderA, riderB, riderC],
  van,
};
