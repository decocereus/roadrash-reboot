import { bikeDefinitions } from "@racer/content/bikes";
import type { BikeDefinition } from "@racer/content/bikes";
import { byId, idsOf } from "@racer/content/rows";

import type { BikeSpec } from "./state.ts";

export const bikeIds = idsOf<BikeDefinition>(bikeDefinitions);

export type BikeId = (typeof bikeIds)[number];

export const bikes: Readonly<Record<BikeId, BikeSpec>> = byId(
  bikeDefinitions,
  ({ id, spec }): BikeSpec => ({ ...spec, id })
);

export const streetBike: BikeSpec = bikes["ostra-sesta-600"];
