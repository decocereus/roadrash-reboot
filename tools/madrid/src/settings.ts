import type { RegionId } from "@racer/track/regions";
import type { StretchId } from "@racer/track/stretches";

import type { StretchSettings } from "./stretch.ts";

export interface StretchEntry {
  readonly id: StretchId;
  readonly name: string;
  readonly region: RegionId;
  readonly level: number;
  readonly seed: number;
  readonly trafficPerKilometre: number;
  readonly hazardsPerKilometre: number;
  readonly settings: StretchSettings;
}

export const stretchEntries: readonly StretchEntry[] = [
  {
    hazardsPerKilometre: 2,
    id: "madrid-hook",
    level: 1,
    name: "Casa de Campo hook",
    region: "casa-de-campo",
    seed: 0x4d_48_4b,
    settings: {
      cover: "grass",
      fromM: 3600,
      minRadiusM: 60,
      pieceLengthM: 25,
      places: [
        {
          fromM: 4030,
          minRadiusM: 35,
          name: "Embarcadero S-bend by the boathouse",
          toM: 4230,
        },
        {
          fromM: 4380,
          minRadiusM: 25,
          name: "Glorieta de los Patines",
          toM: 4620,
        },
      ],
      road: {
        laneWidth: 3.5,
        lanesEachWay: 1,
        leadInLength: 80,
        runUpM: 0,
        runoffLength: 200,
        shoulderWidth: 0.5,
        vergeWidth: 5,
      },
      sceneReachM: 180,
      toM: 4650,
    },
    trafficPerKilometre: 6,
  },
  {
    hazardsPerKilometre: 2,
    id: "madrid-gran-via",
    level: 1,
    name: "Alcalá into Gran Vía",
    region: "madrid-centro",
    seed: 0x4d_47_56,
    settings: {
      cover: "paving",
      fromM: 0,
      minRadiusM: 60,
      pieceLengthM: 25,
      places: [
        {
          fromM: 0,
          minRadiusM: 25,
          name: "Puerta de Alcalá roundabout",
          toM: 120,
        },
        {
          fromM: 2030,
          minRadiusM: 25,
          name: "Plaza de España",
          toM: 2130,
        },
      ],
      road: {
        laneWidth: 3.5,
        lanesEachWay: 2,
        leadInLength: 80,
        runUpM: 90,
        runoffLength: 200,
        shoulderWidth: 0.5,
        vergeWidth: 5,
      },
      sceneReachM: 90,
      toM: 2365.7,
    },
    trafficPerKilometre: 6,
  },
];
