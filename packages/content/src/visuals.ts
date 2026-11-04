export const bikeVisuals = [
  {
    id: "classic",
    model: "models/bike.glb",
  },
  {
    id: "seraph",
    model: "models/seraph.glb",
  },
  {
    id: "ghost",
    model: "models/ghost.glb",
  },
  {
    id: "oni",
    model: "models/oni.glb",
  },
] as const;

export const riderVisuals = [
  {
    id: "kylie",
    model: "models/rider_kylie.glb",
  },
  {
    id: "ronaldo",
    model: "models/rider_ronaldo.glb",
  },
  {
    id: "mbappe",
    model: "models/rider_mbappe.glb",
  },
  {
    id: "musk",
    model: "models/rider_musk.glb",
  },
  {
    id: "altman",
    model: "models/rider_altman.glb",
  },
  {
    id: "ranveer",
    model: "models/rider_ranveer.glb",
  },
] as const;

export type BikeVisual = (typeof bikeVisuals)[number];

export type RiderVisual = (typeof riderVisuals)[number];
