import { riderPalette } from "@racer/sim/palette";

const HEX_DIGITS = 6;
const FALLBACK = "#9a9aa3";

const cssColour = (colour: number): string =>
  `#${colour.toString(16).padStart(HEX_DIGITS, "0")}`;

export const bikeColour = (paint: number): string => {
  const colours = riderPalette[paint];
  return colours ? cssColour(colours.bike) : FALLBACK;
};
