import { setImmediate as nextTurn } from "node:timers/promises";

import { celebrityIds } from "@racer/sim/cast";
import { describe, expect, it, vi } from "vitest";

import { celebrityLoader } from "../src/asset-load.ts";
import type { AssetRequest } from "../src/asset-load.ts";
import { createAssetRuntime } from "../src/asset-runtime.ts";
import type { ByteCache, Fonts, Transport } from "../src/assets/load.ts";
import { ModelDecodeFailed } from "../src/assets/model-decode-failed.ts";
import { modelUrls } from "../src/assets/model-urls.ts";
import type { ModelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { AssetParsers, Assets } from "../src/game/assets.ts";
import { artFile } from "./art-files.ts";
import characterization from "./asset-characterization.json" with { type: "json" };
import { parsingOf } from "./asset-parsing.ts";
import type { Decode } from "./asset-parsing.ts";
import { summary } from "./asset-summary.ts";

const urls: ModelUrls = {
  bikes: {
    classic: "/models/bike.glb",
    ghost: "/models/ghost.glb",
    oni: "/models/oni.glb",
    seraph: "/models/seraph.glb",
  },
  car: "/models/car.glb",
  celebrities: modelUrls.celebrities,
  figures: [
    "/models/rider_a.glb",
    "/models/rider_b.glb",
    "/models/rider_c.glb",
  ],
  moves: "/models/rider_moves.glb",
  stalls: "/models/stalls.glb",
  truck: "/models/truck.glb",
  van: "/models/van.glb",
  walkers: "/models/pedestrians.glb",
};

const bikeUrl = urls.bikes.classic;
const everyUrl = [
  ...Object.values(urls.bikes),
  urls.car,
  urls.truck,
  urls.stalls,
  urls.van,
  urls.walkers,
  urls.moves,
  ...urls.figures,
].toSorted();
const onceEach = everyUrl.map(() => 1);

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
  it("loads every model and keeps them until the owner releases them, once each", async () => {
    const fetches = fetchesOf();
    const parsing = parsingOf();
    const mounted = mount(runtimeOf(fetches, new Map()), parsing.parsers);
    const outcome = await loadedOf(mounted);
    expect({
      bikes: Object.keys(outcome.assets.bikes).toSorted(),
      fetched: [...fetches.calls.keys()].toSorted(),
      figures: outcome.assets.figures.length,
    }).toStrictEqual({
      bikes: ["classic", "ghost", "oni", "seraph"],
      fetched: everyUrl,
      figures: 3,
    });
    await nextTurn();
    expect(totalOf(parsing.releases)).toBe(0);
    outcome.release();
    outcome.release();
    mounted.abort();
    await nextTurn();
    expect([...parsing.releases.values()]).toStrictEqual(onceEach);
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
    }).toStrictEqual({
      decodes: 1,
      fetched: everyUrl.length,
      kind: "loaded",
    });
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
    await until(() => parsing.decodes.size === everyUrl.length);
    mounted.abort();
    await nextTurn();
    expect(mounted.settled).toStrictEqual([]);
    late.resolve(null);
    await expect(mounted.outcome).resolves.toStrictEqual({
      kind: "interrupted",
    });
    expect([...parsing.releases.values()]).toStrictEqual(onceEach);
  });

  it("releases every finished sibling and the late one when one model fails", async () => {
    const late = Promise.withResolvers<null>();
    const parsing = parsingOf(
      new Map<string, readonly Decode[]>([
        [urls.figures[2], [async () => await late.promise]],
        [urls.figures[1], [broken]],
      ])
    );
    const mounted = mount(runtimeOf(fetchesOf(), new Map()), parsing.parsers);
    await until(() => parsing.decodes.size === everyUrl.length);
    await nextTurn();
    late.resolve(null);
    const outcome = await mounted.outcome;
    expect(outcome).toHaveProperty(
      ["error", "message"],
      "The rider model has no poses."
    );
    expect({
      broken: parsing.releases.has(urls.figures[1]),
      counts: [...parsing.releases.values()],
    }).toStrictEqual({ broken: false, counts: onceEach.slice(1) });
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
    expect(
      mounted.fallbacks.map((failure) => ({
        cause: failure.cause,
        font: "font" in failure ? failure.font : null,
        message: failure.message,
      }))
    ).toStrictEqual(
      ["800", "700"].map((weight) => ({
        cause: gone,
        font: `${weight} 40px "Saira Extra Condensed"`,
        message: "The font is gone.",
      }))
    );
  });

  it("waits for the tower's 700 face to settle when the 800 face fails first", async () => {
    const gone = new Error("The 800 face is gone.");
    const tower = Promise.withResolvers<FontFace[]>();
    const fonts: Fonts = {
      load: async (font) => {
        if (font.startsWith("800")) {
          throw gone;
        }
        return await tower.promise;
      },
    };
    const parsing = parsingOf();
    const mounted = mount(
      runtimeOf(fetchesOf(), new Map(), fonts),
      parsing.parsers
    );
    await until(() => totalOf(parsing.decodes) === onceEach.length);
    await nextTurn();
    await nextTurn();
    expect(mounted.settled).toStrictEqual([]);
    tower.resolve([]);
    await expect(mounted.outcome).resolves.toHaveProperty("kind", "loaded");
    expect(mounted.fallbacks.map((failure) => failure.message)).toStrictEqual([
      "The 800 face is gone.",
    ]);
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
    expect([...parsing.releases.values()]).toStrictEqual(onceEach);
  });
});

