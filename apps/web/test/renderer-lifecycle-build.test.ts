import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createChaseCamera } from "../src/game/chase-camera.ts";
import { bodyFor } from "../src/game/figure-rig.ts";
import { undressed } from "../src/game/figure-wardrobe.ts";
import { createTowerPass } from "../src/game/hud-tower-pass.ts";
import { towerNames } from "../src/game/hud-tower.ts";
import { isMesh, isPoints } from "../src/game/meshes.ts";
import type { Grade } from "../src/game/post.ts";
import { presets } from "../src/game/presets.ts";
import { bindCast, createCast } from "../src/game/rider-views.ts";
import { bindStage, createStage } from "../src/game/scene-lifecycle.ts";
import { drawnNowhere, stubCanvases } from "./canvas-stub.ts";
import { pinnedAssets } from "./pinned-assets.ts";
import { wideView } from "./tower-drawn.ts";
import {
  consumingRenderer,
  motionPreference,
  recordingCanvases,
} from "./tower-pass-stubs.ts";
import { soloPlan } from "./tower-ride.ts";

const SEED = 31;
const BUILD_TIMEOUT_MS = 60_000;
const home = trackFor("slag-row");
const away = trackFor("ridge-road");

const geometriesIn = (
  roots: readonly THREE.Object3D[]
): THREE.BufferGeometry[] => {
  const found = new Set<THREE.BufferGeometry>();
  for (const root of roots) {
    root.traverse((node) => {
      if (isMesh(node) || isPoints(node)) {
        found.add(node.geometry);
      }
    });
  }
  return [...found];
};

const neverCompiled = (): never => {
  throw new Error("The rebuild never compiles.");
};

const onScreen = async () => {
  const assets = await pinnedAssets();
  const stage = createStage(assets, home, SEED, presets.lean.shadowMap);
  stage.world.scene.add(stage.fleet.group);
  const cast = createCast(stage.world.shading);
  const { castFor, dropFleet, dropViews, showCast } = bindCast({
    assets,
    cast,
    stage,
  });
  showCast(castFor(stage, undressed));
  const looks: Grade[] = [];
  const { build } = bindStage({
    assets,
    autopilot: true,
    cast,
    castFor,
    chase: createChaseCamera(),
    clock: { after: () => neverCompiled },
    devRide: undefined,
    pipeline: {
      compile: neverCompiled,
      prepare: neverCompiled,
      render: neverCompiled,
      setLook: (look) => {
        looks.push(look);
      },
      stageOverlay: neverCompiled,
    },
    quality: { preset: presets.lean },
    showCast,
    stage,
  });

  const { bikes, puffs, views } = cast;
  if (!(bikes && puffs)) {
    throw new Error("The race on screen has no bikes.");
  }
  const { fleet, race, world } = stage;
  const kept = () => [
    stage.world === world,
    stage.track === home,
    stage.race === race,
    stage.fleet === fleet,
  ];
  const shown = [
    bikes.group,
    puffs.group,
    stage.fleet.group,
    ...views.map(({ figure }) => figure.root),
  ];
  const retired = [
    bikes,
    puffs,
    fleet,
    world,
    ...views.map(({ figure }) => figure),
  ].map((owner) => vi.spyOn(owner, "dispose"));
  return {
    assets,
    build,
    cast,
    dropFleet,
    dropViews,
    kept,
    looks,
    retired,
    shown,
    stage,
    views,
    world,
  };
};

