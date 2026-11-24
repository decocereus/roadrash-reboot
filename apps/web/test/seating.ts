import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { isDeepStrictEqual, parseArgs } from "node:util";

import "./node-images.ts";
import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import { deckOf } from "../src/game/bike-deck.ts";
import { BIKE_TURN } from "../src/game/bike-fit.ts";
import { bikeModelIds } from "../src/game/bike-models.ts";
import { createShading } from "../src/game/cel.ts";
import { paletteOf } from "../src/game/figure-rig.ts";
import type { SeatFit } from "../src/game/figure-seating.ts";
import { lookOf } from "../src/game/looks.ts";
import { createRiderFigure, unfitted } from "../src/game/rider-figure.ts";
import { artFile } from "./art-files.ts";
import pullArt from "./pull-art.ts";

const table = new URL("../src/game/seat-table.json", import.meta.url);
const PLACES = 9;

const placed = (value: number) => Number(value.toFixed(PLACES));
const allPlaced = (values: readonly number[]) => values.map(placed);
const hungPlaced = ({ share, spine }: SeatFit["hang"]["left"]) => ({
  share: placed(share),
  spine: allPlaced(spine),
});
const fitPlaced = (fit: SeatFit): SeatFit => ({
  elbowsIn: placed(fit.elbowsIn),
  hang: { left: hungPlaced(fit.hang.left), right: hungPlaced(fit.hang.right) },
  rest: allPlaced(fit.rest),
  slide: allPlaced(fit.slide),
  tuck: allPlaced(fit.tuck),
  tuckedHang: {
    left: hungPlaced(fit.tuckedHang.left),
    right: hungPlaced(fit.tuckedHang.right),
  },
});
const SOLVER_HOMES = new Set([
  "apps/web/src/game/figure-seating.ts",
  "apps/web/src/game/rider-figure.ts",
]);

const { values } = parseArgs({
  options: { check: { default: false, type: "boolean" } },
});

pullArt();

const bikes = await Promise.all(
  bikeModelIds.map(async (model) => {
    const url = modelUrls.bikes[model];
    const { value } = await assetParsers.bike(model)(artFile(url), url);
    const deck = deckOf(
      [...value.parts.values()].flat().map(({ geometry }) => geometry),
      BIKE_TURN
    );
    return { deck, fit: value.fit, model };
  })
);

const shading = createShading(lookOf("salt-coast"));
const riders = await Promise.all(
  [...modelUrls.figures, ...Object.values(modelUrls.celebrities)]
    .toSorted()
    .map(async (url) => {
      const { value } = await assetParsers.rider(artFile(url), url);
      return { asset: value, url };
    })
);

const fits = Object.fromEntries(
  riders.map(({ asset, url }) => {
    const figure = createRiderFigure(asset, shading, paletteOf(0), unfitted);
    const byModel = Object.fromEntries(
      bikes.map(({ deck, fit, model }) => [
        model,
        fitPlaced(figure.fitSeat(fit, deck)),
      ])
    );
    figure.dispose();
    return [url, byModel];
  })
);

const written = `${JSON.stringify(fits)}\n`;

if (values.check) {
  const callers = spawnSync(
    "git",
    [
      "grep",
      "-l",
      "-w",
      "-e",
      "fitSeat",
      "-e",
      "seatFitOn",
      "--",
      "apps",
      "packages",
      ":!apps/web/test",
      ":!*.test.ts",
    ],
    { encoding: "utf-8" }
  )
    .stdout.split("\n")
    .filter((file) => file !== "" && !SOLVER_HOMES.has(file));
  if (callers.length > 0) {
    console.error(
      `The seat fit runs only in apps/web/test/seating.ts, but ${callers.join(", ")} calls it. Read the fit from the seat table.`
    );
    process.exit(1);
  }
  if (
    !isDeepStrictEqual(
      JSON.parse(readFileSync(table, "utf-8")),
      JSON.parse(written)
    )
  ) {
    console.error(
      "apps/web/src/game/seat-table.json differs from what the seat fit gives for the shipped riders and bikes. Run pnpm seating."
    );
    process.exit(1);
  }
  console.log(
    "ok   apps/web/src/game/seat-table.json matches the seat fit for every rider and bike"
  );
} else {
  writeFileSync(table, written);
  execFileSync("pnpm", ["exec", "oxfmt", table.pathname], { stdio: "inherit" });
  console.log("wrote apps/web/src/game/seat-table.json");
}
