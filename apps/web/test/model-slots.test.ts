import { riderBlocks } from "@racer/sim/palette";
import { defaultSetup } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { createBikes } from "../src/game/actors.ts";
import { assetParsers } from "../src/game/assets.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { bodyFor, paletteOf } from "../src/game/figure-rig.ts";
import { createFleet } from "../src/game/fleet.ts";
import { lookOf } from "../src/game/looks.ts";
import { blockPaletteOf } from "../src/game/rider-blocks.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import { artFile } from "./art-files.ts";
import { pinnedAssets, pinnedCelebrities } from "./pinned-assets.ts";

const offsetsOf = (bytes: Uint8Array, named: Uint8Array): number[] => {
  const [lead = 0] = named;
  const offsets: number[] = [];
  for (
    let at = bytes.indexOf(lead);
    at !== -1;
    at = bytes.indexOf(lead, at + 1)
  ) {
    if (named.every((byte, index) => bytes[at + index] === byte)) {
      offsets.push(at);
    }
  }
  return offsets;
};

const nameBytes = (name: string): Uint8Array =>
  new TextEncoder().encode(`"name":"${name}"`);

const renamedMaterial = (
  glb: ArrayBuffer,
  from: string,
  to: string
): ArrayBuffer => {
  const bytes = new Uint8Array(structuredClone(glb));
  const named = nameBytes(from);
  const renamed = nameBytes(to);
  const [at, ...more] = offsetsOf(bytes, named);
  if (at === undefined || more.length > 0 || renamed.length !== named.length) {
    throw new Error(`The model does not name exactly one ${from} material.`);
  }
  bytes.set(renamed, at);
  return bytes.buffer;
};

describe("model colour slots", () => {
  it("refuses a model with a part painted in a slot no policy covers", async () => {
    const url = modelUrls.bikes.classic;
    const renamed = renamedMaterial(artFile(url), "plate", "brass");
    await expect(assetParsers.parts(renamed, url)).rejects.toThrow(
      `The model ${url} paints a part "brass", which no slot policy covers.`
    );
  });

  it("paints every part of every shipped car, van, truck, bike and rider through the palettes the game gives them", async () => {
    const assets = await pinnedAssets();
    const celebrities = await pinnedCelebrities();
    const shading = createShading(lookOf("salt-coast"));
    const race = createRaceRun(defaultSetup(trackFor("breakwater-run"), 3));
    const fleet = createFleet(
      assets,
      shading,
      race.view.cars,
      race.view.crossCars
    );
    const bikes = createBikes(
      assets,
      shading,
      bikeModelIds.map((model) => ({ model, paint: 0, police: true }))
    );
    const [block] = riderBlocks;
    if (!block) {
      throw new Error("The palette has no rider blocks.");
    }
    const palettes = [paletteOf(0), blockPaletteOf(block)];
    const riders = [...assets.figures, ...celebrities];
    const figures = riders.flatMap((rider) =>
      palettes.map((palette) => createRiderFigure(rider, shading, palette))
    );
    expect({
      carriers: race.view.cars.some((car) => car.carrier),
      figures: figures.length,
    }).toStrictEqual({
      carriers: true,
      figures: riders.length * palettes.length,
    });
    for (const figure of figures) {
      figure.dispose();
    }
    bikes.dispose();
    fleet.dispose();
    shading.dispose();
  });

  it("refuses to paint a part its palette has no colour for", async () => {
    const assets = await pinnedAssets();
    const shading = createShading(lookOf("salt-coast"));
    const palette = new Map(paletteOf(0));
    palette.delete("helmet");
    expect(() =>
      createRiderFigure(bodyFor(assets, 0), shading, palette)
    ).toThrow("The helmet part has no colour in its palette.");
    shading.dispose();
  });
});
