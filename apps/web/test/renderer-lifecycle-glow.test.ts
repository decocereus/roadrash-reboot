import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createBikes } from "../src/game/actors.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { createFleet } from "../src/game/fleet.ts";
import { lookOf } from "../src/game/looks.ts";
import { isMesh } from "../src/game/meshes.ts";
import { pinnedAssets } from "./pinned-assets.ts";
import { counted, rampOf } from "./renderer-lifecycle-owners.ts";

const track = trackFor("slag-row");

const glowsIn = (root: THREE.Object3D): THREE.MeshBasicMaterial[] => {
  const found = new Set<THREE.MeshBasicMaterial>();
  root.traverse((node) => {
    if (isMesh(node) && node.material instanceof THREE.MeshBasicMaterial) {
      found.add(node.material);
    }
  });
  return [...found];
};

describe("night glow owners", () => {
  it("stops lighting a retired fleet's and bike's glow when a race on the same road rebuilds its actors", async () => {
    const look = lookOf(track.plan.region);
    const shading = createShading(look);
    const ramp = counted(rampOf(shading.paint(null)));
    const assets = await pinnedAssets();
    const race = createRaceRun(defaultSetup(track, 3));
    const world = shading.lit();
    const build = () => ({
      bikes: createBikes(assets, shading, [
        { model: bikeModelIds[0], paint: 0, police: true },
      ]),
      fleet: createFleet(assets, shading, race.view.cars, race.view.crossCars),
    });
    const first = build();
    const retired = [
      ...glowsIn(first.fleet.group),
      ...glowsIn(first.bikes.group),
    ];
    const lit = shading.lit();
    first.fleet.dispose();
    first.bikes.dispose();
    const afterRetiring = shading.lit();
    for (const material of retired) {
      material.color.setRGB(0.25, 0.5, 0.75);
    }
    const second = build();
    const rebuilt = shading.lit();
    shading.relight({ ...look, glow: 2 });
    const marked = new THREE.Color(0.25, 0.5, 0.75).getHexString();
    second.fleet.dispose();
    second.bikes.dispose();
    expect({
      afterRetiring,
      lit: lit > world && retired.length > 0,
      rampReleases: ramp.count,
      rebuilt,
      retiredColours: retired.map((material) => material.color.getHexString()),
      settled: shading.lit(),
    }).toStrictEqual({
      afterRetiring: world,
      lit: true,
      rampReleases: 0,
      rebuilt: lit,
      retiredColours: retired.map(() => marked),
      settled: world,
    });
    shading.dispose();
  });
});
