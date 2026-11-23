import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import { contactNames } from "../src/game/bike-fit.ts";
import type { BikeFit, ContactName } from "../src/game/bike-fit.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import type { BikeModelId } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { contactsOf } from "../src/game/figure-contacts.ts";
import type { Contacts } from "../src/game/figure-contacts.ts";
import { paletteOf } from "../src/game/figure-rig.ts";
import { lookOf } from "../src/game/looks.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { RiderFigure, Stance } from "../src/game/rider-figure.ts";
import { artFile } from "./art-files.ts";

const CONTACT = 0.005;
const FREE = 0.2;
const SETTLED = 1;
const FRAME = 1 / 60;
const CORNER_FRAMES = 240;
const KNEE_SETTLE_FRAMES = 60;
const KNEE_HOLD_FRAMES = 60;
const KNEE_STILL = 0.002;
const KNEE_OUT = 0.08;
const RIDING_SPEED = 30;
const WALKING_SPEED = 5;
const SEATED_FRAMES = 30;
const ELBOW_BEND = THREE.MathUtils.degToRad(20);

const shading = createShading(lookOf("salt-coast"));

type Contact = ContactName;

interface Held {
  readonly name: string;
  readonly stance: Partial<Stance>;
  readonly free: readonly Contact[];
}

const held: readonly Held[] = [
  { free: [], name: "tuck", stance: { tuck: 1 } },
  { free: [], name: "lean left", stance: { lean: -1, speed: RIDING_SPEED } },
  { free: [], name: "lean right", stance: { lean: 1, speed: RIDING_SPEED } },
  {
    free: [],
    name: "tucked lean left",
    stance: { lean: -1, speed: RIDING_SPEED, tuck: 1 },
  },
  {
    free: [],
    name: "tucked lean right",
    stance: { lean: 1, speed: RIDING_SPEED, tuck: 1 },
  },
  {
    free: [],
    name: "part tuck in a lean",
    stance: { lean: 0.5, speed: RIDING_SPEED, tuck: 0.75 },
  },
  {
    free: ["foot_l"],
    name: "slow turn left",
    stance: { lean: -0.4, speed: WALKING_SPEED },
  },
  {
    free: ["foot_r"],
    name: "slow turn right",
    stance: { lean: 0.4, speed: WALKING_SPEED },
  },
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
  speed: 0,
  time: 0,
  tuck: 0,
  weapon: "none",
  ...stance,
});

const fitOf = async (model: BikeModelId): Promise<BikeFit> => {
  const url = modelUrls.bikes[model];
  const { value } = await assetParsers.bike(artFile(url), url);
  return value.fit;
};

const bodyOf = (figure: RiderFigure): THREE.SkinnedMesh => {
  let body: THREE.SkinnedMesh | null = null;
  figure.root.traverse((node) => {
    if (body === null && node instanceof THREE.SkinnedMesh) {
      body = node;
    }
  });
  if (body === null) {
    throw new Error("The rider has no skinned body.");
  }
  return body;
};

const bike = new THREE.Object3D();

const mountedOf = async (url: string, fit: BikeFit) => {
  const { value } = await assetParsers.rider(artFile(url), url);
  const figure = createRiderFigure(value, shading, paletteOf(0));
  figure.mount(bike, fit, 0);
  figure.animate(stanceOf({}), SETTLED);
  figure.root.updateMatrixWorld(true);
  return { contacts: contactsOf(bodyOf(figure), figure.root), figure };
};

const placesOf = (figure: RiderFigure, contacts: Contacts) => {
  figure.root.updateMatrixWorld(true);
  const placed = (contact: Contact) => {
    const bone = figure.root.getObjectByName(contact);
    if (!bone) {
      throw new Error(`The rider has no ${contact} bone.`);
    }
    return bone.localToWorld(contacts[contact].clone());
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
    return { lean, speed: RIDING_SPEED, tuck: 1 - 0.25 * Math.abs(lean) };
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

const pairs = riderUrls.flatMap((url) =>
  bikeModelIds.map((model) => [url, model] as const)
);

describe("planted hands and feet on every shipped rider and bike", () => {
  it.each(pairs)(
    "%s on the %s keeps each planted palm on its grip and each sole on its peg",
    async (url, model) => {
      const fit = await fitOf(model);
      const { contacts, figure } = await mountedOf(url, fit);
      const misses: string[] = [];
      for (const { free, name, stance } of held) {
        figure.animate(stanceOf(stance), SETTLED);
        const places = placesOf(figure, contacts);
        for (const contact of contactNames) {
          const off = places[contact].distanceTo(fit[contact]);
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

  it.each(pairs)(
    "%s on the %s rides with both elbows bent",
    async (url, model) => {
      const { figure } = await mountedOf(url, await fitOf(model));
      const at = (name: string) => {
        const bone = figure.root.getObjectByName(name);
        if (!bone) {
          throw new Error(`The rider has no ${name} bone.`);
        }
        return bone.getWorldPosition(new THREE.Vector3());
      };
      const bends = (["l", "r"] as const).map((side) => {
        const elbow = at(`lowerarm_${side}`);
        return (
          Math.PI -
          at(`upperarm_${side}`)
            .sub(elbow)
            .angleTo(at(`hand_${side}`).sub(elbow))
        );
      });
      figure.dispose();
      expect(Math.min(...bends)).toBeGreaterThan(ELBOW_BEND);
    }
  );

  it.each(
    pairs.flatMap(([url, model]) => [
      [url, model, "a tucked corner", tuckedCorner] as const,
      [url, model, "a kick dropping back to the seat", kickLanding] as const,
    ])
  )(
    "%s on the %s keeps both palms on the grips through %s",
    async (url, model, _, frames) => {
      const fit = await fitOf(model);
      const { contacts, figure } = await mountedOf(url, fit);
      figure.animate(stanceOf(frames[0] ?? {}), SETTLED);
      let worst = 0;
      for (const frame of frames) {
        figure.animate(stanceOf(frame), FRAME);
        const places = placesOf(figure, contacts);
        worst = Math.max(
          worst,
          places.hand_l.distanceTo(fit.hand_l),
          places.hand_r.distanceTo(fit.hand_r)
        );
      }
      figure.dispose();
      expect(worst).toBeLessThan(CONTACT);
    }
  );

  it.each(
    pairs.flatMap(([url, model]) => [
      [url, model, "calf_l", -1] as const,
      [url, model, "calf_r", 1] as const,
    ])
  )(
    "%s on the %s swings %s out in a lean and holds it still",
    async (url, model, knee, lean) => {
      const { figure } = await mountedOf(url, await fitOf(model));
      const kneeAt = () => {
        figure.root.updateMatrixWorld(true);
        const bone = figure.root.getObjectByName(knee);
        if (!bone) {
          throw new Error(`The rider has no ${knee} bone.`);
        }
        return bone.getWorldPosition(new THREE.Vector3());
      };
      const seated = kneeAt();
      const stance = stanceOf({ lean, speed: RIDING_SPEED });
      for (let frame = 0; frame < KNEE_SETTLE_FRAMES; frame += 1) {
        figure.animate(stance, FRAME);
      }
      let last = kneeAt();
      let moved = 0;
      for (let frame = 0; frame < KNEE_HOLD_FRAMES; frame += 1) {
        figure.animate(stance, FRAME);
        const now = kneeAt();
        moved = Math.max(moved, now.distanceTo(last));
        last = now;
      }
      figure.dispose();
      expect(moved).toBeLessThan(KNEE_STILL);
      expect(lean * (last.x - seated.x)).toBeGreaterThan(KNEE_OUT);
    }
  );
});
