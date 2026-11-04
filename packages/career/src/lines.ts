import { bikeDefinitions } from "@racer/content/bikes";
import { celebrityRiders } from "@racer/content/celebrities";
import { ordinaryRiders } from "@racer/content/riders";
import { byId } from "@racer/content/rows";
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

export const rivalLines: Readonly<Record<OrdinaryRivalId, RivalLines>> = byId(
  ordinaryRiders,
  ({ lines }) => lines
);

export const celebrityBios: Readonly<Record<CelebrityRivalId, string>> = byId(
  celebrityRiders,
  ({ bio }) => bio
);

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

export const bikePitches: Readonly<Record<BikeId, string>> = byId(
  bikeDefinitions,
  ({ shop }) => shop.pitch
);

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
