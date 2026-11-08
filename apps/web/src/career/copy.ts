import type { BillConsequence } from "@racer/career/settle";
import { chapterOf } from "@racer/career/story";
import { prizeFor } from "@racer/career/tables";
import type { Tier, RoadId } from "@racer/career/tables";
import { celebrityRiders } from "@racer/content/celebrities";
import { ordinaryRiders } from "@racer/content/riders";
import { byId } from "@racer/content/rows";
import type { RivalId } from "@racer/sim/cast";
import type { BikeClass } from "@racer/sim/state";

export const WORDMARK = "Rushline";
export const TAGLINE = "Race. Fight. Pay for it.";
export const CONTROLS =
  "Arrows to steer, Space to punch, Shift to kick, E to get back on";

export const introCards = [
  "You've got $1,500, a Halden Wren, and nobody knows your name.",
  "Top three on every road and you move up.",
  "Don't go broke.",
] as const;

export const tierName = (tier: Tier): string => chapterOf(tier).name;

export const roadDescriptions = {
  "breakwater-run":
    "Harbour to pier along the seawall. One long bend by the water, one tunnel, and a kink at the tunnel mouth that nobody sees coming twice.",
  "ridge-road":
    "The home road. Ten bends and two crests on the way up to the lookout.",
  "slag-row":
    "Two lanes and a lot of nothing, then a right angle. Rail tracks, an underpass, a drawbridge, and more traffic than anywhere else.",
} as const satisfies Record<RoadId, string>;

export const classNames = {
  featherweight: "Featherweight",
  heavyweight: "Heavyweight",
  middleweight: "Middleweight",
} as const satisfies Record<BikeClass, string>;

export const classNotes = {
  featherweight:
    "Light and quick to turn. Bends barely move them. They run out of speed early.",
  heavyweight:
    "Fastest in a straight line. Bends push them wide and they are slow to answer.",
  middleweight:
    "The all-rounders. Fast enough that some bends need the brakes.",
} as const satisfies Record<BikeClass, string>;

export const bikeClasses: readonly BikeClass[] = [
  "featherweight",
  "middleweight",
  "heavyweight",
];

export const IN_DEBT_AT_THE_GARAGE =
  "The garage doesn't sell to people who owe Vic money. You can still sell.";
export const BOUGHT = "It's yours. Try not to bend it.";
export const SOLD = "Sold. You ride the Gutter Pup now.";
export const NOBODY_WANTS_THE_PUP = "Nobody wants the Gutter Pup.";

const magsLines = [
  "I can fix it. I can't fix how you ride it.",
  "I've seen worse. On fire, mostly.",
  "Sweetheart, the front wheel was in a different lane.",
] as const;

export const magsLine = (raceId: number): string =>
  magsLines[Math.abs(raceId) % magsLines.length] ?? magsLines[0];

const vicCards = {
  1: "Top three on every road and you move up. Don't go broke.",
  2: "Bigger purses. The garage got a delivery. The new cops are quicker.",
  3: "Everyone's armed now. Try to keep up. One more round. The Ridge is last. She'll be waiting.",
} as const satisfies Record<Tier, string>;

export const vicCard = (tier: Tier): string => vicCards[tier];

export const firstPrize = (tier: Tier): number => prizeFor(tier, 1);

export const BROKE_CARD =
  "You owe more than a Gutter Pup is worth, which is saying something. We're done.";

export const ENVELOPE_INSIDE = "$1,500 inside.";

const riders = [...ordinaryRiders, ...celebrityRiders];

export const shortNames: Readonly<Record<RivalId, string>> = byId(
  riders,
  ({ shortName }) => shortName
);

interface Pronouns {
  readonly their: string;
  readonly them: string;
}

const pronounForms = {
  hers: { their: "her", them: "her" },
  his: { their: "his", them: "him" },
} as const satisfies Record<string, Pronouns>;

export const pronouns: Readonly<Record<RivalId, Pronouns>> = byId(
  riders,
  (row) => pronounForms[row.pronouns]
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
