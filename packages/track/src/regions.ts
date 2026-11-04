export type RegionId =
  | "casa-de-campo"
  | "madrid-centro"
  | "salt-coast"
  | "lowtown"
  | "stonepeak";

interface PropMix {
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

interface Footfall {
  readonly unmarked: number;
  readonly jaywalk: number;
}

export interface Region {
  readonly id: RegionId;
  readonly name: string;
  readonly propMix: PropMix;
  readonly hazardMix: HazardMix;
  readonly footfall: Footfall;
}

const NO_FOOTFALL = { jaywalk: 0, unmarked: 0 } as const satisfies Footfall;
const CITY_FOOTFALL = {
  jaywalk: 1.5,
  unmarked: 1,
} as const satisfies Footfall;

export const regions = {
  "casa-de-campo": {
    footfall: NO_FOOTFALL,
    hazardMix: { oil: 0.6, pothole: 0.2, rock: 0.2 },
    id: "casa-de-campo",
    name: "Casa de Campo",
    propMix: { chevron: 1, pole: 0, rock: 0, tree: 0 },
  },
  lowtown: {
    footfall: CITY_FOOTFALL,
    hazardMix: { oil: 0.6, pothole: 0.2, rock: 0.2 },
    id: "lowtown",
    name: "Lowtown",
    propMix: { chevron: 1.5, pole: 1.5, rock: 0.25, tree: 0.3 },
  },
  "madrid-centro": {
    footfall: CITY_FOOTFALL,
    hazardMix: { oil: 0.6, pothole: 0.2, rock: 0.2 },
    id: "madrid-centro",
    name: "Madrid centro",
    propMix: { chevron: 1, pole: 1, rock: 0, tree: 0 },
  },
  "salt-coast": {
    footfall: CITY_FOOTFALL,
    hazardMix: { oil: 0.65, pothole: 0.2, rock: 0.15 },
    id: "salt-coast",
    name: "Salt Coast",
    propMix: { chevron: 1, pole: 1, rock: 0.6, tree: 0.35 },
  },
  stonepeak: {
    footfall: NO_FOOTFALL,
    hazardMix: { oil: 0.6, pothole: 0.15, rock: 0.25 },
    id: "stonepeak",
    name: "Stonepeak",
    propMix: { chevron: 1, pole: 1, rock: 1, tree: 1 },
  },
} as const satisfies Record<RegionId, Region>;