describe("rebuilding the race on screen", () => {
  stubCanvases();

  it(
    "keeps the race on screen whole and releases all it made when the next race fails to build, then retires the old race once",
    { timeout: BUILD_TIMEOUT_MS },
    async () => {
      const {
        assets,
        build,
        cast,
        dropFleet,
        dropViews,
        kept,
        looks,
        retired,
        shown,
        stage,
        views,
        world,
      } = await onScreen();

      const setup = defaultSetup(away, SEED);
      const last = createRaceRun(setup).view.riders.findLast(
        (rider) => rider.id !== PLAYER_RIDER
      );
      if (!last) {
        throw new Error("The next race has no riders.");
      }
      const body = bodyFor(assets, last.id);
      const broken = new Map([
        [
          last.id,
          {
            body: {
              ...body,
              primitives: [
                ...body.primitives,
                {
                  geometry: new THREE.BoxGeometry(),
                  slot: "stall_cel" as const,
                },
              ],
            },
            suit: 0,
          },
        ],
      ]);
      const firstMade = new THREE.BufferGeometry().id;
      const attached = vi.spyOn(THREE.Object3D.prototype, "add");
      const released = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
      expect(() => build(setup, broken, true)).toThrow(
        "The stall_cel part keeps the colours it was modelled with."
      );
      const made = geometriesIn(attached.mock.calls.flat()).filter(
        (geometry) => geometry.id > firstMade
      );
      const freed = new Set<unknown>(released.mock.contexts);
      attached.mockRestore();
      released.mockRestore();

      expect({
        kept: kept(),
        leaked: made.filter((geometry) => !freed.has(geometry)).length,
        looked: looks.length,
        made: made.length > 0,
        retired: retired.map((spy) => spy.mock.calls.length),
        shown: shown.map((root) => root.parent === world.scene),
        views: cast.views === views,
      }).toStrictEqual({
        kept: kept().map(() => true),
        leaked: 0,
        looked: 0,
        made: true,
        retired: retired.map(() => 0),
        shown: shown.map(() => true),
        views: true,
      });

      build(setup, undressed, true)();
      expect({
        looked: looks.map((look) => look === stage.world.clock.hour),
        retired: retired.map((spy) => spy.mock.calls.length),
        track: stage.track === away,
      }).toStrictEqual({
        looked: [true],
        retired: retired.map(() => 1),
        track: true,
      });

      dropViews();
      dropFleet();
      stage.world.dispose();
    }
  );

  it(
    "keeps the race on screen whole when the tower cannot bake the next race's names, then the retry bakes them and the first draw bakes nothing",
    { timeout: BUILD_TIMEOUT_MS },
    async () => {
      const {
        build,
        dropFleet,
        dropViews,
        kept,
        retired,
        shown,
        stage,
        world,
      } = await onScreen();
      const canvases = recordingCanvases();
      const recorded = (draw: () => void) => {
        vi.stubGlobal("document", { createElement: canvases.createElement });
        try {
          draw();
        } finally {
          vi.stubGlobal("document", drawnNowhere);
        }
      };
      vi.stubGlobal("matchMedia", () => motionPreference().media);
      vi.stubGlobal("devicePixelRatio", 1);
      const pass = createTowerPass(consumingRenderer().renderer);
      pass.resize(wideView.width, wideView.height, 1);
      recorded(() => {
        pass.bake(towerNames(soloPlan, stage));
      });
      const bakeTower = (race: Pick<typeof stage, "me" | "race">) => {
        recorded(() => {
          pass.bake(towerNames(soloPlan, race));
        });
      };
      const firstMade = new THREE.BufferGeometry().id;
      const attached = vi.spyOn(THREE.Object3D.prototype, "add");
      const released = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
      canvases.refuseNextRead();
      expect(() =>
        build(soloPlan.setup, undressed, true, null, bakeTower)
      ).toThrow("The test canvas refused the atlas read.");
      const made = geometriesIn(attached.mock.calls.flat()).filter(
        (geometry) => geometry.id > firstMade
      );
      const freed = new Set<unknown>(released.mock.contexts);
      attached.mockRestore();
      released.mockRestore();
      const failed = {
        kept: kept(),
        leaked: made.filter((geometry) => !freed.has(geometry)).length,
        retired: retired.map((spy) => spy.mock.calls.length),
        shown: shown.map((root) => root.parent === world.scene),
      };
      const reads = canvases.reads();
      build(soloPlan.setup, undressed, true, null, bakeTower)();
      const retried = canvases.reads() - reads;
      pass.show(
        [...towerNames(soloPlan, stage)].map(([id, name], at) => ({
          chip: 0,
          finished: false,
          id,
          mark: at === 0 ? ("lead" as const) : ("gap" as const),
          name,
          place: at + 1,
          tenths: at,
          you: id === stage.me,
        }))
      );
      recorded(pass.render);
      expect({
        drawn: canvases.reads() - reads - retried,
        failed,
        retired: retired.map((spy) => spy.mock.calls.length),
        retried,
      }).toStrictEqual({
        drawn: 0,
        failed: {
          kept: kept().map(() => true),
          leaked: 0,
          retired: retired.map(() => 0),
          shown: shown.map(() => true),
        },
        retired: retired.map(() => 1),
        retried: 3,
      });
      pass.dispose();
      dropViews();
      dropFleet();
      stage.world.dispose();
    }
  );
});
