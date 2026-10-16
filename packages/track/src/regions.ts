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

export interface HazardMix {
  readonly oil: number;
  readonly rock: number;
  readonly pothole: number;
}

export interface Region {
  readonly id: RegionId;
  readonly name: string;
  readonly propMix: PropMix;
  readonly hazardMix: HazardMix;
}

export const regions = {
  "cinder-flats": {
    hazardMix: { oil: 0.15, pothole: 0.3, rock: 0.55 },
    id: "cinder-flats",
    name: "Cinder Flats",
    propMix: { chevron: 1, pole: 0.5, rock: 0.8, tree: 0.12 },
  },
  "kettle-woods": {
    hazardMix: { oil: 0.15, pothole: 0.35, rock: 0.5 },
    id: "kettle-woods",
    name: "Kettle Woods",
    propMix: { chevron: 1, pole: 0, rock: 1.2, tree: 1.7 },
  },
  lowtown: {
    hazardMix: { oil: 0.45, pothole: 0.4, rock: 0.15 },
    id: "lowtown",
    name: "Lowtown",
    propMix: { chevron: 1.5, pole: 1.5, rock: 0.25, tree: 0.3 },
  },
  "salt-coast": {
    hazardMix: { oil: 0.45, pothole: 0.3, rock: 0.25 },
    id: "salt-coast",
    name: "Salt Coast",
    propMix: { chevron: 1, pole: 1, rock: 0.6, tree: 0.35 },
  },
  stonepeak: {
    hazardMix: { oil: 0.2, pothole: 0.3, rock: 0.5 },
    id: "stonepeak",
    name: "Stonepeak",
    propMix: { chevron: 1, pole: 1, rock: 1, tree: 1 },
  },
} as const satisfies Record<RegionId, Region>;
