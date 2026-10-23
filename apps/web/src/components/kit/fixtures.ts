import type { SceneRegion } from "@racer/ui/components/region-scene";
import type { RiderColours } from "@racer/ui/components/rider-card";

export const roads: readonly {
  readonly region: SceneRegion;
  readonly road: string;
  readonly regionName: string;
  readonly tilt: number;
  readonly qualified: string;
  readonly swatches: readonly string[];
}[] = [
  {
    qualified: "2nd",
    region: "salt-coast",
    regionName: "Salt Coast",
    road: "Breakwater Run",
    swatches: [
      "bg-salt-coast-zenith",
      "bg-salt-coast-horizon",
      "bg-salt-coast-far",
      "bg-salt-coast-ground",
      "bg-salt-coast-verge",
      "bg-salt-coast-asphalt",
    ],
    tilt: -3,
  },
  {
    qualified: "",
    region: "cinder-flats",
    regionName: "Cinder Flats",
    road: "Cinder Wash",
    swatches: [
      "bg-cinder-flats-zenith",
      "bg-cinder-flats-horizon",
      "bg-cinder-flats-far",
      "bg-cinder-flats-ground",
      "bg-cinder-flats-verge",
      "bg-cinder-flats-asphalt",
    ],
    tilt: 2,
  },
  {
    qualified: "1st",
    region: "kettle-woods",
    regionName: "Kettle Woods",
    road: "Hollow Pine Road",
    swatches: [
      "bg-kettle-woods-zenith",
      "bg-kettle-woods-horizon",
      "bg-kettle-woods-far",
      "bg-kettle-woods-ground",
      "bg-kettle-woods-verge",
      "bg-kettle-woods-asphalt",
    ],
    tilt: -1.5,
  },
  {
    qualified: "",
    region: "lowtown",
    regionName: "Lowtown",
    road: "Slag Row",
    swatches: [
      "bg-lowtown-zenith",
      "bg-lowtown-horizon",
      "bg-lowtown-far",
      "bg-lowtown-ground",
      "bg-lowtown-verge",
      "bg-lowtown-asphalt",
    ],
    tilt: 3,
  },
  {
    qualified: "",
    region: "stonepeak",
    regionName: "Stonepeak",
    road: "Ridge Road",
    swatches: [
      "bg-stonepeak-zenith",
      "bg-stonepeak-horizon",
      "bg-stonepeak-far",
      "bg-stonepeak-ground",
      "bg-stonepeak-verge",
      "bg-stonepeak-asphalt",
    ],
    tilt: -2,
  },
];

export const moose: RiderColours = {
  bike: "#C2521F",
  helmet: "#2B2E33",
  jacket: "#5B4632",
};
