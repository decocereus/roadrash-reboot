import { readFileSync } from "node:fs";
import path from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { AssetRequest } from "../src/asset-load.ts";
import { createAssetRuntime } from "../src/asset-runtime.ts";
import type { ByteCache, Fonts, Transport } from "../src/assets/load.ts";
import { modelUrls } from "../src/assets/model-urls.ts";
import type { ModelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import type {
  AssetParsers,
  Assets,
  BikeParts,
  Decoded,
  Primitive,
  RiderAsset,
} from "../src/game/assets.ts";
import characterization from "./asset-characterization.json" with { type: "json" };

const urls: ModelUrls = {
  bikes: {
    classic: "/models/bike.glb",
    ghost: "/models/ghost.glb",
    oni: "/models/oni.glb",
    seraph: "/models/seraph.glb",
  },
  car: "/models/car.glb",
  riders: ["/models/rider_a.glb", "/models/rider_b.glb", "/models/rider_c.glb"],
  van: "/models/van.glb",
};

const bikeUrl = urls.bikes.classic;
const everyUrl = [
  ...Object.values(urls.bikes),
  urls.car,
  urls.van,
  ...urls.riders,
].toSorted();

type Answer = () => Promise<Response>;

interface Fetches {
  readonly calls: Map<string, number>;
  readonly signals: AbortSignal[];
  readonly transport: Transport;
}

const bytesOf =
  (url: string): Answer =>
  async () =>
    await Promise.resolve(new Response(new TextEncoder().encode(url)));

const fetchesOf = (
  script: ReadonlyMap<string, readonly Answer[]> = new Map()
): Fetches => {
  const calls = new Map<string, number>();
  const signals: AbortSignal[] = [];
  const transport: Transport = {
    fetch: async (url, init) => {
      const call = calls.get(url) ?? 0;
      calls.set(url, call + 1);
      if (init.signal) {
        signals.push(init.signal);
      }
      const answer = script.get(url)?.[call] ?? bytesOf(url);
      return await answer();
    },
  };
  return { calls, signals, transport };
};

const readyFonts: Fonts = { load: async () => await Promise.resolve([]) };

const runtimeOf = (fetches: Fetches, cache: ByteCache, fonts = readyFonts) =>
  createAssetRuntime({ fonts, transport: fetches.transport }, cache, urls);

type Outcome =
  | {
      readonly kind: "loaded";
      readonly assets: Assets;
      readonly release: () => void;
    }
  | { readonly kind: "failed"; readonly error: Error }
  | { readonly kind: "interrupted" };

interface Mounted {
  readonly outcome: Promise<Outcome>;
  readonly fallbacks: Error[];
  readonly settled: Outcome[];
  readonly abort: () => void;
}

const mount = (
  runtime: ReturnType<typeof createAssetRuntime>,
  parsers: AssetParsers
): Mounted => {
  const controller = new AbortController();
  const settled: Outcome[] = [];
  const fallbacks: Error[] = [];
  const { promise, resolve } = Promise.withResolvers<Outcome>();
  const settle = (outcome: Outcome) => {
    settled.push(outcome);
    resolve(outcome);
  };
  const request: AssetRequest = {
    failed: (error) => {
      settle({ error, kind: "failed" });
    },
    fontFallback: (error) => {
      fallbacks.push(error);
    },
    interrupted: () => {
      settle({ kind: "interrupted" });
    },
    loaded: (assets, release) => {
      settle({ assets, kind: "loaded", release });
    },
    parsers,
    signal: controller.signal,
  };
  runtime.mount(request);
  return {
    abort: () => {
      controller.abort();
    },
    fallbacks,
    outcome: promise,
    settled,
  };
};

const loadedOf = async (mounted: Mounted) => {
  const outcome = await mounted.outcome;
  if (outcome.kind !== "loaded") {
    throw new Error(`The mount ended ${outcome.kind}.`);
  }
  return outcome;
};

type Decode = () => Promise<null>;

interface Parsing {
  readonly parsers: AssetParsers;
  readonly decodes: Map<string, number>;
  readonly releases: Map<string, number>;
}

const fakeRider = (): RiderAsset => ({
  atlas: null,
  bones: [],
  poses: new Map(),
  primitives: [],
  scene: new THREE.Object3D(),
  seat: new THREE.Vector3(),
  standHeight: 0,
});

const parsingOf = (
  script: ReadonlyMap<string, readonly Decode[]> = new Map()
): Parsing => {
  const decodes = new Map<string, number>();
  const releases = new Map<string, number>();
  const decoded = async <Value>(
    url: string,
    value: Value
  ): Promise<Decoded<Value>> => {
    const call = decodes.get(url) ?? 0;
    decodes.set(url, call + 1);
    await script.get(url)?.[call]?.();
    return {
      release: () => {
        releases.set(url, (releases.get(url) ?? 0) + 1);
      },
      value,
    };
  };
  return {
    decodes,
    parsers: {
      parts: async (_, url) =>
        await decoded(url, new Map<string, readonly Primitive[]>()),
      rider: async (_, url) => await decoded(url, fakeRider()),
      whole: async (_, url) => await decoded<readonly Primitive[]>(url, []),
    },
    releases,
  };
};

const failing =
  (message: string): Answer =>
  async () => {
    await nextTurn();
    throw new TypeError(message);
  };

const status =
  (code: number): Answer =>
  async () =>
    await Promise.resolve(new Response(null, { status: code }));

const brokenBody: Answer = async () =>
  await Promise.resolve(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("The body was cut off."));
        },
      })
    )
  );

