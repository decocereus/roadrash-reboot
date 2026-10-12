export type RegionId =
  | "salt-coast"
  | "cinder-flats"
  | "kettle-woods"
  | "lowtown"
  | "stonepeak";

export interface PropMix {
  readonly tree: number;
  readonly pole: number;
  readonly rock: number;
  readonly chevron: number;
}

export interface Region {
  readonly id: RegionId;
  readonly name: string;
  readonly propMix: PropMix;
}

export const regions = {
  "cinder-flats": {
    id: "cinder-flats",
    name: "Cinder Flats",
    propMix: { chevron: 1, pole: 0.5, rock: 0.8, tree: 0.12 },
  },
  "kettle-woods": {
    id: "kettle-woods",
    name: "Kettle Woods",
    propMix: { chevron: 1, pole: 0, rock: 1.2, tree: 1.7 },
  },
  lowtown: {
    id: "lowtown",
    name: "Lowtown",
    propMix: { chevron: 1.5, pole: 1.5, rock: 0.25, tree: 0.3 },
  },
  "salt-coast": {
    id: "salt-coast",
    name: "Salt Coast",
    propMix: { chevron: 1, pole: 1, rock: 0.6, tree: 0.35 },
  },
  stonepeak: {
    id: "stonepeak",
    name: "Stonepeak",
    propMix: { chevron: 1, pole: 1, rock: 1, tree: 1 },
  },
} as const satisfies Record<RegionId, Region>;
