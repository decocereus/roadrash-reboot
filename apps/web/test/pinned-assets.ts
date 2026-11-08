import { celebrityIds } from "@racer/sim/cast";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { Assets, RiderAsset } from "../src/game/assets.ts";
import { artFile } from "./art-files.ts";

export const pinnedAssets = async (): Promise<Assets> => {
  const [riderA, riderB, riderC] = modelUrls.figures;
  const { classic, ghost, oni, seraph } = modelUrls.bikes;
  const { car, stalls, truck, van, walkers } = modelUrls;
  const [bikeA, bikeB, bikeC, bikeD, cars, trucks, vans, a, b, c, people, kit] =
    await Promise.all([
      assetParsers.parts(artFile(classic), classic),
      assetParsers.parts(artFile(ghost), ghost),
      assetParsers.parts(artFile(oni), oni),
      assetParsers.parts(artFile(seraph), seraph),
      assetParsers.whole(artFile(car), car),
      assetParsers.whole(artFile(truck), truck),
      assetParsers.whole(artFile(van), van),
      assetParsers.rider(artFile(riderA), riderA),
      assetParsers.rider(artFile(riderB), riderB),
      assetParsers.rider(artFile(riderC), riderC),
      assetParsers.walkers(artFile(walkers), walkers),
      assetParsers.parts(artFile(stalls), stalls),
    ]);
  return {
    bikes: {
      classic: bikeA.value,
      ghost: bikeB.value,
      oni: bikeC.value,
      seraph: bikeD.value,
    },
    car: cars.value,
    figures: [a.value, b.value, c.value],
    stalls: kit.value,
    truck: trucks.value,
    van: vans.value,
    walkers: people.value,
  };
};

export const pinnedCelebrities = async (): Promise<RiderAsset[]> =>
  await Promise.all(
    celebrityIds.map(async (id) => {
      const url = modelUrls.celebrities[id];
      const { value } = await assetParsers.rider(artFile(url), url);
      return value;
    })
  );
