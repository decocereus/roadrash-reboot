import { siteSeed, unitOf } from "@racer/track/random";
import type { StallFootprint, StallVariant } from "@racer/track/stalls";
import type { Track } from "@racer/track/track";

import type { CrowdMode } from "./walker-clips.ts";

export interface CrowdMember {
  readonly id: string;
  readonly mode: CrowdMode;
  readonly s: number;
  readonly x: number;
  readonly turn: number;
}

interface Spot {
  readonly fromFront: number;
  readonly along: number;
}

const OCCUPIED_EVERY = 3;
const QUARTER = Math.PI / 2;
const CUSTOMER_GAP = 0.5;
const STOOD_CLEAR_OF_ENDS = 0.7;
const TURN_SPREAD = 0.5;
const ALONG_SALT = 104_729;
const TURN_SALT = 15_485_863;

const rosters = [["serve", "haggle"], ["browse"], ["serve"]] as const;

const behindCounter = {
  fabric: { along: 0, fromFront: 2.05 },
  food_cart: { along: 0.5, fromFront: 2 },
  fruit: { along: 0, fromFront: 2.35 },
  neon: { along: -0.9, fromFront: 1.4 },
  noodle: { along: 0, fromFront: 1.5 },
  parts: { along: 0, fromFront: 1.9 },
} as const satisfies Record<StallVariant, Spot>;

const spotOf = (stall: StallFootprint, mode: CrowdMode, id: string): Spot => {
  switch (mode) {
    case "serve": {
      return behindCounter[stall.variant];
    }
    case "browse":
    case "haggle": {
      const room = stall.halfLength - STOOD_CLEAR_OF_ENDS;
      return {
        along: (unitOf(siteSeed(ALONG_SALT, id)) * 2 - 1) * room,
        fromFront: -CUSTOMER_GAP,
      };
    }
    default: {
      return mode satisfies never;
    }
  }
};

const facingOf = (side: number, mode: CrowdMode): number => {
  switch (mode) {
    case "serve": {
      return -side;
    }
    case "browse":
    case "haggle": {
      return side;
    }
    default: {
      return mode satisfies never;
    }
  }
};

const memberAt = (
  stall: StallFootprint,
  mode: CrowdMode,
  place: number
): CrowdMember => {
  const id = `${stall.id}/${place}`;
  const side = Math.sign(stall.x);
  const { along, fromFront } = spotOf(stall, mode, id);
  const lean = (unitOf(siteSeed(TURN_SALT, id)) - 0.5) * TURN_SPREAD;
  return {
    id,
    mode,
    s: stall.s + side * along,
    turn: facingOf(side, mode) * QUARTER + lean,
    x: stall.x - side * (stall.halfWidth - fromFront),
  };
};

export const crowdAt = ({ stalls }: Pick<Track, "stalls">): CrowdMember[] =>
  stalls.flatMap((stall, index) => {
    if (index % OCCUPIED_EVERY !== 0) {
      return [];
    }
    const roster = rosters[(index / OCCUPIED_EVERY) % rosters.length] ?? [];
    return roster.map((mode, place) => memberAt(stall, mode, place));
  });
