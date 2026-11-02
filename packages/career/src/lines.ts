import type { BikeId } from "@racer/sim/bikes";
import { isCelebrity } from "@racer/sim/cast";
import type {
  CelebrityRivalId,
  OfficerId,
  OrdinaryRivalId,
  RivalId,
} from "@racer/sim/cast";

import type { CareerRaceSetup } from "./field.ts";
import { holdsItAgainstPlayer, memoryStrength } from "./memory.ts";
import type { RaceOutcome } from "./outcome.ts";
import type { CareerState } from "./state.ts";

export interface RivalLines {
  readonly taunt: string;
  readonly grudgeTaunt: string;
  readonly beatYou: string;
  readonly youBeatThem: string;
}

export const rivalLines = {
  "agnes-mulcahy": {
    beatYou:
      "Blessed are the meek, dear. Meek enough to brake for the corners.",
    grudgeTaunt:
      "You struck a nun last time. I've forgiven you. The roof fund hasn't.",
    taunt: "I'll pray for you. From ahead. The reception's better up there.",
    youBeatThem: "Well done. Put something in the tin on your way out.",
  },
  "benny-okafor": {
    beatYou: "That was a duet. You sang backup.",
    grudgeTaunt:
      "You hit me last time, mid-chorus. Nobody hits Benny mid-chorus.",
    taunt:
      "I'll be singing the whole way. You'll know where I am. You won't catch up.",
    youBeatThem: "Fine. Encore next week. Bring a bike this time.",
  },
  "coach-dale-hutto": {
    beatYou: "Winners never quit, and you, my friend, should quit.",
    grudgeTaunt:
      "You knocked me down last time. I've reframed it as a gift. Today I give it back.",
    taunt:
      "Visualise success. Now visualise this cue in your visor. That's growth.",
    youBeatThem:
      "Failure is just success that hasn't been invoiced yet. Tape six, side B.",
  },
  "dee-santangelo": {
    beatYou: "Thirty minutes or less. You took thirty-one.",
    grudgeTaunt:
      "Last race cost me a tip. You owe me four dollars and an apology.",
    taunt: "I've got a large pepperoni going cold at the finish. Move.",
    youBeatThem:
      "Fine. You win. I'm still getting a one-star review because of you.",
  },
  "felix-aurand": {
    beatYou: "Floss, ride less, and see me in six months.",
    grudgeTaunt:
      "You chipped something of mine last time. I don't do my own work.",
    taunt: "Open wide. Not your mouth. The gap. I'm coming through it.",
    youBeatThem: "Congratulations. Here's my card. You'll need it eventually.",
  },
  "gus-abernathy": {
    beatYou: "Slow and steady. Mostly slow. But steady.",
    grudgeTaunt: "You ran my sign last time, kid. Nobody runs my sign.",
    taunt: "Forty-one years I held this sign. Today I finally get to use it.",
    youBeatThem:
      "Back in my day the road was shorter. And I was faster. And it was uphill.",
  },
  "hollis-thorne": {
    beatYou: "You're fine. You're all fine. I checked, from the front.",
    grudgeTaunt:
      "You put me over the edge last time. I had to rescue myself. There's paperwork.",
    taunt:
      "If you go off at the Saddle, stay with the bike. Makes you easier to find.",
    youBeatThem: "Good ride. Hydrate. I mean it, hydrate.",
  },
  "ines-marchetti": {
    beatYou:
      "Something old, something new, something borrowed, something beat you.",
    grudgeTaunt:
      "You knocked me down last time. Kevin also knocked me down. Emotionally.",
    taunt:
      "I was left at the altar by a man named Kevin. You look like a Kevin.",
    youBeatThem: "Fine. Throw the bouquet. Throw it at your own face.",
  },
  "juno-kade": {
    beatYou: "Good effort. I mean that the way people say it to children.",
    grudgeTaunt:
      "You touched me last time. I wrote it down. I don't write things down.",
    taunt: "I counted everyone on this grid. You came out as a maybe.",
    youBeatThem:
      "Enjoy it. Frame something. I'll be back to normal by Thursday.",
  },
  "lyle-gorski": {
    beatYou: "Let the record show the suspect finished behind me. Case closed.",
    grudgeTaunt:
      "I've opened a file on you. It's thick. It's mostly drawings of you crying.",
    taunt: "Rider, I'm going to need you to step away from first place.",
    youBeatThem:
      "This doesn't go in the report. There is no report. I'm not a deputy anymore.",
  },
  "mags-dunleavy": {
    beatYou:
      "Bring that bike by the yard. I'll give you forty bucks for the seat.",
    grudgeTaunt:
      "You put me in the dirt last time, sweetheart. I've buried better in the scrap pile.",
    taunt:
      "I built my bike out of three dead ones. I'll build the next one out of yours.",
    youBeatThem:
      "Not bad. Your clutch sounds like a goose with a cough, though.",
  },
  "moose-kowalczyk": {
    beatYou: "Good race. Ice your face. Twenty minutes on, twenty off.",
    grudgeTaunt:
      "Last time you made me fall down. I've been thinking about it in the bath.",
    taunt:
      "Hello. I'm going to hit you with this club. I wanted to say hello first.",
    youBeatThem: "You were very fast. I'll be faster after a sandwich.",
  },
  "orrin-blackwell": {
    beatYou:
      "And that, subscribers, is how you survive a race. Like and remember.",
    grudgeTaunt:
      "You put me in the dirt last time. I got footage. It did numbers.",
    taunt:
      "Rule one of survival: never let the new kid finish ahead of you. I made that up just now.",
    youBeatThem:
      "The wild is unpredictable. So are you, apparently. Cut that bit.",
  },
  "ruth-ann-bixby": {
    beatYou: "Rode you like a fence line. Straight, then done.",
    grudgeTaunt: "You kicked me last time. Mules remember. So do I.",
    taunt: "I've seen heifers take a corner cleaner than you.",
    youBeatThem: "Well. Even a blind sow finds an acorn.",
  },
  "tristan-lux": {
    beatYou: "GG. Chat, do not rewatch turn four, I looked weird.",
    grudgeTaunt:
      "Chat is clipping what you did last race. You're going viral, and not the fun way.",
    taunt: "Chat says you look like a substitute teacher. Chat's being nice.",
    youBeatThem:
      "Chat, that was a sponsored loss. Use code CRASH for ten percent off.",
  },
  "wanda-pruitt": {
    beatYou: "As predicted. Back to you in the studio.",
    grudgeTaunt:
      "Last week I predicted you'd behave. I'm correcting that on air tonight.",
    taunt: "Today's forecast: you, behind me, with a chance of gravel.",
    youBeatThem: "An unexpected front. I'll be issuing an apology at six.",
  },
} as const satisfies Record<OrdinaryRivalId, RivalLines>;

