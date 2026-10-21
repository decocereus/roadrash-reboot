import { finaleOpen } from "./field.ts";
import type { CareerState, EndingId, EnvelopeFlag } from "./state.ts";
import { ENVELOPE_LEVEL, ENVELOPE_PAYMENT } from "./tables.ts";
import type { Level } from "./tables.ts";

export interface StoryChapter {
  readonly name: string;
  readonly note: string;
}

export const chapters = {
  1: {
    name: "New Meat",
    note: 'You roll into the Lowside car park on a Halden Wren with $1,500 and no reputation. Vic pins a Polaroid of you to the board under "NEW MEAT" and tells you the deal: top three on all five roads and you move up. Juno Kade is at the bar and does not look up. Moose introduces himself and apologises in advance. Texts arrive from numbers you never gave out ("Dee: are you the one with the red bike. you\'re in my lane"). When you qualify the last road, Vic moves your Polaroid up a row and writes "KID CAN RIDE" under it. Juno looks up.',
  },
  2: {
    name: "The Envelope",
    note: 'Tristan\'s sponsor wants a win on his home road, and Vic wants the sponsor. There is an envelope on the corkboard with your name on it and $1,500 inside; the note says "Breakwater Run. Behind the boy. V." Taking it is optional and is the only branch in the story. If you take it and beat Tristan anyway, Vic takes back $2,000 and pins a photo of your bike with a red X on it. If you leave it, the envelope is gone the next morning and Vic is very pleasant to you, which is worse. Juno races for the first time and says nothing to you at all.',
  },
  3: {
    name: "Dee's Tip",
    note: 'Dee wins a race on her home road and Vic pays her half, with a "processing fee" for the rest. She sits at your table and stops pretending to dislike you. From now on, before each race, she texts where the first roadblock will be ("cop van at 2.15 on slag row. same as always. vic knows. vic ALWAYS knows"), and she does not attack you on the road. Police roadblocks start this level, and the board fills up with tickets from riders who did not get a text.',
  },
  4: {
    name: "The Badge",
    note: "Lyle, drunk and furious, tells you what he was really fired for: he wrote up Sergeant Pike for taking money from Vic, and the report vanished. Now the cops seem to know which riders Vic likes, and you are not one of them. Coach Dale tries to sell you tape seven. Someone writes your name in marker over the top of Juno's spot on the board; Juno crosses it out, then, after you beat her once, leaves it there. She says your name for the first time.",
  },
  5: {
    name: "The Long Ridge",
    note: "The last race of the season is Ridge Road at full length, 13.15 km, and it opens only when you have qualified the other four roads. It can be attempted as often as it takes: only a top-three finish ends the season. Juno rides it at aggression 0.9 for this one race, which under her retaliation rule means she will not start a fight and will finish one. The finish is no longer the cable-car station but the summit mast, and Vic is waiting there with a cash box and two friends.",
  },
} as const satisfies Record<Level, StoryChapter>;

export const endings = {
  "bought-crown": {
    name: "Bought Crown",
    note: "You win the Long Ridge but took the envelope at level 2. Vic hands you the purse and a contract: next season you ride for him. Your Polaroid goes at the top of the board, pinned through Vic's business card. Juno does not buy a round. This is the hook for a second season.",
  },
  "clean-crown": {
    name: "Clean Crown",
    note: "You win the Long Ridge and never took the envelope. Sergeant Pike, who has read the room, busts Vic in the Lowside car park instead of you. Deputy Haverty asks Vic to hold still for a photo. Your Polaroid goes at the top of the board, Juno buys the first round, and Dee delivers a pizza nobody ordered.",
  },
  "runner-up": {
    name: "Runner-up",
    note: 'You qualify the Long Ridge but do not win it. Juno keeps the crown, sits down next to you, and says, "Next year." The board shows her Polaroid on top and yours right under it, and that is the first time anyone has put a picture there.',
  },
} as const satisfies Record<EndingId, StoryChapter>;

export const ENVELOPE_NOTE = "Breakwater Run. Behind the boy. V.";
export const LEFT_RACE_NOTE =
  "You left a race. The bike didn't make it home. V.";

export interface StoryBeat {
  readonly level: Level;
  readonly chapter: StoryChapter;
  readonly envelope: EnvelopeFlag;
  readonly envelopeOpen: boolean;
  readonly deeAlly: boolean;
  readonly finaleOpen: boolean;
  readonly leftRaceNote: string | null;
  readonly ending: EndingId | null;
  readonly endingChapter: StoryChapter | null;
}

const envelopeOpen = (career: CareerState): boolean =>
  career.level === ENVELOPE_LEVEL &&
  career.story.envelope === "offered" &&
  !career.gameOver &&
  career.activeRace === null;

export const storyBeat = (career: CareerState): StoryBeat => ({
  chapter: chapters[career.level],
  deeAlly: career.story.deeAlly,
  ending: career.story.ending,
  endingChapter: career.story.ending ? endings[career.story.ending] : null,
  envelope: career.story.envelope,
  envelopeOpen: envelopeOpen(career),
  finaleOpen: finaleOpen(career),
  leftRaceNote: career.story.leftRace ? LEFT_RACE_NOTE : null,
  level: career.level,
});

export const acceptEnvelope = (career: CareerState): CareerState =>
  envelopeOpen(career)
    ? {
        ...career,
        cash: career.cash + ENVELOPE_PAYMENT,
        story: { ...career.story, envelope: "taken" },
      }
    : career;

export const refuseEnvelope = (career: CareerState): CareerState =>
  envelopeOpen(career)
    ? { ...career, story: { ...career.story, envelope: "refused" } }
    : career;
