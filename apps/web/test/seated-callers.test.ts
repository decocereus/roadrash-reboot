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
const SETTLE_FRAMES = 8;
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

const HEADINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const;
const SAME_GRIP_DEGREES = 0.01;

const palmOnBike = (
  root: THREE.Object3D,
  bike: THREE.Object3D
): THREE.Quaternion => {
  root.updateMatrixWorld(true);
  bike.updateMatrixWorld(true);
  const hand = root.getObjectByName("hand_l");
  if (!hand) {
    throw new Error("The seated rider has no left hand.");
  }
  return bike
    .getWorldQuaternion(new THREE.Quaternion())
    .invert()
    .multiply(hand.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
};

const turnedFromFirst = (
  palms: readonly THREE.Quaternion[]
): readonly number[] => {
  const [first] = palms;
  if (!first) {
    throw new Error("No palm was measured.");
  }
  return palms.map(
    (palm) =>
      Math.round(THREE.MathUtils.radToDeg(first.angleTo(palm)) * 1000) / 1000
  );
};

const offGrip = (turns: readonly number[]) =>
  turns.filter((degrees) => degrees > SAME_GRIP_DEGREES);

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

describe("a rider grips the bike the same way whichever way they faced before mounting", () => {
  stubCanvases();

  it("the bar walker mounts the classic from every heading with the same palm on the grip", async () => {
    const assets = await pinnedAssets();
    const { fit } = assets.bikes.classic;
    const turned: string[] = [];
    for (let slot = 0; slot < BUILDS; slot += 1) {
      const palms = HEADINGS.map((heading) => {
        const parent = new THREE.Group();
        const walkers = createWalkers(assets, shading, silentTags, parent);
        const walker = walkers.at(slot);
        const bike = parkedBike(0, 0, heading);
        const view = { heading, lean: 0, mounted: false, pace: 0, x: 0, z: 0 };
        walker.update(
          { place: "foot", pose: null, shoving: 0 },
          view,
          bike,
          fit,
          0,
          SETTLED,
          camera,
          SIZE
        );
        const mounted = { ...view, mounted: true };
        for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
          walker.update(
            { place: "bike", pose: null, shoving: 0 },
            mounted,
            bike,
            fit,
            frame,
            SETTLED,
            camera,
            SIZE
          );
        }
        const root = parent.children.at(-1);
        if (!root) {
          throw new Error(`The walker for slot ${String(slot)} drew nothing.`);
        }
        const palm = palmOnBike(root, bike);
        walkers.dispose();
        return palm;
      });
      const off = offGrip(turnedFromFirst(palms));
      if (off.length > 0) {
        turned.push(`slot ${String(slot)} turned ${off.join(", ")} degrees`);
      }
    }
    expect(turned).toStrictEqual([]);
  });

  it("the garage rider changes bikes at every heading with the same palm on the grip", async () => {
    const assets = await pinnedAssets();
    const { classic, ghost } = assets.bikes;
    const garageOn = { fit: ghost.fit };
    const palms = HEADINGS.map((heading) => {
      garageOn.fit = ghost.fit;
      const hero = parkedBike(-3, 2, 1.2);
      const garage = parkedBike(5, -2, heading);
      const cast = createBarCast(
        assets,
        shading,
        silentTags,
        silentSpeech,
        { bike: hero, fit: () => ghost.fit },
        { bike: garage, fit: () => garageOn.fit },
        Number.MAX_SAFE_INTEGER,
        false
      );
      for (let frame = 0; frame < FRAMES; frame += 1) {
        cast.update(SETTLED, frame, camera, 0, SIZE, 1);
      }
      garageOn.fit = classic.fit;
      for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
        cast.update(SETTLED, FRAMES + frame, camera, 0, SIZE, 1);
      }
      const [rider] = cast.group.children.toSorted(
        (a, b) =>
          worstContact(a, garage, classic.fit) -
          worstContact(b, garage, classic.fit)
      );
      if (!rider) {
        throw new Error("The bar cast seated nobody on the garage bike.");
      }
      const palm = palmOnBike(rider, garage);
      cast.dispose();
      return palm;
    });
    expect(offGrip(turnedFromFirst(palms))).toStrictEqual([]);
  });
});