export const celebrityBios = {
  "captain-penaldo":
    "The world's most beloved superhero, by a popular vote of one. The smile stays on after the cameras stop, which is worse.",
  "elongated-muskrat":
    "Says the bike will ride itself next year. Said that in 2016 too.",
  "kylip-jetner":
    "Takes the jet to the start line, a 17-minute flight, and sells you the lip kit at the finish.",
  "ranwear-bling":
    "Races in a fuchsia jacket with sleeves that need their own lane, and calls this toned down.",
  "slam-altruman":
    "Started the team as a nonprofit for the good of all riders. Now needs seven trillion dollars for a faster bike.",
  "supreme-leader-mbosse":
    "Annexed the league's biggest club on a free transfer and has ruled by decree ever since.",
} as const satisfies Record<CelebrityRivalId, string>;

export const officerLines = {
  "dolores-pike": [
    "Pay at the window. The window is me.",
    "Nineteen years writing tickets. You're the first one I've enjoyed.",
    "Tell your friends you met me. You can tell them from the back seat.",
  ],
  "wendell-haverty": [
    "Okay, so, technically you're under arrest? Sorry. Is that okay?",
    "This is my first bust! Can you hold still? It's for my mom.",
    "I'm supposed to read you your rights, but I left them in my other pants.",
  ],
} as const satisfies Record<OfficerId, readonly string[]>;

export const bikePitches = {
  "brack-anvil-1100": "Straights are a formality. Bends are a negotiation.",
  "brack-stoker-800":
    "Tops out early, leaves the line like it was kicked. Built for riders who fall off a lot.",
  "gutter-pup-250":
    "Zip ties, spite, and a seat from a different bike. Too slow to fly off anything.",
  "halden-kite-500":
    "The Wren with more lungs. Still turns before you finish deciding to.",
  "halden-meridian-900":
    "The heavyweight that still listens to the handlebars.",
  "halden-wren-400":
    "Light, honest, and forgiving. Takes every level-1 bend on the Ridge flat and still loses to people who brake.",
  "ostra-nera-1000":
    "The fastest thing in the Lowside car park, and it knows it. Brake early or brake in the trees.",
  "ostra-sesta-600":
    "The bike everyone measures against. Fast enough to need the brakes, light enough to forgive you.",
  "ostra-sette-750":
    "More of everything the Sesta does, and a little less patience in the bends.",
} as const satisfies Record<BikeId, string>;

export interface RivalLine {
  readonly rival: RivalId;
  readonly text: string;
}

export const tauntFrom = (career: CareerState, rival: RivalId): RivalLine => {
  if (isCelebrity(rival)) {
    return { rival, text: celebrityBios[rival] };
  }
  const lines = rivalLines[rival];
  return {
    rival,
    text: holdsItAgainstPlayer(career.memory[rival])
      ? lines.grudgeTaunt
      : lines.taunt,
  };
};

export const preRaceLine = (
  career: CareerState,
  setup: CareerRaceSetup
): RivalLine | null => {
  const speakers = setup.field.filter((rival) => !isCelebrity(rival));
  const [speaker] = speakers.toSorted((left, right) => {
    const strength =
      memoryStrength(career.memory[right]) -
      memoryStrength(career.memory[left]);
    return strength === 0
      ? Math.abs(career.memory[right].aggressionBonus) -
          Math.abs(career.memory[left].aggressionBonus)
      : strength;
  });
  return speaker === undefined ? null : tauntFrom(career, speaker);
};

export const resultLine = (outcome: RaceOutcome): RivalLine | null => {
  const spot = outcome.placings.findIndex(
    (placing) => placing.racer === "player"
  );
  const neighbour = outcome.placings[spot === 0 ? 1 : spot - 1];
  if (
    spot === -1 ||
    !neighbour ||
    neighbour.racer === "player" ||
    isCelebrity(neighbour.racer)
  ) {
    return null;
  }
  const beaten =
    spot === 0 || neighbour.fate === "busted" || neighbour.fate === "wrecked";
  const lines = rivalLines[neighbour.racer];
  return {
    rival: neighbour.racer,
    text: beaten ? lines.youBeatThem : lines.beatYou,
  };
};

export const bustedLine = (officer: OfficerId, seed: number): string => {
  const lines = officerLines[officer];
  return lines[Math.abs(Math.trunc(seed)) % lines.length] ?? "";
};
