import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createCast as createBarCast } from "../src/game/bar-cast.ts";
import type { BarSpeech } from "../src/game/bar-speech.ts";
import type { Tag, TagLayer } from "../src/game/bar-tags.ts";
import { createWalkers } from "../src/game/bar-walker.ts";
import { createShading } from "../src/game/cel.ts";
import { undressed } from "../src/game/figure-wardrobe.ts";
import { lookOf } from "../src/game/looks.ts";
import { presets } from "../src/game/presets.ts";
import { bindCast, createCast } from "../src/game/rider-views.ts";
import { createStage } from "../src/game/scene-lifecycle.ts";
import { stubCanvases } from "./canvas-stub.ts";
import { pinnedAssets } from "./pinned-assets.ts";
import { worstContact } from "./seated-contacts.ts";

const CONTACT = 0.005;
const SETTLED = 1;
const FRAMES = 3;
const SEED = 31;
const BUILD_TIMEOUT_MS = 60_000;
const BUILDS = 3;
const SIZE = { height: 600, width: 800 };

const shading = createShading(lookOf("salt-coast"));
const camera = new THREE.PerspectiveCamera();

const silentTag: Tag = {
  rename: vi.fn<() => void>(),
  set: vi.fn<() => void>(),
  show: vi.fn<() => void>(),
};
const silentTags: TagLayer = {
  bubble: () => silentTag,
  dispose: vi.fn<() => void>(),
  name: () => silentTag,
  prompt: () => silentTag,
  reveal: vi.fn<() => void>(),
};
const silentSpeech: BarSpeech = {
  ambient: vi.fn<() => void>(),
  say: vi.fn<() => void>(),
  update: vi.fn<() => void>(),
};

const parkedBike = (x: number, z: number, yaw: number): THREE.Object3D => {
  const bike = new THREE.Object3D();
  bike.position.set(x, 0, z);
  bike.rotation.set(0, yaw, 0);
  return bike;
};

const millimetres = (metres: number): number =>
  Math.round(metres * 10_000) / 10;

describe("every caller seats its riders on the bike's grips and pegs", () => {
  stubCanvases();

  it(
    "the race cast puts each rider's palms and soles on the bike it drew for them",
    { timeout: BUILD_TIMEOUT_MS },
    async () => {
      const assets = await pinnedAssets();
      const stage = createStage(
        assets,
        trackFor("slag-row"),
        SEED,
        presets.lean.shadowMap
      );
      const cast = createCast(stage.world.shading);
      const { castFor, drawRider, dropViews, showCast } = bindCast({
        assets,
        cast,
        stage,
      });
      showCast(castFor(stage, undressed));
      const { riders } = stage.race.view;
      const misses: string[] = [];
      let index = -1;
      for (const rider of riders) {
        index += 1;
        const view = cast.views[index];
        if (!view) {
          throw new Error(
            `The race drew no figure for rider ${String(rider.id)}.`
          );
        }
        cast.subject.s = rider.s;
        for (let frame = 0; frame < FRAMES; frame += 1) {
          drawRider(index, rider, view, 1, SETTLED);
        }
        const worst = worstContact(view.figure.root, view.bike, view.fit);
        if (worst > CONTACT) {
          misses.push(
            `rider ${String(rider.id)} ${String(millimetres(worst))} mm`
          );
        }
      }
      const drawn = cast.views.length;
      dropViews();
      expect(drawn).toBeGreaterThanOrEqual(BUILDS);
      expect(misses).toStrictEqual([]);
    }
  );

  it("the bar walker puts every build's palms and soles on a parked bike", async () => {
    const assets = await pinnedAssets();
    const parent = new THREE.Group();
    const walkers = createWalkers(assets, shading, silentTags, parent);
    const bike = parkedBike(2, -1.5, 0.7);
    const { fit } = assets.bikes.seraph;
    const misses: string[] = [];
    for (let slot = 0; slot < BUILDS; slot += 1) {
      const walker = walkers.at(slot);
      const root = parent.children.at(-1);
      if (!root) {
        throw new Error(`The walker for slot ${String(slot)} drew nothing.`);
      }
      for (let frame = 0; frame < FRAMES; frame += 1) {
        walker.update(
          { place: "bike", pose: null, shoving: 0 },
          {
            heading: 0,
            lean: 0,
            mounted: true,
            pace: 0,
            x: 0,
            z: 0,
          },
          bike,
          fit,
          0,
          SETTLED,
          camera,
          SIZE
        );
      }
      const worst = worstContact(root, bike, fit);
      if (worst > CONTACT) {
        misses.push(`slot ${String(slot)} ${String(millimetres(worst))} mm`);
      }
    }
    walkers.dispose();
    expect(misses).toStrictEqual([]);
  });

  it("the bar cast seats a rider on the hero bike and one on the garage bike", async () => {
    const assets = await pinnedAssets();
    const hero = { bike: parkedBike(-3, 2, 1.2), fit: assets.bikes.ghost.fit };
    const garage = {
      bike: parkedBike(5, -2, -0.4),
      fit: assets.bikes.classic.fit,
    };
    const cast = createBarCast(
      assets,
      shading,
      silentTags,
      silentSpeech,
      { bike: hero.bike, fit: () => hero.fit },
      { bike: garage.bike, fit: () => garage.fit },
      Number.MAX_SAFE_INTEGER,
      false
    );
    for (let frame = 0; frame < FRAMES; frame += 1) {
      cast.update(SETTLED, frame, camera, 0, SIZE, 1);
    }
    const seated = [hero, garage].map(({ bike, fit }) =>
      millimetres(
        Math.min(
          ...cast.group.children.map((root) => worstContact(root, bike, fit))
        )
      )
    );
    cast.dispose();
    expect(seated.filter((worst) => worst >= CONTACT * 1000)).toStrictEqual([]);
  });
});
