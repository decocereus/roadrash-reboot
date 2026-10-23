import bike from "../game/models/bike.glb?url";
import car from "../game/models/car.glb?url";
import riderA from "../game/models/rider_a.glb?url";
import riderB from "../game/models/rider_b.glb?url";
import riderC from "../game/models/rider_c.glb?url";
import van from "../game/models/van.glb?url";

export interface ModelUrls {
  readonly bike: string;
  readonly car: string;
  readonly van: string;
  readonly riders: readonly [string, string, string];
}

export const modelUrls: ModelUrls = {
  bike,
  car,
  riders: [riderA, riderB, riderC],
  van,
};
