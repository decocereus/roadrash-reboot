import { bikeDefinitions } from "@racer/content/bikes";
import { byId, idsOf } from "@racer/content/rows";
import { bikeVisuals } from "@racer/content/visuals";
import type { BikeVisual } from "@racer/content/visuals";
import type { BikeId } from "@racer/sim/bikes";

export const bikeModelIds = idsOf<BikeVisual>(bikeVisuals);

export type BikeModelId = (typeof bikeModelIds)[number];

export const bikeModelOf: Readonly<Record<BikeId, BikeModelId>> = byId(
  bikeDefinitions,
  ({ looks }) => looks.model
);

const modelById: ReadonlyMap<string, BikeModelId> = new Map(
  Object.entries(bikeModelOf)
);

export const bikeModelFor = (bikeId: string): BikeModelId => {
  const model = modelById.get(bikeId);
  if (model === undefined) {
    throw new Error(`No bike model draws the bike ${bikeId}.`);
  }
  return model;
};
