import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import { createShading } from "../src/game/cel.ts";
import { lookOf } from "../src/game/looks.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { RiderFigure, Stance } from "../src/game/rider-figure.ts";
import { artFile } from "./art-files.ts";

const CONTACT = 0.005;
const FREE = 0.2;
const PALM = new THREE.Vector3(0, 0.055, 0);
const SETTLED = 1;
const FRAME = 1 / 60;
const CORNER_FRAMES = 240;
const SEATED_FRAMES = 30;

const shading = createShading(lookOf("salt-coast"));

const contacts = ["hand_l", "hand_r", "foot_l", "foot_r"] as const;
type Contact = (typeof contacts)[number];

interface Held {
  readonly name: string;
  readonly stance: Partial<Stance>;
  readonly free: readonly Contact[];
}

const held: readonly Held[] = [
  { free: [], name: "tuck", stance: { tuck: 1 } },
  { free: [], name: "lean left", stance: { lean: -1 } },
  { free: [], name: "lean right", stance: { lean: 1 } },
  { free: [], name: "tucked lean left", stance: { lean: -1, tuck: 1 } },
  { free: [], name: "tucked lean right", stance: { lean: 1, tuck: 1 } },
  { free: [], name: "part tuck in a lean", stance: { lean: 0.5, tuck: 0.75 } },
  { free: [], name: "flinch", stance: { flinch: 1, flinchSide: -1 } },
  { free: [], name: "rise left", stance: { rise: 1, side: -1 } },
  { free: [], name: "rise right", stance: { rise: 1, side: 1 } },
  { free: [], name: "tucked half rise", stance: { rise: 0.5, tuck: 1 } },
  {
    free: ["foot_l"],
    name: "kick left",
    stance: { pose: "kick", reach: 1, rise: 1, side: -1 },
  },
  {
    free: ["foot_r"],
    name: "kick right",
    stance: { pose: "kick", reach: 1, rise: 1, side: 1 },
  },
  {
    free: ["hand_l"],
    name: "punch left",
    stance: { pose: "punch", reach: 1, side: -1 },
  },
  {
    free: ["hand_r"],
    name: "punch right",
    stance: { pose: "punch", reach: 1, side: 1 },
  },
  {
    free: ["hand_l"],
    name: "windup left",
    stance: { pose: "windup", reach: 1, side: -1 },
  },
  {
    free: ["hand_r"],
    name: "swing right",
    stance: { pose: "swing", reach: 1, side: 1 },
  },
];

const stanceOf = (stance: Partial<Stance>): Stance => ({
  flinch: 0,
  flinchSide: 1,
  lean: 0,
  pose: "seated",
  reach: 0,
  rise: 0,
  side: 1,
  time: 0,
  tuck: 0,
  weapon: "none",
  ...stance,
});

const figureOf = async (url: string): Promise<RiderFigure> => {
  const { value } = await assetParsers.rider(artFile(url), url);
  return createRiderFigure(value, shading, 0);
};

const placesOf = (figure: RiderFigure) => {
  figure.root.updateMatrixWorld(true);
  const placed = (contact: Contact) => {
    const bone = figure.root.getObjectByName(contact);
    if (!bone) {
      throw new Error(`The rider has no ${contact} bone.`);
    }
    return bone.localToWorld(
      contact.startsWith("hand") ? PALM.clone() : new THREE.Vector3()
    );
  };
  return {
    foot_l: placed("foot_l"),
    foot_r: placed("foot_r"),
    hand_l: placed("hand_l"),
    hand_r: placed("hand_r"),
  };
};

const tuckedCorner = Array.from(
  { length: CORNER_FRAMES },
  (_, frame): Partial<Stance> => {
    const lean = Math.sin(frame * FRAME * Math.PI * 1.3);
    return { lean, tuck: 1 - 0.25 * Math.abs(lean) };
  }
);

const kickLanding: readonly Partial<Stance>[] = [
  ...[1, 0.84, 0.64, 0.36].map((rise): Partial<Stance> => ({
    pose: "kick",
    rise,
    side: -1,
  })),
  ...Array.from({ length: SEATED_FRAMES }, () => ({})),
];

const riderUrls = [
  ...modelUrls.figures,
  ...Object.values(modelUrls.celebrities),
];

describe("planted hands and feet on every shipped rider", () => {
  it.each(riderUrls)(
    "%s keeps each planted palm on its grip and each foot on its peg",
    async (url) => {
      const figure = await figureOf(url);
      figure.animate(stanceOf({}), SETTLED);
      const grips = placesOf(figure);
      const misses: string[] = [];
      for (const { free, name, stance } of held) {
        figure.animate(stanceOf(stance), SETTLED);
        const places = placesOf(figure);
        for (const contact of contacts) {
          const off = places[contact].distanceTo(grips[contact]);
          const loose = free.includes(contact);
          if (loose ? off < FREE : off > CONTACT) {
            misses.push(`${name} ${contact} ${(off * 1000).toFixed(1)} mm`);
          }
        }
      }
      figure.dispose();
      expect(misses).toStrictEqual([]);
    }
  );

  it.each(
    riderUrls.flatMap((url) => [
      [url, "a tucked corner", tuckedCorner] as const,
      [url, "a kick dropping back to the seat", kickLanding] as const,
    ])
  )("%s keeps both palms on the grips through %s", async (url, _, frames) => {
    const figure = await figureOf(url);
    figure.animate(stanceOf({}), SETTLED);
    const grips = placesOf(figure);
    figure.animate(stanceOf(frames[0] ?? {}), SETTLED);
    let worst = 0;
    for (const frame of frames) {
      figure.animate(stanceOf(frame), FRAME);
      const places = placesOf(figure);
      worst = Math.max(
        worst,
        places.hand_l.distanceTo(grips.hand_l),
        places.hand_r.distanceTo(grips.hand_r)
      );
    }
    figure.dispose();
    expect(worst).toBeLessThan(CONTACT);
  });
});
