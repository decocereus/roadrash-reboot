import type { BillConsequence } from "@racer/career/settle";
import { chapterOf } from "@racer/career/story";
import type { Tier } from "@racer/career/tables";
import { celebrityRiders } from "@racer/content/celebrities";
import { ordinaryRiders } from "@racer/content/riders";
import { byId } from "@racer/content/rows";
import type { RivalId } from "@racer/sim/cast";

export const WORDMARK = "Rushline";
export const TAGLINE = "Race. Fight. Pay for it.";
export const CONTROLS =
  "Arrows to steer, Space to punch, Shift to kick, E to get back on";

export const tierName = (tier: Tier): string => chapterOf(tier).name;

export const IN_DEBT_AT_THE_GARAGE =
  "The garage doesn't sell to people who owe Vic money. You can still sell.";
export const BOUGHT = "It's yours. Try not to bend it.";
export const SOLD = "Sold. You ride the Gutter Pup now.";
export const NOBODY_WANTS_THE_PUP = "Nobody wants the Gutter Pup.";

export const BROKE_CARD =
  "You owe more than a Gutter Pup is worth, which is saying something. We're done.";

const riders = [...ordinaryRiders, ...celebrityRiders];

export const shortNames: Readonly<Record<RivalId, string>> = byId(
  riders,
  ({ shortName }) => shortName
);

export const saveErrors = {
  inconsistent: "The save contradicts itself",
  invalid: "The save holds a value the game does not have",
  notJson: "The save is not a save file",
  wrongVersion: "The save is from another version of the game",
} as const;

export const SAVE_UNREAD =
  "The browser would not let the game read your save. Nothing was changed.";

export const CAREER_ELSEWHERE =
  "Your career is open in another tab. Close that tab, then try again.";

export const billWarning = (
  consequence: BillConsequence,
  bill: string,
  bike: string
): string | undefined => {
  if (consequence === "gameOver") {
    return `This ${bill} ends the career.`;
  }
  return consequence === "repossession"
    ? `This ${bill} takes the ${bike}.`
    : undefined;
};
