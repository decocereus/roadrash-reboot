import { defaultSetup } from "@racer/sim/race";
import { PLAYER_RIDER, rosterOf } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { celebrityLoader } from "../src/asset-load.ts";
import { createAssetRuntime } from "../src/asset-runtime.ts";
import type { Fonts, Transport } from "../src/assets/load.ts";
import { modelUrls } from "../src/assets/model-urls.ts";
import type { AssetParsers, RiderAsset } from "../src/game/assets.ts";
import { createWardrobe } from "../src/game/figure-wardrobe.ts";
import type { Dressing } from "../src/game/figure-wardrobe.ts";
import { wearingFrom, wornBy } from "../src/game/figure-wear.ts";

const setup = defaultSetup(trackFor("ridge-road", 1), 3);
const { rivals } = rosterOf(setup);
const { kylie, musk } = modelUrls.celebrities;

const wearing = (search: string) => wornBy(wearingFrom(search), setup);

const fakeRider = (): RiderAsset => ({
  atlas: null,
  bones: [],
  poses: new Map(),
  primitives: [],
  scene: new THREE.Object3D(),
  seat: new THREE.Vector3(),
  standHeight: 0,
});

const readyFonts: Fonts = { load: async () => await Promise.resolve([]) };

const counted = () => {
  const counts = new Map<string, number>();
  const add = (url: string) => {
    counts.set(url, (counts.get(url) ?? 0) + 1);
  };
  return { add, counts };
};

const onlyRiders = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error("A race loads only riders.");
};

const wardrobeOf = (answer: (url: string) => Promise<Response>) => {
  const fetched = counted();
  const decoded = counted();
  const released = counted();
  const transport: Transport = {
    fetch: async (url) => {
      fetched.add(url);
      return await answer(url);
    },
  };
  const rider: AssetParsers["rider"] = async (_, url) => {
    decoded.add(url);
    return await Promise.resolve({
      release: () => {
        released.add(url);
      },
      value: fakeRider(),
    });
  };
  const runtime = createAssetRuntime(
    { fonts: readyFonts, transport },
    new Map(),
    modelUrls
  );
  const wardrobe = createWardrobe(
    celebrityLoader(
      runtime.mountCelebrity,
      Promise.resolve({
        assetParsers: { parts: onlyRiders, rider, whole: onlyRiders },
      })
    )
  );
  const tally = () => ({
    decoded: Object.fromEntries(decoded.counts),
    fetched: Object.fromEntries(fetched.counts),
    released: Object.fromEntries(released.counts),
  });
  return { tally, wardrobe };
};

const served = async (url: string): Promise<Response> =>
  await Promise.resolve(new Response(new TextEncoder().encode(url)));

const dressed = (dressing: Dressing | null): Dressing => {
  if (dressing === null) {
    throw new Error("The race got no dressing.");
  }
  return dressing;
};

describe("celebrity models load per race", () => {
  it("fetches and parses no celebrity for a plain race", async () => {
    const { tally, wardrobe } = wardrobeOf(served);
    const dressing = dressed(await wardrobe.dress(wearing("")));
    expect({ dressed: dressing.size, ...tally() }).toStrictEqual({
      decoded: {},
      dressed: 0,
      fetched: {},
      released: {},
    });
  });

  it("loads only the celebrities a race names, once each, and a second race with them fetches and parses nothing", async () => {
    const { tally, wardrobe } = wardrobeOf(served);
    const worn = wearing("?as=kylie&against=musk,kylie");
    const first = dressed(await wardrobe.dress(worn));
    wardrobe.keep(first);
    const second = dressed(await wardrobe.dress(worn));
    const [asKylie, asMusk, againKylie] = [...first.values()];
    expect({
      riders: [...first.keys()],
      sameAssets: [...worn.keys()].every(
        (rider) => first.get(rider) === second.get(rider)
      ),
      shared: asKylie === againKylie && asKylie !== asMusk,
      ...tally(),
    }).toStrictEqual({
      decoded: { [kylie]: 1, [musk]: 1 },
      fetched: { [kylie]: 1, [musk]: 1 },
      released: {},
      riders: [PLAYER_RIDER, rivals[0], rivals[1]],
      sameAssets: true,
      shared: true,
    });
  });

  it("releases a celebrity once when the next race stops wearing it, then parses it again from the cached bytes", async () => {
    const { tally, wardrobe } = wardrobeOf(served);
    wardrobe.keep(
      dressed(await wardrobe.dress(wearing("?as=kylie&against=musk")))
    );
    wardrobe.keep(dressed(await wardrobe.dress(wearing("?as=kylie"))));
    const left = tally().released;
    wardrobe.keep(dressed(await wardrobe.dress(wearing("?against=musk"))));
    expect({ left, ...tally() }).toStrictEqual({
      decoded: { [kylie]: 1, [musk]: 2 },
      fetched: { [kylie]: 1, [musk]: 1 },
      left: { [musk]: 1 },
      released: { [kylie]: 1, [musk]: 1 },
    });
  });

  it("releases every held celebrity once when the game goes, and a race still loading gets no dressing", async () => {
    const stalled = Promise.withResolvers<Response>();
    const { tally, wardrobe } = wardrobeOf(async (url) =>
      url === musk ? await stalled.promise : await served(url)
    );
    wardrobe.keep(dressed(await wardrobe.dress(wearing("?as=kylie"))));
    const loading = wardrobe.dress(wearing("?against=musk"));
    wardrobe.dispose();
    wardrobe.dispose();
    await expect(loading).resolves.toBeNull();
    expect(tally()).toStrictEqual({
      decoded: { [kylie]: 1 },
      fetched: { [kylie]: 1, [musk]: 1 },
      released: { [kylie]: 1 },
    });
  });

  it("fails the race's dressing when a celebrity cannot load, and the next race fetches it again", async () => {
    const refusals = { left: 1 };
    const { tally, wardrobe } = wardrobeOf(async (url) => {
      if (url === musk && refusals.left > 0) {
        refusals.left -= 1;
        return await Promise.resolve(new Response(null, { status: 404 }));
      }
      return await served(url);
    });
    await expect(wardrobe.dress(wearing("?against=musk"))).rejects.toThrow(
      `The model ${musk} answered 404.`
    );
    const retried = dressed(await wardrobe.dress(wearing("?against=musk")));
    expect({ dressed: retried.size, ...tally() }).toStrictEqual({
      decoded: { [musk]: 1 },
      dressed: 1,
      fetched: { [musk]: 2 },
      released: {},
    });
  });
});
