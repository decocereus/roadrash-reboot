import type { BikeId } from "@racer/sim/bikes";

export const bikeModelIds = ["classic", "seraph", "ghost", "oni"] as const;

export type BikeModelId = (typeof bikeModelIds)[number];

export const bikeModelOf = {
  "brack-anvil-1100": "oni",
  "brack-stoker-800": "oni",
  "gutter-pup-250": "classic",
  "halden-kite-500": "ghost",
  "halden-meridian-900": "ghost",
  "halden-wren-400": "ghost",
  "ostra-nera-1000": "seraph",
  "ostra-sesta-600": "seraph",
  "ostra-sette-750": "seraph",
} as const satisfies Record<BikeId, BikeModelId>;

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
