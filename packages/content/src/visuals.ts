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
    suit: 0xb8_c8_ff,
  },
  {
    id: "ronaldo",
    model: "models/rider_ronaldo.glb",
    suit: 0xaf_1f_36,
  },
  {
    id: "mbappe",
    model: "models/rider_mbappe.glb",
    suit: 0x5f_6b_5c,
  },
  {
    id: "musk",
    model: "models/rider_musk.glb",
    suit: 0x48_48_5d,
  },
  {
    id: "altman",
    model: "models/rider_altman.glb",
    suit: 0x6a_77_8e,
  },
  {
    id: "ranveer",
    model: "models/rider_ranveer.glb",
    suit: 0xda_3a_a0,
  },
] as const;

export type BikeVisual = (typeof bikeVisuals)[number];

export type RiderVisual = (typeof riderVisuals)[number];
