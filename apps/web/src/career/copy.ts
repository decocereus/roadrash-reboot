import type { BillConsequence } from "@racer/career/settle";
import { chapters } from "@racer/career/story";
import { prizeFor } from "@racer/career/tables";
import type { Level, RoadId } from "@racer/career/tables";
import type { RivalId } from "@racer/sim/cast";
import type { BikeClass } from "@racer/sim/state";

export const WORDMARK = "Rushline";
export const TAGLINE = "Race. Fight. Pay for it.";
export const CONTROLS = "Arrows to steer · Space to punch · Shift to kick";

export const introCards = [
  "You've got $1,500, a Halden Wren, and nobody knows your name.",
  "Top three on all five roads and you move up.",
  "Don't go broke.",
] as const;

export const levelName = (level: Level): string => chapters[level].name;

export const roadDescriptions = {
  "breakwater-run":
    "Harbour to pier along the seawall. One long bend by the water, one tunnel, and a kink at the tunnel mouth that nobody sees coming twice.",
  "cinder-wash":
    "Dead straight across the dry lake, three washes, the last of which throws you in the air, then a hairpin up the mesa at the end of the fastest straight in the game.",
  "hollow-pine-road":
    "Narrow, dark, and never straight for long. The trees are close and the crests hide the bends.",
  "ridge-road":
    "The home road. Ten bends and two crests on the way up to the lookout.",
  "slag-row":
    "Two lanes and a lot of nothing, then a right angle. Rail tracks, an underpass, a drawbridge, and more traffic than anywhere else.",
} as const satisfies Record<RoadId, string>;

export const REPEAT_RUN =
  "Already qualified. A repeat run pays half for the top 3 and nothing below. Fines and repairs are full price.";
export const FINALE_LOCK = "The Long Ridge · Qualify the other four first";

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

export const OFFENCE = "Racing on a public road. Also, falling off on one.";

const vicCards = {
  1: "Top three on all five roads and you move up. Don't go broke. V.",
  2: "Longer roads. Two cops. Bigger purses. The garage got a delivery. V.",
  3: "Longer again. Three cops, and the new ones are quicker. V.",
  4: "Four cops. Everyone's armed now. Try to keep up. V.",
  5: "Five roads left. The Ridge is last. She'll be waiting. V.",
} as const satisfies Record<Level, string>;

const SIGNATURE = " V.";

export const vicCard = (level: Level): string =>
  vicCards[level].slice(0, -SIGNATURE.length);

export const firstPrize = (level: Level): number => prizeFor(level, 1);

export const BROKE_CARD =
  "You owe more than a Gutter Pup is worth, which is saying something. We're done.";

export const ENVELOPE_INSIDE = "$1,500 inside.";

export const shortNames = {
  "agnes-mulcahy": "Agnes",
  "benny-okafor": "Benny",
  "coach-dale-hutto": "Coach",
  "dee-santangelo": "Dee",
  "felix-aurand": "Felix",
  "gus-abernathy": "Gus",
  "hollis-thorne": "Hollis",
  "ines-marchetti": "Ines",
  "juno-kade": "Juno",
  "lyle-gorski": "Lyle",
  "mags-dunleavy": "Mags",
  "moose-kowalczyk": "Moose",
  "orrin-blackwell": "Orrin",
  "ruth-ann-bixby": "Ruth Ann",
  "tristan-lux": "Tristan",
  "wanda-pruitt": "Wanda",
} as const satisfies Record<RivalId, string>;

interface Pronouns {
  readonly their: string;
  readonly them: string;
}

const hers: Pronouns = { their: "her", them: "her" };
const his: Pronouns = { their: "his", them: "him" };

export const pronouns = {
  "agnes-mulcahy": hers,
  "benny-okafor": his,
  "coach-dale-hutto": his,
  "dee-santangelo": hers,
  "felix-aurand": his,
  "gus-abernathy": his,
  "hollis-thorne": his,
  "ines-marchetti": hers,
  "juno-kade": hers,
  "lyle-gorski": his,
  "mags-dunleavy": hers,
  "moose-kowalczyk": his,
  "orrin-blackwell": his,
  "ruth-ann-bixby": hers,
  "tristan-lux": his,
  "wanda-pruitt": hers,
} as const satisfies Record<RivalId, Pronouns>;

export const saveErrors = {
  inconsistent: "The save contradicts itself",
  invalid: "The save holds a value the game does not have",
  notJson: "The save is not a save file",
  wrongVersion: "The save is from another version of the game",
} as const;

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