const broken: Decode = async () => {
  await nextTurn();
  throw new Error("The rider model has no poses.");
};

const totalOf = (counts: ReadonlyMap<string, number>) =>
  [...counts.values()].reduce((sum, count) => sum + count, 0);

const until = async (test: () => boolean): Promise<void> => {
  if (!test()) {
    await nextTurn();
    await until(test);
  }
};

describe("asset loading through the Effect boundary", () => {
  it("loads nine models and keeps them until the owner releases them, once each", async () => {
    const fetches = fetchesOf();
    const parsing = parsingOf();
    const mounted = mount(runtimeOf(fetches, new Map()), parsing.parsers);
    const outcome = await loadedOf(mounted);
    expect({
      bikes: Object.keys(outcome.assets.bikes).toSorted(),
      fetched: [...fetches.calls.keys()].toSorted(),
      riders: outcome.assets.riders.length,
    }).toStrictEqual({
      bikes: ["classic", "ghost", "oni", "seraph"],
      fetched: everyUrl,
      riders: 3,
    });
    await nextTurn();
    expect(totalOf(parsing.releases)).toBe(0);
    outcome.release();
    outcome.release();
    mounted.abort();
    await nextTurn();
    expect([...parsing.releases.values()]).toStrictEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect({
      fallbacks: mounted.fallbacks,
      settled: mounted.settled.length,
    }).toStrictEqual({ fallbacks: [], settled: 1 });
  });

  it("retries a transport failure, a 5xx answer and a cut body once with a fresh fetch, then caches the bytes", async () => {
    const cache: ByteCache = new Map();
    const fetches = fetchesOf(
      new Map([
        [bikeUrl, [failing("The network is down.")]],
        [urls.car, [status(503)]],
        [urls.van, [brokenBody]],
      ])
    );
    const mounted = mount(runtimeOf(fetches, cache), parsingOf().parsers);
    await expect(mounted.outcome).resolves.toHaveProperty("kind", "loaded");
    expect(
      [bikeUrl, urls.car, urls.van].map((url) => fetches.calls.get(url))
    ).toStrictEqual([2, 2, 2]);
    expect(new TextDecoder().decode(cache.get(urls.car))).toBe(urls.car);
    expect([...cache.keys()].toSorted()).toStrictEqual(everyUrl);
  });

  it("fails after two attempts, caches nothing for that URL, and lets the next owner fetch again", async () => {
    const cache: ByteCache = new Map();
    const down = failing("The network is down.");
    const fetches = fetchesOf(new Map([[urls.van, [down, down]]]));
    const runtime = runtimeOf(fetches, cache);
    const failed = await mount(runtime, parsingOf().parsers).outcome;
    expect(failed).toHaveProperty(["error", "message"], "The network is down.");
    expect({
      cached: cache.has(urls.van),
      calls: fetches.calls.get(urls.van),
    }).toStrictEqual({ cached: false, calls: 2 });
    const second = mount(runtime, parsingOf().parsers);
    await expect(second.outcome).resolves.toHaveProperty("kind", "loaded");
    expect({
      bike: fetches.calls.get(bikeUrl),
      van: fetches.calls.get(urls.van),
    }).toStrictEqual({ bike: 1, van: 3 });
  });

  it("does not retry a 4xx answer and keeps today's failure text", async () => {
    const fetches = fetchesOf(new Map([[urls.car, [status(404)]]]));
    const parsing = parsingOf();
    const outcome = await mount(runtimeOf(fetches, new Map()), parsing.parsers)
      .outcome;
    expect(outcome).toHaveProperty(
      ["error", "message"],
      `The model ${urls.car} answered 404.`
    );
    expect(fetches.calls.get(urls.car)).toBe(1);
    expect(totalOf(parsing.releases)).toBe(totalOf(parsing.decodes));
  });

  it("does not retry a model the real parser rejects, and decodes the cached bytes again for the next owner", async () => {
    const cache: ByteCache = new Map();
    const fetches = fetchesOf();
    const runtime = runtimeOf(fetches, cache);
    const rejecting: AssetParsers = {
      ...parsingOf().parsers,
      whole: assetParsers.whole,
    };
    const first = await mount(runtime, rejecting).outcome;
    expect({
      cached: cache.has(urls.car),
      calls: fetches.calls.get(urls.car),
      kind: first.kind,
    }).toStrictEqual({ cached: true, calls: 1, kind: "failed" });
    const next = parsingOf();
    const second = await mount(runtime, next.parsers).outcome;
    expect({
      decodes: next.decodes.get(urls.car),
      fetched: totalOf(fetches.calls),
      kind: second.kind,
    }).toStrictEqual({ decodes: 1, fetched: 9, kind: "loaded" });
  });

  it("aborts a pending fetch through its real signal and reports only the interruption", async () => {
    const pending = Promise.withResolvers<Response>();
    const fetches = fetchesOf(
      new Map([[bikeUrl, [async () => await pending.promise]]])
    );
    const parsing = parsingOf();
    const mounted = mount(runtimeOf(fetches, new Map()), parsing.parsers);
    await until(() => fetches.calls.has(bikeUrl));
    mounted.abort();
    await expect(mounted.outcome).resolves.toStrictEqual({
      kind: "interrupted",
    });
    expect(fetches.signals.some((signal) => signal.aborted)).toBeTruthy();
    expect({
      bikeDecoded: parsing.decodes.has(bikeUrl),
      calls: fetches.calls.get(bikeUrl),
      unreleased: totalOf(parsing.decodes) - totalOf(parsing.releases),
    }).toStrictEqual({ bikeDecoded: false, calls: 1, unreleased: 0 });
    await nextTurn();
    expect(mounted.settled).toHaveLength(1);
  });

  it("aborts a body that is still downloading through the signal its fetch received", async () => {
    const reading = Promise.withResolvers<null>();
    const received: AbortSignal[] = [];
    const transport: Transport = {
      fetch: async (url, init) => {
        if (url !== bikeUrl) {
          return await bytesOf(url)();
        }
        if (init.signal) {
          received.push(init.signal);
        }
        const body = new ReadableStream<Uint8Array>({
          pull: () => {
            reading.resolve(null);
          },
          start: (controller) => {
            controller.enqueue(new Uint8Array([1]));
          },
        });
        return await Promise.resolve(new Response(body));
      },
    };
    const runtime = createAssetRuntime(
      { fonts: readyFonts, transport },
      new Map(),
      urls
    );
    const mounted = mount(runtime, parsingOf().parsers);
    await reading.promise;
    mounted.abort();
    await expect(mounted.outcome).resolves.toStrictEqual({
      kind: "interrupted",
    });
    expect(received.map((signal) => signal.aborted)).toStrictEqual([true]);
  });

  it("releases a decode that finishes after the mount was aborted, and it never commits", async () => {
    const late = Promise.withResolvers<null>();
    const parsing = parsingOf(
      new Map([[urls.van, [async () => await late.promise]]])
    );
    const mounted = mount(runtimeOf(fetchesOf(), new Map()), parsing.parsers);
    await until(() => parsing.decodes.size === 9);
    mounted.abort();
    await nextTurn();
    expect(mounted.settled).toStrictEqual([]);
    late.resolve(null);
    await expect(mounted.outcome).resolves.toStrictEqual({
      kind: "interrupted",
    });
    expect([...parsing.releases.values()]).toStrictEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it("releases every finished sibling and the late one when one model fails", async () => {
    const late = Promise.withResolvers<null>();
    const parsing = parsingOf(
      new Map<string, readonly Decode[]>([
        [urls.riders[2], [async () => await late.promise]],
        [urls.riders[1], [broken]],
      ])
    );
    const mounted = mount(runtimeOf(fetchesOf(), new Map()), parsing.parsers);
    await until(() => parsing.decodes.size === 9);
    await nextTurn();
    late.resolve(null);
    const outcome = await mounted.outcome;
    expect(outcome).toHaveProperty(
      ["error", "message"],
      "The rider model has no poses."
    );
    expect({
      broken: parsing.releases.has(urls.riders[1]),
      counts: [...parsing.releases.values()],
    }).toStrictEqual({ broken: false, counts: [1, 1, 1, 1, 1, 1, 1, 1] });
  });

  it("keeps loading when the display font fails and hands its cause to the boundary", async () => {
    const gone = new Error("The font is gone.");
    const fonts: Fonts = {
      load: async () => {
        await nextTurn();
        throw gone;
      },
    };
    const mounted = mount(
      runtimeOf(fetchesOf(), new Map(), fonts),
      parsingOf().parsers
    );
    await expect(mounted.outcome).resolves.toHaveProperty("kind", "loaded");
    expect(mounted.fallbacks).toHaveLength(1);
    expect(mounted.fallbacks[0]).toHaveProperty("message", "The font is gone.");
    expect(mounted.fallbacks[0]).toHaveProperty("cause", gone);
  });

  it("releases once when the owner and the unmount release in the same turn as the load", async () => {
    const parsing = parsingOf();
    const controller = new AbortController();
    const done = Promise.withResolvers<null>();
    const settle = () => {
      done.resolve(null);
    };
    runtimeOf(fetchesOf(), new Map()).mount({
      failed: settle,
      fontFallback: settle,
      interrupted: settle,
      loaded: (_, release) => {
        release();
        controller.abort();
        release();
        settle();
      },
      parsers: parsing.parsers,
      signal: controller.signal,
    });
    await done.promise;
    await nextTurn();
    expect([...parsing.releases.values()]).toStrictEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });
});

const plain = (value: number): number => value + 0;

const primitiveSummary = (primitive: Primitive) => {
  const position = primitive.geometry.getAttribute("position");
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    box.expandByPoint(point.fromBufferAttribute(position, index));
  }
  return {
    attributes: Object.keys(primitive.geometry.attributes).toSorted(),
    first: [position.getX(0), position.getY(0), position.getZ(0)].map(plain),
    indices: primitive.geometry.getIndex()?.count ?? 0,
    max: box.max.toArray().map(plain),
    min: box.min.toArray().map(plain),
    slot: primitive.slot,
    vertices: position.count,
  };
};

const riderSummary = (rider: RiderAsset) => {
  let nodes = 0;
  rider.scene.traverse(() => {
    nodes += 1;
  });
  return {
    bones: rider.bones,
    nodes,
    poses: [...rider.poses].map(([name, pose]) => ({
      head: pose.slice(0, 4).map(plain),
      name,
      values: pose.length,
    })),
    primitives: rider.primitives.map(primitiveSummary),
    seat: rider.seat.toArray().map(plain),
    standHeight: plain(rider.standHeight),
  };
};

const partsSummary = (parts: BikeParts) =>
  [...parts].map(([name, primitives]) => ({
    name,
    primitives: primitives.map(primitiveSummary),
  }));

const summary = (assets: Assets) => ({
  bikes: {
    classic: partsSummary(assets.bikes.classic),
    ghost: partsSummary(assets.bikes.ghost),
    oni: partsSummary(assets.bikes.oni),
    seraph: partsSummary(assets.bikes.seraph),
  },
  car: assets.car.map(primitiveSummary),
  riders: assets.riders.map(riderSummary),
  van: assets.van.map(primitiveSummary),
});

const repository = path.join(import.meta.dirname, "../../..");

const pinned: Transport = {
  fetch: async (url) =>
    await Promise.resolve(
      new Response(readFileSync(path.join(repository, url)))
    ),
};

describe("the real parser on the pinned models", () => {
  it("decodes the same assets as before the Effect boundary and releases their geometry", async () => {
    const runtime = createAssetRuntime(
      { fonts: readyFonts, transport: pinned },
      new Map(),
      modelUrls
    );
    const outcome = await loadedOf(mount(runtime, assetParsers));
    expect(summary(outcome.assets)).toStrictEqual(characterization);
    const released: string[] = [];
    for (const primitive of outcome.assets.car) {
      primitive.geometry.addEventListener("dispose", () => {
        released.push(primitive.slot);
      });
    }
    outcome.release();
    await nextTurn();
    expect(released).toStrictEqual(outcome.assets.car.map((each) => each.slot));
  });
});