const pinned: Transport = {
  fetch: async (url) => await Promise.resolve(new Response(artFile(url))),
};

const fitNodeNames = [
  "fit_seat",
  "fit_grip_l",
  "fit_grip_r",
  "fit_peg_l",
  "fit_peg_r",
] as const;

const withoutNode = (
  file: ArrayBuffer,
  name: string
): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(file);
  const text = new TextDecoder("latin1").decode(bytes);
  const quoted = `"${name}"`;
  const at = text.indexOf(quoted);
  if (at === -1 || text.includes(quoted, at + 1)) {
    throw new Error(`The bike model names ${name} other than once.`);
  }
  const renamed = new Uint8Array(bytes.byteLength);
  renamed.set(bytes);
  renamed.set(new TextEncoder().encode(`"${"x".repeat(name.length)}"`), at);
  return renamed;
};

describe("the real parser on the pinned models", () => {
  it.each(fitNodeNames)(
    "refuses a bike without its %s point instead of seating riders on zeros",
    async (name) => {
      const bike = modelUrls.bikes.classic;
      const fetches = new Map<string, number>();
      const runtime = createAssetRuntime(
        {
          fonts: readyFonts,
          transport: {
            fetch: async (url) => {
              fetches.set(url, (fetches.get(url) ?? 0) + 1);
              const bytes = artFile(url);
              return await Promise.resolve(
                new Response(url === bike ? withoutNode(bytes, name) : bytes)
              );
            },
          },
        },
        new Map(),
        modelUrls
      );
      const outcome = await mount(runtime, assetParsers).outcome;
      if (outcome.kind !== "failed") {
        throw new Error(`The mount ended ${outcome.kind}.`);
      }
      const { error } = outcome;
      if (!(error instanceof ModelDecodeFailed)) {
        throw new Error(`The mount failed with ${error.name}.`, {
          cause: error,
        });
      }
      expect({
        fetched: fetches.get(bike),
        message: error.message,
        url: error.url,
      }).toStrictEqual({
        fetched: 1,
        message: `The bike model ${bike} has no ${name} point.`,
        url: bike,
      });
    }
  );

  it("decodes the same assets as before the Effect boundary and releases their geometry and atlases", async () => {
    const runtime = createAssetRuntime(
      { fonts: readyFonts, transport: pinned },
      new Map(),
      modelUrls
    );
    const outcome = await loadedOf(mount(runtime, assetParsers));
    const load = celebrityLoader(
      runtime.mountCelebrity,
      Promise.resolve({ assetParsers })
    );
    const celebrities = await Promise.all(
      celebrityIds.map(async (id) => {
        const decoded = await load(id, new AbortController().signal);
        if (!decoded) {
          throw new Error(`The ${id} load was interrupted.`);
        }
        return { id, ...decoded };
      })
    );
    const worn = celebrities.map(({ value }) => value);
    expect(summary(outcome.assets, celebrities)).toStrictEqual(
      characterization
    );
    const released: string[] = [];
    for (const primitive of outcome.assets.car) {
      primitive.geometry.addEventListener("dispose", () => {
        released.push(primitive.slot);
      });
    }
    const freed = worn.map((rider) => {
      const seen = { count: 0 };
      rider.atlas?.addEventListener("dispose", () => {
        seen.count += 1;
      });
      return seen;
    });
    const closes = vi.spyOn(ImageBitmap.prototype, "close");
    outcome.release();
    for (const celebrity of celebrities) {
      celebrity.release();
    }
    await nextTurn();
    const closed = worn.map(
      ({ atlas }) =>
        closes.mock.contexts.filter((bitmap) => bitmap === atlas?.image).length
    );
    expect({
      closed,
      freed: freed.map(({ count }) => count),
      released,
    }).toStrictEqual({
      closed: worn.map(() => 1),
      freed: worn.map(() => 1),
      released: outcome.assets.car.map((each) => each.slot),
    });
  });
});
