import { riderPalette } from "@racer/sim/palette";
import type { RiderProfile } from "@racer/sim/state";
import type { RiderColours } from "@racer/ui/components/rider-card";

const HEX_DIGITS = 6;
const FALLBACK = "#9a9aa3";

const cssColour = (colour: number): string =>
  `#${colour.toString(16).padStart(HEX_DIGITS, "0")}`;

export const bikeColour = (paint: number): string => {
  const colours = riderPalette[paint];
  return colours ? cssColour(colours.bike) : FALLBACK;
};

export const riderColours = (
  profile: Pick<RiderProfile, "paint" | "jacket">
): RiderColours => {
  const jacket = riderPalette[profile.jacket];
  return {
    bike: bikeColour(profile.paint),
    helmet: jacket ? cssColour(jacket.helmet) : FALLBACK,
    jacket: jacket ? cssColour(jacket.jacket) : FALLBACK,
  };
};
